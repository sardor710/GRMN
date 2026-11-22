// npm run dev:import [-- --reimport] — loads the committed src/lib/cms/data.json into the local
// PostgreSQL stack.
//
// 1. Base records, once: the legacy importer (scripts/migration/import.ts importSnapshot) runs on the
//    first import under its own namespace. It is strict by design: a changed source raises
//    SOURCE_CHANGED and quarantined rows (e.g. products with 4-decimal compare-at prices or
//    unresolved accessory references) are archived but not normalized. So it is never re-run here;
//    later data.json edits flow through step 2 only.
// 2. Catalog sync, whenever data.json changed (per-product hash) or with --reimport: every product row
//    is upserted by public key (= CMS id), then src/server/catalog/variant-sync.ts writes its options,
//    variants, KZT prices, media (files found under public/ or UPLOAD_DIR) and stock through the
//    inventory ledger. Products removed from data.json are archived, never deleted.
// State (data/product hashes, base run) lives in storage/devdb/import-state.json.
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { DEV_DIR, log, ROOT, withDevDatabase } from "./lib.mjs";

export const NAMESPACE = "garmin-dev-v1";
const DATA_FILE = resolve(ROOT, "src", "lib", "cms", "data.json");
const STATE_FILE = resolve(DEV_DIR, "import-state.json");
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif" };

const sha256 = value => createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
const text = value => typeof value === "string" && value.trim() ? value : null;
const array = value => Array.isArray(value) ? value : [];

async function readState() { try { return JSON.parse(await readFile(STATE_FILE, "utf8")); } catch { return { version: 1, namespace: NAMESPACE, products: {} }; } }

/** Legacy money (KZT major units) rounded to whole tiyn: data.json carries a few float artifacts such as 919.9884999999999. */
function cents(value, warnings, where) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) { warnings.push(`${where}: invalid amount dropped`); return null; }
  const fixed = number.toFixed(2);
  if (Number(fixed) !== number) warnings.push(`${where}: ${value} rounded to ${fixed}`);
  return fixed;
}

function imageFile(src, uploadRoot, cache) {
  if (cache.has(src)) return cache.get(src);
  let file = null;
  const clean = src.split(/[?#]/)[0];
  if (clean.startsWith("/") && !clean.startsWith("//") && !clean.split("/").includes("..")) {
    const path = clean.startsWith("/uploads/") ? resolve(uploadRoot, ...clean.slice("/uploads/".length).split("/")) : resolve(ROOT, "public", ...clean.slice(1).split("/"));
    const base = clean.startsWith("/uploads/") ? uploadRoot : resolve(ROOT, "public");
    const mimeType = MIME[extname(path).toLowerCase()];
    if (mimeType && path.startsWith(base + sep) && existsSync(path) && statSync(path).isFile()) file = { path, mimeType };
  }
  cache.set(src, file);
  return file;
}
async function fileMetadata(file, hashes) {
  if (!file) return null;
  if (!hashes.has(file.path)) { const bytes = await readFile(file.path); hashes.set(file.path, { byteSize: bytes.length, checksumSha256: sha256(bytes), mimeType: file.mimeType }); }
  return hashes.get(file.path);
}

function productStatus(value) { const status = value === "active" ? "published" : value; return ["draft", "published", "archived"].includes(status) ? status : "draft"; }

async function upsertProduct(client, p, syncId) {
  const status = productStatus(p.status);
  const specs = array(p.specs).filter(s => s && typeof s.label === "string" && typeof s.value === "string");
  const features = array(p.features).filter(f => f && typeof f.title === "string" && typeof f.body === "string");
  const fields = [text(p.slug), String(p.name), text(p.description) ?? "", text(p.family), text(p.badge), text(p.priceSuffix), status, p.isFeatured === true, canonical(specs), canonical(features), canonical(array(p.inTheBox).filter(x => typeof x === "string")), canonical(p), text(p.seoTitle), text(p.seoDescription), canonical(array(p.focusKeywords).filter(x => typeof x === "string")), text(p.canonicalUrl), p.noIndex === true, text(p.ogImage)];
  const existing = (await client.query("SELECT id FROM products WHERE public_key=$1 FOR UPDATE", [p.id])).rows[0];
  if (existing) {
    await client.query("UPDATE products SET slug=$2,name=$3,description=$4,family=$5,badge=$6,price_suffix=$7,status=$8,is_featured=$9,specs=$10,features=$11,in_the_box=$12,legacy_content=$13,seo_title=$14,seo_description=$15,focus_keywords=$16,canonical_url=$17,no_index=$18,og_image_source=$19,version=version+1,updated_at=clock_timestamp() WHERE id=$1", [existing.id, ...fields]);
    return { id: existing.id, status, created: false };
  }
  const id = syncId(NAMESPACE, "products", p.id);
  await client.query("INSERT INTO products(id,public_key,slug,name,description,family,badge,price_suffix,status,is_featured,specs,features,in_the_box,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)", [id, p.id, ...fields]);
  return { id, status, created: true };
}

async function variantInput(p, productId, status, hash, context) {
  const warnings = [];
  const variants = array(p.variants).length
    ? p.variants.map(v => {
        const price = cents(v.price, warnings, `${v.sku}.price`) ?? "0";
        let compare = cents(v.originalPrice, warnings, `${v.sku}.originalPrice`);
        if (compare !== null && Number(compare) < Number(price)) { warnings.push(`${v.sku}: compare-at below price dropped`); compare = null; }
        return { ...v, price, originalPrice: compare, stock: Number.isInteger(v.stock) && v.stock >= 0 ? v.stock : 0 };
      })
    : [(() => {
        const price = cents(p.price, warnings, `${p.sku}.price`) ?? "0";
        let compare = cents(p.originalPrice, warnings, `${p.sku}.originalPrice`);
        if (compare !== null && Number(compare) < Number(price)) { warnings.push(`${p.sku}: compare-at below price dropped`); compare = null; }
        return { id: "default", sku: String(p.sku), title: null, selections: {}, price, originalPrice: compare, stock: Number.isInteger(p.stock) && p.stock >= 0 ? p.stock : 0, status: status === "published" ? "active" : status === "archived" ? "archived" : "draft", isDefault: true, imageIds: [] };
      })()];
  const sourceImages = array(p.images).length ? p.images : text(p.image) ? [{ id: "primary", src: p.image, alt: p.name }] : [];
  const images = [];
  for (const image of sourceImages) {
    if (!image || typeof image.src !== "string" || typeof image.id !== "string") continue;
    const file = await fileMetadata(imageFile(image.src, context.uploadRoot, context.files), context.hashes);
    images.push({ id: image.id, src: image.src, alt: typeof image.alt === "string" ? image.alt : p.name, width: image.width, height: image.height, file });
  }
  const defaultImageId = typeof p.defaultImageId === "string" ? p.defaultImageId : images[0]?.id ?? null;
  return {
    warnings,
    input: {
      productId, options: array(p.options), variants, images, defaultImageId,
      ...(p.stockManaged === false ? {} : { stock: { sourceReference: `dev-import:src/lib/cms/data.json#products/${p.id}@sha256:${hash.slice(0, 16)}` } }),
    },
  };
}

/** Runs the base import (first time) and the per-product catalog sync. */
async function loadTaxonomy(client) {
  const rows = (await client.query("SELECT c.id,c.key,c.name,c.kind,p.key AS parent_key FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE NOT c.archived")).rows;
  return { ids: new Map(rows.map(row => [row.key, row.id])), nodes: rows.map(row => ({ key: row.key, name: row.name, kind: row.kind, parentKey: row.parent_key })) };
}

// Initial product_categories from the legacy free-text fields. Only for products that have no
// category rows yet, so assignments made later in the admin are never overwritten by a re-sync.
async function assignInitialCategories(client, productId, p, taxonomy) {
  if ((await client.query("SELECT 1 FROM product_categories WHERE product_id=$1 LIMIT 1", [productId])).rowCount) return { unmatched: [] };
  const { matchLegacyCategories } = await import("../../src/server/catalog/category-match.ts");
  const match = matchLegacyCategories(taxonomy.nodes, p);
  for (const key of match.keys)
    await client.query("INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [productId, taxonomy.ids.get(key), key === match.primaryKey]);
  return match;
}

export async function importDevCatalog(pool, { reimport = false } = {}) {
  const { syncProductVariants, syncId } = await import("../../src/server/catalog/variant-sync.ts");
  const raw = await readFile(DATA_FILE), data = JSON.parse(raw.toString("utf8")), state = await readState();
  const report = { base: "skipped", synced: 0, unchanged: 0, archived: 0, failed: [], uncategorized: [], warnings: 0, dataChanged: state.dataHash !== sha256(raw) };

  // 1. Base records through the legacy importer, once per database.
  const run = (await pool.query("SELECT id,status FROM migration_runs WHERE source_namespace=$1", [NAMESPACE])).rows[0];
  if (!run) {
    log("first import: running the legacy importer for base records (products, contacts, content drafts, audit history)…");
    const { collectCurrentSources, extractSources } = await import("../migration/extract.ts");
    const { importSnapshot } = await import("../migration/import.ts");
    const { validateSnapshot } = await import("../migration/validate.ts");
    const current = await collectCurrentSources(ROOT);
    const snapshot = extractSources({ ...current, namespace: NAMESPACE, classification: "owner_confirmed_real", cmsMoney: "KZT-major" });
    const result = await importSnapshot(pool, snapshot, { offline: true });
    const counts = Object.entries(validateSnapshot(snapshot).counts).filter(([entity]) => !entity.startsWith("static:")).map(([entity, c]) => `${entity} ${c.importable}/${c.expected}`).join(", ");
    report.base = `imported (run ${result.status}; importable/expected: ${counts})`;
    state.baseImport = { status: result.status, at: new Date().toISOString() };
  } else report.base = `already imported earlier (run ${run.status}); not re-run`;

  // 2. Per-product catalog sync.
  const context = { uploadRoot: resolve(process.env.UPLOAD_DIR || resolve(ROOT, "storage", "uploads")), files: new Map(), hashes: new Map() };
  const seen = new Set(), products = array(data.products);
  let taxonomy = null;
  for (const p of products) {
    if (!p || typeof p.id !== "string" || typeof p.sku !== "string" || typeof p.name !== "string") { report.failed.push({ id: String(p?.id), reason: "missing id, sku or name" }); continue; }
    seen.add(p.id);
    const hash = sha256(canonical(p));
    if (!reimport && state.products?.[p.id] === hash) { report.unchanged++; continue; }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const product = await upsertProduct(client, p, syncId);
      const { input, warnings } = await variantInput(p, product.id, product.status, hash, context);
      const result = await syncProductVariants(client, input);
      const categories = await assignInitialCategories(client, product.id, p, taxonomy ??= await loadTaxonomy(client));
      if (categories.unmatched.length) report.uncategorized.push({ id: p.id, labels: categories.unmatched });
      await client.query("COMMIT");
      state.products = { ...state.products, [p.id]: hash };
      report.synced++; report.warnings += warnings.length;
      log(`  ${p.id}: ${product.created ? "created" : "updated"}; variants +${result.variants.created} ~${result.variants.updated} =${result.variants.unchanged} archived ${result.variants.archived} deleted ${result.variants.deleted}; media ${result.media.linked} linked/${result.media.skipped} skipped; stock movements ${result.stock.movements}${warnings.length ? `; ${warnings.length} amount warning(s)` : ""}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      report.failed.push({ id: p.id, reason: error instanceof Error ? error.message : String(error) });
    } finally { client.release(); }
  }
  for (const id of Object.keys(state.products ?? {}).filter(id => !seen.has(id))) {
    await pool.query("UPDATE products SET status='archived',version=version+1,updated_at=clock_timestamp() WHERE public_key=$1 AND status<>'archived'", [id]);
    delete state.products[id]; report.archived++;
  }
  if (!report.failed.length) state.dataHash = sha256(raw);
  // 3. Content publication, once per database: the legacy importer stores pages as unpublished
  //    drafts, so the public homepage would 503. Publish what was live in data.json.
  if (!state.contentPublished) {
    report.contentPublished = await publishImportedContent(pool);
    state.contentPublished = { ...report.contentPublished, at: new Date().toISOString() };
  }
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  return report;
}

// Publishes the latest version of imported pages that were live in data.json: the homepage always,
// blogs with status "published", banners with active=true. Pages that already have a publication
// row are left alone. Runs once per dev database (state.contentPublished), so an owner who later
// unpublishes something in the admin is never overridden by a re-import.
export async function publishImportedContent(pool) {
  const client = await pool.connect(), counts = { homepage: 0, blogs: 0, banners: 0 };
  try {
    await client.query("BEGIN");
    const rows = (await client.query(`SELECT p.id,p.kind,pv.id AS version_id,pv.legacy_content
      FROM pages p JOIN LATERAL (SELECT id,legacy_content FROM page_versions WHERE page_id=p.id ORDER BY version DESC LIMIT 1) pv ON true
      WHERE NOT EXISTS (SELECT 1 FROM page_publications pub WHERE pub.page_id=p.id)`)).rows;
    for (const row of rows) {
      const content = row.legacy_content ?? {};
      const live = row.kind === "homepage" || (row.kind === "blog" && content.status === "published") || (row.kind === "banner" && content.active === true);
      if (!live) continue;
      await client.query("INSERT INTO page_publications(page_id,version_id) VALUES($1,$2) ON CONFLICT(page_id) DO NOTHING", [row.id, row.version_id]);
      await client.query("UPDATE pages SET status='published' WHERE id=$1", [row.id]);
      counts[row.kind === "homepage" ? "homepage" : row.kind === "blog" ? "blogs" : "banners"]++;
    }
    await client.query("COMMIT");
    return counts;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

export async function catalogCounts(pool) {
  const row = (await pool.query(`SELECT
    (SELECT count(*) FROM products) AS products,
    (SELECT count(*) FROM products WHERE status='published') AS published,
    (SELECT count(*) FROM product_variants) AS variants,
    (SELECT count(*) FROM product_variants WHERE status<>'archived') AS live_variants,
    (SELECT count(*) FROM product_options) AS options,
    (SELECT count(*) FROM option_values) AS option_values,
    (SELECT count(*) FROM prices WHERE is_active) AS prices,
    (SELECT count(*) FROM inventory_balances) AS balances,
    (SELECT count(*) FROM stock_movements) AS movements,
    (SELECT COALESCE(sum(on_hand),0) FROM inventory_balances) AS on_hand,
    (SELECT count(*) FROM product_media) AS product_media,
    (SELECT count(*) FROM categories) AS categories,
    (SELECT count(*) FROM products p WHERE NOT EXISTS(SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id AND pc.is_primary)) AS uncategorized,
    (SELECT count(*) FROM (SELECT lower(sku) FROM product_variants GROUP BY 1 HAVING count(*)>1) d) AS duplicate_skus`)).rows[0];
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const reimport = process.argv.includes("--reimport");
  try {
    const { report, counts } = await withDevDatabase(async ({ database }) => ({ report: await importDevCatalog(database.pool, { reimport }), counts: await catalogCounts(database.pool) }));
    log(`base: ${report.base}`);
    log(`catalog: ${report.synced} synced, ${report.unchanged} unchanged, ${report.archived} archived, ${report.failed.length} failed, ${report.warnings} amount warning(s)`);
    for (const failure of report.failed) log(`  FAILED ${failure.id}: ${failure.reason}`);
    for (const item of report.uncategorized) log(`  no category for ${item.id}: ${item.labels.join(" / ")}`);
    log(`totals: ${JSON.stringify(counts)}`);
    if (report.failed.length) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`[dev] import failed: ${error instanceof Error ? error.stack ?? error.message : error}\n`);
    process.exitCode = 1;
  }
}
