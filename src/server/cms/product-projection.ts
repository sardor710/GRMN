import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveUploadFile, sniffImageType } from "../../lib/media/storage.ts";
import { AuthFailure } from "../auth/config.ts";
import type { VariantContent } from "../../lib/catalog/variant-content.ts";

// Owner, 2026-11-19 (commits 5cbad06/e7dc91c on PostgreSQL): the admin product document keeps its
// options, variants and photos in products.legacy_content; this projects them into the commerce
// tables the storefront, cart and checkout read. Variants are matched by editor identity (the row
// they had at the last save, then a stable id derived from the editor id; SKU only for variants new
// to the editor, see matchVariants), so their ids, stock and prices survive edits and SKU renames.
// A variant removed in the editor is archived, never deleted (orders, stock and reservations
// reference it). Options and values the editor removed are deleted together with their selections.
// Stock is not written here: it moves only through the inventory workflow.

export interface EditorOption { id: string; key: string; name: string; values: { id: string; key: string; label: string }[] }
export interface EditorVariant { id: string; sku: string; title: string; selections: Record<string, string>; price: number | string; originalPrice?: number | string; status: "draft" | "active" | "archived"; isDefault: boolean; imageIds: string[]; /** Task 2.1: own Specs/Overview/In the box; absent keys inherit. */ content?: VariantContent }
export interface EditorImage { id: string; src: string; alt?: string }
export interface ProductDocument { status: string; sku: string; priceMinor: string; compareMinor: string | null; options: EditorOption[]; variants: EditorVariant[]; images: EditorImage[]; defaultImageId?: string; image?: string }

const fail = (status: number, message: string): never => { throw new AuthFailure(status === 409 ? "CONFLICT" : "INVALID_INPUT", status, message); };
/** A deterministic UUID (v5-style layout) so the same editor id always maps to the same row. */
export function stableUuid(...parts: string[]): string {
  const h = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}
const slug = (value: string) => value.trim().toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "option";
/** Exact KZT major units (number or decimal string) to minor units. */
export function toMinor(value: number | string, field: string): string {
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1") : "") : String(value).trim();
  const match = /^(0|[1-9][0-9]{0,13})(?:\.([0-9]{1,2}))?$/.exec(text);
  if (!match) return fail(400, `${field} must be an exact KZT amount`);
  return (BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"))).toString();
}
const variantStatus = (product: string, variant: string) => product === "archived" || variant === "archived" ? "archived" : product === "published" && variant === "active" ? "active" : variant === "draft" || product === "draft" ? "draft" : "active";
/** Only the known content blocks leave the editor document (a non-object is "inherit everything"). */
const overrides = (content: unknown): VariantContent => {
  if (content === null || typeof content !== "object" || Array.isArray(content)) return {};
  const source = content as Record<string, unknown>;
  return Object.fromEntries((["specs", "specGroups", "overviewHtml", "inTheBox"] as const).filter(key => source[key] !== undefined).map(key => [key, source[key]])) as VariantContent;
};
/** Local photo paths the store serves itself; external URLs are never registered as media. */
const localPhoto = (src: string) => /^\/(uploads|media|images)\/[^\s\\]+$/.test(src) && !src.includes("..") && !src.startsWith("//");

/** An editor variant as the previously saved document named it (its editor id and the SKU it had then). */
export interface PreviousVariant { id?: unknown; sku?: unknown }
type ExistingVariant = { id: string; sku: string; status: string; is_default: boolean };

/**
 * F-c (final review, 2026-11-21): which existing row each editor variant is. Identity comes first, SKU last:
 * 1. the row that carried this editor variant at the last save (its previous SKU, read from the previous
 *    document): this is how rows the importer or a migration created (ids not derived from the editor id)
 *    keep their identity, and it reflects what the earlier SKU-first projection actually matched;
 * 2. the row whose id is the stable id derived from the editor id;
 * 3. only for variants new to the editor: an unclaimed row with the same SKU (e.g. an imported default
 *    variant the editor now lists, or a re-added SKU of an archived row);
 * otherwise a new row with the stable id. A row is never given to two editor variants.
 */
function matchVariants(productId: string, variants: readonly EditorVariant[], existing: readonly ExistingVariant[], bySku: ReadonlyMap<string, ExistingVariant>, previous: readonly PreviousVariant[]): Map<string, string> {
  const byId = new Map(existing.map(v => [v.id, v]));
  const previousSku = new Map<string, string>();
  for (const p of previous) if (typeof p.id === "string" && typeof p.sku === "string" && p.sku.trim()) previousSku.set(p.id, p.sku.trim().toLowerCase());
  const claimed = new Set<string>(), rows = new Map<string, string>();
  const claim = (editorId: string, row: ExistingVariant | undefined) => { if (!row || claimed.has(row.id)) return false; claimed.add(row.id); rows.set(editorId, row.id); return true; };
  for (const v of variants) {
    const was = previousSku.get(v.id);
    if (!claim(v.id, was === undefined ? undefined : bySku.get(was))) claim(v.id, byId.get(stableUuid(productId, "variant", v.id)));
  }
  for (const v of variants) {
    if (rows.has(v.id) || claim(v.id, bySku.get(v.sku.trim().toLowerCase()))) continue;
    const stable = stableUuid(productId, "variant", v.id);
    rows.set(v.id, claimed.has(stable) ? randomUUID() : stable);
  }
  return rows;
}

export async function projectProduct(client: PoolClient, productId: string, doc: ProductDocument, previous: readonly PreviousVariant[] = []): Promise<void> {
  const hasVariants = doc.options.length > 0 && doc.variants.length > 0;
  const existing = (await client.query<ExistingVariant>("SELECT id,sku,status,is_default FROM product_variants WHERE product_id=$1", [productId])).rows;
  const bySku = new Map(existing.map(v => [v.sku.toLowerCase(), v]));

  // ---- options and values ----
  const optionIds = new Map<string, string>(), valueIds = new Map<string, string>();
  const keepOptions: string[] = [], keepValues: string[] = [];
  if (hasVariants) {
    const usedKeys = new Set<string>();
    doc.options.forEach((option, index) => {
      let key = slug(option.key || option.name); while (usedKeys.has(key)) key += "-x"; usedKeys.add(key);
      const id = stableUuid(productId, "option", option.id); optionIds.set(option.id, id); keepOptions.push(id);
      option.key = key;
      const usedValues = new Set<string>();
      option.values.forEach(value => {
        let vkey = slug(value.key || value.label); while (usedValues.has(vkey)) vkey += "-x"; usedValues.add(vkey);
        value.key = vkey;
        const vid = stableUuid(id, "value", value.id); valueIds.set(`${option.id}\u0000${value.id}`, vid); keepValues.push(vid);
      });
      void index;
    });
  }
  // Validate variants before any write.
  // Final review I1: a published product sells every non-archived variant (the storefront shows the cheapest
  // available one), so each needs a price above 0. Checked on the projected document, which is what save,
  // the status change and bulk publish all write; a simple product (no options) sells its product price.
  const published = doc.status === "published";
  if (published && !hasVariants && BigInt(doc.priceMinor) <= BigInt(0)) fail(400, "Set a price above 0 before publishing.");
  const skus = new Set<string>();
  if (hasVariants) {
    if (doc.variants.filter(v => v.isDefault && v.status !== "archived").length !== 1) fail(400, "Exactly one variant must be the default");
    for (const v of doc.variants) {
      const sku = v.sku.trim();
      if (!sku) fail(400, "Every variant needs a SKU");
      if (skus.has(sku.toLowerCase())) fail(409, `SKU used twice: ${sku}`);
      skus.add(sku.toLowerCase());
      for (const option of doc.options) if (!valueIds.has(`${option.id}\u0000${v.selections[option.id]}`)) fail(400, `Variant ${sku} has no valid ${option.name} choice`);
      const amount = toMinor(v.price, `Price of ${sku}`);
      if (published && v.status !== "archived" && BigInt(amount) <= BigInt(0)) fail(400, `Set a price above 0 for ${v.title?.trim() ? `${v.title.trim()} (${sku})` : sku} before publishing.`);
      if (v.originalPrice !== undefined && v.originalPrice !== "" && BigInt(toMinor(v.originalPrice, `Compare-at price of ${sku}`)) < BigInt(amount)) fail(400, `Compare-at price of ${sku} is below its price`);
    }
  }
  // F-c: rows are matched before any write. A final SKU still held by a row of this product that no
  // variant claimed (a variant removed in this save, or archived earlier) would hit the global unique
  // index; refuse it with a reason instead (archived rows keep their SKU for orders and history).
  const matched = hasVariants ? matchVariants(productId, doc.variants, existing, bySku, previous) : new Map<string, string>();
  if (hasVariants) {
    const claimedRows = new Set(matched.values());
    for (const v of doc.variants) {
      const holder = bySku.get(v.sku.trim().toLowerCase());
      if (holder && !claimedRows.has(holder.id)) fail(409, `SKU ${v.sku.trim()} belongs to an archived variant of this product. Add a variant with that SKU to restore the archived one, or choose a different SKU.`);
    }
  }

  // Selections of options or values that are going away, then the options and values themselves.
  await client.query("DELETE FROM variant_option_values WHERE product_id=$1 AND (NOT option_id=ANY($2::uuid[]) OR NOT option_value_id=ANY($3::uuid[]))", [productId, keepOptions, keepValues]);
  await client.query("DELETE FROM option_values WHERE product_id=$1 AND NOT id=ANY($2::uuid[])", [productId, keepValues]);
  await client.query("DELETE FROM product_options WHERE product_id=$1 AND NOT id=ANY($2::uuid[])", [productId, keepOptions]);
  if (hasVariants) {
    // Free the keys first (a renamed option may take another's old key), then upsert.
    await client.query("UPDATE product_options SET key='~'||id::text WHERE product_id=$1", [productId]);
    await client.query("UPDATE option_values SET key='~'||id::text WHERE product_id=$1", [productId]);
    for (const [index, option] of doc.options.entries()) {
      const id = optionIds.get(option.id)!;
      await client.query("INSERT INTO product_options(id,product_id,key,name,position) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET key=excluded.key,name=excluded.name,position=excluded.position", [id, productId, option.key, option.name.trim(), index]);
      for (const [position, value] of option.values.entries()) await client.query("INSERT INTO option_values(id,product_id,option_id,key,label,position) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET key=excluded.key,label=excluded.label,position=excluded.position", [valueIds.get(`${option.id}\u0000${value.id}`), productId, id, value.key, value.label.trim(), position]);
    }
  }

  // ---- variants and prices ----
  const editorToRow = new Map<string, string>(), keepVariants: string[] = [];
  await client.query("UPDATE product_variants SET is_default=false WHERE product_id=$1 AND is_default", [productId]);
  // option_signature is derived by a database trigger from variant_option_values; it is never written here.
  // Task 2.1: the variant's content overrides are copied as-is (a present key is "Own", even when empty).
  const upsertVariant = async (id: string, sku: string, name: string | null, status: string, isDefault: boolean, amount: string, compare: string | null, content: VariantContent = {}) => {
    await client.query(`INSERT INTO product_variants(id,product_id,sku,name,status,is_default,content_overrides) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,name=excluded.name,status=excluded.status,is_default=excluded.is_default,content_overrides=excluded.content_overrides,version=product_variants.version+1,updated_at=clock_timestamp()`,
      [id, productId, sku, name, status, isDefault, JSON.stringify(overrides(content))]);
    const price = (await client.query<{ id: string }>("SELECT id FROM prices WHERE variant_id=$1 AND is_active AND market='default' AND currency='KZT'", [id])).rows[0];
    if (price) await client.query("UPDATE prices SET amount_minor=$2,compare_at_minor=$3,version=version+1 WHERE id=$1", [price.id, amount, compare]);
    else await client.query("INSERT INTO prices(id,variant_id,amount_minor,compare_at_minor) VALUES($1,$2,$3,$4)", [randomUUID(), id, amount, compare]);
  };
  if (hasVariants) {
    // Two phases: the SKU unique index is global and not deferrable, so every kept row whose SKU changes
    // first takes a temporary SKU of its own ('~' + id), then its final one below. Chained renames in one
    // save (A->C with B->A, or a swap) never collide mid-update. Unchanged rows are not touched here.
    const finalSku = new Map(doc.variants.map(v => [matched.get(v.id)!, v.sku.trim()]));
    const renamed = existing.filter(row => finalSku.has(row.id) && finalSku.get(row.id) !== row.sku).map(row => row.id);
    if (renamed.length) await client.query("UPDATE product_variants SET sku='~'||id::text WHERE product_id=$1 AND id=ANY($2::uuid[])", [productId, renamed]);
    for (const v of doc.variants) {
      const sku = v.sku.trim(), id = matched.get(v.id)!;
      editorToRow.set(v.id, id); keepVariants.push(id);
      const amount = toMinor(v.price, `Price of ${sku}`), compare = v.originalPrice === undefined || v.originalPrice === "" ? null : toMinor(v.originalPrice, `Compare-at price of ${sku}`);
      const status = variantStatus(doc.status, v.status);
      await upsertVariant(id, sku, v.title?.trim() || null, status, v.isDefault, amount, compare, v.content);
      await client.query("DELETE FROM variant_option_values WHERE variant_id=$1", [id]);
      for (const option of doc.options) await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)", [id, productId, optionIds.get(option.id), valueIds.get(`${option.id}\u0000${v.selections[option.id]}`)]);
    }
  } else {
    // A simple product: one default variant carrying the product SKU and price.
    const found = bySku.get(doc.sku.trim().toLowerCase()) ?? existing.find(v => v.is_default && v.status !== "archived") ?? existing.find(v => v.status !== "archived");
    const id = found?.id ?? stableUuid(productId, "default-variant");
    keepVariants.push(id);
    await upsertVariant(id, doc.sku.trim(), null, variantStatus(doc.status, "active"), true, doc.priceMinor, doc.compareMinor);
    await client.query("DELETE FROM variant_option_values WHERE variant_id=$1", [id]);
  }
  await client.query("UPDATE product_variants SET status='archived',is_default=false,version=version+1 WHERE product_id=$1 AND NOT id=ANY($2::uuid[]) AND status<>'archived'", [productId, keepVariants]);

  // ---- photos: register local paths as media, then rebuild the product's gallery rows ----
  await client.query("DELETE FROM product_media WHERE product_id=$1", [productId]);
  const images = doc.images.filter(i => localPhoto(i.src));
  const mediaIds = new Map<string, string>();
  for (const image of images) { const id = await mediaFor(client, image.src, image.alt); if (id) mediaIds.set(image.id, id); }
  const byVariant = hasVariants ? doc.variants.filter(v => editorToRow.has(v.id)) : [];
  const attached = new Set(byVariant.flatMap(v => v.imageIds));
  let position = 0;
  const productLevel = images.filter(i => mediaIds.has(i.id) && !attached.has(i.id));
  const primary = productLevel.find(i => i.id === doc.defaultImageId) ?? productLevel[0];
  for (const image of [...(primary ? [primary] : []), ...productLevel.filter(i => i !== primary)])
    await client.query("INSERT INTO product_media(id,product_id,variant_id,media_id,alt_text,position,is_primary) VALUES($1,$2,NULL,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [stableUuid(productId, "pm", image.id), productId, mediaIds.get(image.id), image.alt || null, position++, image === primary]);
  for (const v of byVariant) {
    const ids = [...new Set(v.imageIds)].filter(id => mediaIds.has(id));
    for (const [index, imageId] of ids.entries())
      await client.query("INSERT INTO product_media(id,product_id,variant_id,media_id,alt_text,position,is_primary) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", [stableUuid(productId, "pm", v.id, imageId), productId, editorToRow.get(v.id), mediaIds.get(imageId), images.find(i => i.id === imageId)?.alt || null, index, index === 0]);
  }
}

const MIME: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
/** The media_assets row for a local photo path: an existing /media asset, or a registered file. */
// A missing /images/… file (a static asset reference) is skipped and the storefront falls back to the
// product image; a missing upload or media file is an error (the upload and import routes write them).
async function mediaFor(client: PoolClient, src: string, alt?: string): Promise<string | null> {
  if (src.startsWith("/media/")) {
    const found = (await client.query<{ id: string }>("SELECT id FROM media_assets WHERE storage_key=$1 AND storage_namespace='cms-public' AND status='ready' AND visibility='public'", [src.slice("/media/".length)])).rows[0];
    return found?.id ?? fail(400, `Photo not found: ${src.slice(0, 120)}`);
  }
  const known = (await client.query<{ id: string }>("SELECT id FROM media_assets WHERE storage_namespace='catalog-files' AND storage_key=$1 AND status='ready'", [src])).rows[0];
  if (known) return known.id;
  const segments = src.split("/").slice(2);
  const file = src.startsWith("/uploads/") ? resolveUploadFile(segments) : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public", ...segments.map(decodeURIComponent));
  const publicRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public") + path.sep;
  if (!file || (src.startsWith("/images/") && !file.startsWith(publicRoot))) return fail(400, `Photo path not allowed: ${src.slice(0, 120)}`);
  let bytes: Buffer;
  try { bytes = await readFile(file); } catch { return src.startsWith("/images/") ? null : fail(400, `Photo not found on the server: ${src.slice(0, 120)} (upload it again)`); }
  const type = sniffImageType(bytes);
  if (!type) return fail(400, `Not a JPEG, PNG, WebP or AVIF photo: ${src.slice(0, 120)}`);
  const row = (await client.query<{ id: string }>(
    `INSERT INTO media_assets(id,storage_namespace,storage_key,source_path,kind,visibility,status,mime_type,byte_size,checksum_sha256,alt_text)
     VALUES($1,'catalog-files',$2,$2,'image','public','ready',$3,$4,$5,$6) ON CONFLICT(storage_namespace,storage_key) DO UPDATE SET updated_at=now() RETURNING id`,
    [stableUuid("catalog-files", src), src, MIME[type], bytes.length, createHash("sha256").update(bytes).digest("hex"), alt || null])).rows[0];
  return row.id;
}
