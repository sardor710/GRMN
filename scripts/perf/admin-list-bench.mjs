// Admin catalog list benchmark (M2, acceptance A14). Seeds a disposable PostgreSQL (temporary-postgres
// helper) with 1,000 products / 5,000 SKUs, the category taxonomy, prices, ledger stock, product media and
// heavy legacy_content (overview HTML), then times the exact queries behind /api/admin/catalog/*:
// grouped list (first and deep page), SKU list, category filter (with descendants), search and stock-state
// filter, ≥50 runs each, and reports p50/p95 plus the JSON payload size of one page.
//   node scripts/perf/admin-list-bench.mjs [--runs 50] [--products 1000] [--variants 5] [--explain]
// Targets: p95 < 300 ms and page payload < 100 KB.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

if (!process.execArgv.some(arg => arg.includes("react-server"))) {
  // The catalog modules import "server-only"; re-run with the server condition.
  const result = spawnSync(process.execPath, ["--conditions=react-server", ...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? Number(args[index + 1]) : fallback; };
const RUNS = option("runs", 50), PRODUCTS = option("products", 1000), VARIANTS = option("variants", 5), EXPLAIN = args.includes("--explain");
const TARGET_P95_MS = 300, TARGET_PAGE_BYTES = 100 * 1024;

const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { startTemporaryPostgres } = await import("../db/temporary-postgres.mjs");
const { createDatabase } = await import("../../src/server/db/client.ts");
const { parseServerEnv } = await import("../../src/server/config/env.ts");
const { taxonomySeed } = await import("../../src/server/catalog/taxonomy-seed.ts");
const { listProducts, listSkus, productVariantRows, readTaxonomy, loadEditorProduct } = await import("../../src/server/cms/catalog-read.ts");

const log = (...parts) => console.log(...parts);
const temporary = await startTemporaryPostgres();
let database;
try {
  const migration = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "1", DATABASE_CONNECT_TIMEOUT_MS: "10000", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
  try { await migrate(migration.db, { migrationsFolder: "drizzle" }); } finally { await migration.close(); }
  database = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
  const pool = database.pool, q = (sql, values = []) => pool.query(sql, values);
  const seedStarted = Date.now();

  // Taxonomy (same order/positions as dev:seed).
  const categoryIds = new Map(), siblings = new Map();
  for (const node of taxonomySeed) categoryIds.set(node.key, randomUUID());
  for (const node of taxonomySeed) {
    const position = siblings.get(node.parentKey) ?? 0; siblings.set(node.parentKey, position + 1);
    await q("INSERT INTO categories(id,key,name,parent_id,position,kind,slug,preset_filters,nav_visible) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [categoryIds.get(node.key), node.key, node.name, node.parentKey ? categoryIds.get(node.parentKey) : null, position, node.kind, node.slug, JSON.stringify(node.presetFilters ?? {}), node.navVisible]);
  }
  const leaves = taxonomySeed.filter(node => !taxonomySeed.some(child => child.parentKey === node.key)).map(node => categoryIds.get(node.key));
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')", [randomUUID()]);

  // Products with a heavy legacy_content (≈40 KB overview) the list must never read.
  const overview = `<section class="ov-section">${"<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(700)}</p></section>`;
  await q(`INSERT INTO products(id,public_key,name,family,status,description,legacy_content,specs,updated_at,created_at)
    SELECT gen_random_uuid(),'perf-'||g,'Perf watch '||g||' '||(ARRAY['fēnix','Forerunner','Venu','Instinct','Edge','MARQ','epix','vívoactive','Lily','Descent'])[1+g%10],
      (ARRAY['fēnix','Forerunner','Venu','Instinct','Edge','MARQ','epix','vívoactive','Lily','Descent'])[1+g%10],
      (ARRAY['published','published','published','draft','archived'])[1+g%5],'Synthetic perf product',
      jsonb_build_object('image','/images/perf/'||g||'.jpg','overviewHtml',$1::text,'category','Wearables','specGroups',jsonb_build_array(jsonb_build_object('title','Specs','items',jsonb_build_array()))),
      '[]'::jsonb,now()-(g||' minutes')::interval,now()-(g||' minutes')::interval
    FROM generate_series(1,$2::int) g`, [overview, PRODUCTS]);
  await q(`INSERT INTO product_options(id,product_id,key,name,display) SELECT gen_random_uuid(),id,'color','Color','swatch' FROM products`);
  await q(`INSERT INTO option_values(id,product_id,option_id,key,label,position,swatch_color)
    SELECT gen_random_uuid(),o.product_id,o.id,'c'||s,'Color '||s,s,'#'||lpad(to_hex(s*1111111 % 16777215),6,'0') FROM product_options o CROSS JOIN generate_series(1,$1::int) s`, [VARIANTS]);
  // Active variants must select every option by commit time (deferred signature trigger): one transaction.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO product_variants(id,product_id,sku,name,status,is_default)
      SELECT gen_random_uuid(),v.product_id,'PERF-'||p.public_key||'-'||v.position,'Color '||v.position,'active',v.position=1 FROM option_values v JOIN products p ON p.id=v.product_id`);
    await client.query(`INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id)
      SELECT pv.id,pv.product_id,ov.option_id,ov.id FROM product_variants pv JOIN option_values ov ON ov.product_id=pv.product_id AND pv.name=ov.label`);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  await q(`INSERT INTO prices(id,variant_id,amount_minor,compare_at_minor) SELECT gen_random_uuid(),id,(100000+abs(hashtext(sku))%900000)*100,NULL FROM product_variants`);
  // Ledger stock: a third out of stock, some low, the rest in stock (the ledger trigger maintains balances).
  await q(`INSERT INTO inventory_balances(variant_id,location_id) SELECT v.id,l.id FROM product_variants v CROSS JOIN stock_locations l`);
  await q(`INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference)
    SELECT gen_random_uuid(),v.id,l.id,CASE WHEN abs(hashtext(v.sku))%3=0 THEN 2+abs(hashtext(v.sku))%3 ELSE 10+abs(hashtext(v.sku))%40 END,0,'opening','opening:'||v.id||':'||l.id,'perf-seed'
    FROM product_variants v CROSS JOIN stock_locations l WHERE abs(hashtext(v.sku))%3<>1`);
  // Categories: one primary leaf and one secondary per product.
  await q(`INSERT INTO product_categories(product_id,category_id,is_primary) SELECT p.id,($1::uuid[])[1+abs(hashtext(p.public_key))%array_length($1::uuid[],1)],true FROM products p`, [leaves]);
  await q(`INSERT INTO product_categories(product_id,category_id,is_primary) SELECT p.id,($1::uuid[])[1+abs(hashtext(p.public_key||'x'))%array_length($1::uuid[],1)],false FROM products p ON CONFLICT DO NOTHING`, [leaves]);
  // Primary product images for 70% of products, one variant image each for the first variant.
  await q(`INSERT INTO media_assets(id,storage_namespace,storage_key,source_path,kind,visibility,status,mime_type,byte_size,checksum_sha256,width,height)
    SELECT gen_random_uuid(),'site-public','/images/perf/'||p.public_key||'.webp','/images/perf/'||p.public_key||'.webp','image','public','ready','image/webp',1000,repeat('a',64),800,800 FROM products p WHERE abs(hashtext(p.public_key))%10<7`);
  await q(`INSERT INTO product_media(id,product_id,variant_id,media_id,position,is_primary) SELECT gen_random_uuid(),p.id,NULL,m.id,0,true FROM products p JOIN media_assets m ON m.storage_key='/images/perf/'||p.public_key||'.webp'`);
  await q("ANALYZE");
  const counts = (await q("SELECT (SELECT count(*) FROM products)::int AS products,(SELECT count(*) FROM product_variants)::int AS variants,(SELECT count(*) FROM categories)::int AS categories,(SELECT count(*) FROM inventory_balances)::int AS balances,(SELECT pg_size_pretty(pg_total_relation_size('products'))) AS products_size")).rows[0];
  log(`seeded in ${Date.now() - seedStarted} ms:`, counts);

  const topCategory = "wearables-smartwatches";
  const scenarios = [
    ["grouped list, first page (50)", () => listProducts(pool, { limit: 50 })],
    ["grouped list, page 5 (cursor)", null],
    ["SKU list, first page (50)", () => listSkus(pool, { limit: 50 })],
    ["grouped, category + descendants", () => listProducts(pool, { limit: 50, category: topCategory })],
    ["SKU, category + descendants", () => listSkus(pool, { limit: 50, category: topCategory })],
    ["grouped, search name/SKU", () => listProducts(pool, { limit: 50, search: "perf-7" })],
    ["SKU, search", () => listSkus(pool, { limit: 50, search: "PERF-perf-12" })],
    ["grouped, stock=low", () => listProducts(pool, { limit: 50, stock: "low" })],
    ["grouped, status+family", () => listProducts(pool, { limit: 50, status: "published", family: "Venu" })],
    ["grouped, max page (100)", () => listProducts(pool, { limit: 100 })],
    ["expand one product", () => productVariantRows(pool, "perf-500")],
    ["taxonomy tree", () => readTaxonomy(pool)],
  ];
  let cursor5;
  { let page = await listProducts(pool, { limit: 50 }); for (let i = 1; i < 5; i++) page = await listProducts(pool, { limit: 50, cursor: page.nextCursor }); cursor5 = page.nextCursor; }
  scenarios[1][1] = () => listProducts(pool, { limit: 50, cursor: cursor5 });

  const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]; };
  const results = [];
  for (const [name, run] of scenarios) {
    for (let i = 0; i < 3; i++) await run(); // warm-up
    const times = [];
    let payload = 0, rows = 0, total = null;
    for (let i = 0; i < RUNS; i++) {
      const started = process.hrtime.bigint();
      const value = await run();
      times.push(Number(process.hrtime.bigint() - started) / 1e6);
      if (i === 0) { payload = Buffer.byteLength(JSON.stringify(value)); rows = Array.isArray(value) ? value.length : value.items?.length ?? value.categories?.length ?? 0; total = value.total ?? null; }
    }
    results.push({ name, p50: percentile(times, 50), p95: percentile(times, 95), max: Math.max(...times), payload, rows, total });
  }
  const editorKey = "perf-10";
  const editorTimes = [];
  const editorId = (await q("SELECT id FROM products WHERE public_key=$1", [editorKey])).rows[0].id;
  for (let i = 0; i < RUNS; i++) { const started = process.hrtime.bigint(); await loadEditorProduct(pool, editorId); editorTimes.push(Number(process.hrtime.bigint() - started) / 1e6); }
  results.push({ name: "editor payload (one product)", p50: percentile(editorTimes, 50), p95: percentile(editorTimes, 95), max: Math.max(...editorTimes), payload: Buffer.byteLength(JSON.stringify(await loadEditorProduct(pool, editorId))), rows: 1, total: null });

  // Before M2, for comparison only: the legacy-shaped product list (full legacy_content per row, 20 rows).
  const { createCMSService } = await import("../../src/server/cms/service.ts");
  const legacyCms = createCMSService({ pool, authorize: async () => ({ userId: randomUUID(), permissions: ["catalog:read"] }) });
  const legacyTimes = [];
  for (let i = 0; i < Math.min(RUNS, 20); i++) { const started = process.hrtime.bigint(); await legacyCms.list("products", new Headers(), { limit: 20 }); legacyTimes.push(Number(process.hrtime.bigint() - started) / 1e6); }
  const legacyPage = await legacyCms.list("products", new Headers(), { limit: 20 });
  results.push({ name: "before M2: legacy list DTO (20 rows, reference only)", p50: percentile(legacyTimes, 50), p95: percentile(legacyTimes, 95), max: Math.max(...legacyTimes), payload: Buffer.byteLength(JSON.stringify(legacyPage)), rows: legacyPage.items.length, total: null });

  log(`\n${PRODUCTS} products / ${counts.variants} SKUs, ${RUNS} runs per query (service-level, same SQL as the API, no HTTP/auth):\n`);
  log("| Query | rows | total | p50 ms | p95 ms | max ms | page payload |");
  log("|---|---:|---:|---:|---:|---:|---:|");
  for (const r of results) log(`| ${r.name} | ${r.rows} | ${r.total ?? "–"} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.max.toFixed(1)} | ${(r.payload / 1024).toFixed(1)} KB |`);
  const lists = results.filter(r => !["taxonomy tree", "editor payload (one product)"].includes(r.name) && !r.name.startsWith("before M2"));
  const ok = lists.every(r => r.p95 < TARGET_P95_MS && r.payload < TARGET_PAGE_BYTES);
  log(`\ntargets: p95 < ${TARGET_P95_MS} ms and page payload < ${TARGET_PAGE_BYTES / 1024} KB for every list query → ${ok ? "PASS" : "FAIL"}`);

  if (EXPLAIN) {
    const { rows: plan } = await q(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT p.id FROM products p WHERE p.status<>'archived' ORDER BY p.updated_at DESC,p.id DESC LIMIT 51`);
    log("\nEXPLAIN grouped list order:\n" + plan.map(row => row["QUERY PLAN"]).join("\n"));
  }
  process.exitCode = ok ? 0 : 1;
} finally {
  try { await database?.close(); } finally { await temporary.stop(); }
}
