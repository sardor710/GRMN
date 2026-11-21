import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { setStockFromSource } from "../inventory/service.ts";

// Writes one product's legacy-shaped options/variants (the CMS JSON shape in src/lib/cms/types.ts)
// into the normalized catalog tables, inside the caller's transaction:
//   product_options / option_values / product_variants / variant_option_values / prices (KZT)
//   media_assets + product_media (only when `images` is given, only for images with verified file metadata)
//   opening stock / stock changes through the inventory ledger (only when `stock` is given).
// Row ids are derived from the product id and the legacy ids, so a re-run updates instead of duplicating.
// Existing rows are adopted by natural key (option key, value key, SKU) when their derived id is absent,
// e.g. the default variant written by the legacy importer. A variant missing from the input is deleted
// when nothing references it, otherwise archived. The product row itself must already exist; this module
// never reads files or CMS JSON — callers pass the data (and, for media, the checked file metadata).

export const MEDIA_NAMESPACE = "site-public";
const MAX_VARIANTS = 500;

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const money = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(typeof value === "number" ? String(value) : value.trim());
  if (!match || (typeof value === "number" && !Number.isFinite(value))) { ctx.addIssue({ code: "custom", message: "Prices are non-negative KZT amounts with at most two decimals" }); return z.NEVER; }
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor > BigInt("100000000000000")) { ctx.addIssue({ code: "custom", message: "Amount exceeds the supported range" }); return z.NEVER; }
  return minor;
});
const valueSchema = z.looseObject({ id: trimmed(200), key: trimmed(200), label: trimmed(200) });
const optionSchema = z.looseObject({ id: trimmed(200), key: trimmed(200), name: trimmed(200), values: z.array(valueSchema).max(200) });
const variantSchema = z.looseObject({
  id: trimmed(200), sku: trimmed(100), title: z.string().trim().max(300).nullish(),
  selections: z.record(z.string(), z.string()).default({}),
  price: money, originalPrice: money.nullish(),
  stock: z.number().int().min(0).max(2_000_000_000).optional(),
  status: z.enum(["draft", "active", "archived"]), isDefault: z.boolean().default(false),
  imageIds: z.array(z.string()).max(500).default([]),
});
const fileSchema = z.object({ byteSize: z.number().int().min(0), checksumSha256: z.string().regex(/^[0-9a-f]{64}$/), mimeType: trimmed(100) });
const imageSchema = z.looseObject({
  id: trimmed(200), src: trimmed(2048), alt: z.string().max(500).optional(),
  width: z.number().int().positive().optional(), height: z.number().int().positive().optional(),
  file: fileSchema.nullish(),
});
const inputSchema = z.object({
  productId: z.uuid(),
  market: trimmed(64).default("default"),
  options: z.array(optionSchema).max(20),
  variants: z.array(variantSchema).max(MAX_VARIANTS),
  images: z.array(imageSchema).max(1000).optional(),
  defaultImageId: z.string().nullish(),
  stock: z.object({ sourceReference: trimmed(400), actorUserId: z.uuid().nullish() }).optional(),
});

export type VariantSyncInput = z.input<typeof inputSchema>;
type Input = z.output<typeof inputSchema>;
export interface VariantSyncResult {
  productId: string;
  /** legacy variant id → product_variants.id */
  variantIds: Record<string, string>;
  defaultVariantId: string | null;
  options: { created: number; updated: number; removed: number };
  values: { created: number; updated: number; removed: number };
  variants: { created: number; updated: number; unchanged: number; archived: number; deleted: number };
  prices: { created: number; updated: number; unchanged: number };
  media: { linked: number; skipped: number; changed: boolean };
  stock: { movements: number; unchanged: number };
}

const invalid = (message: string): never => { throw new AuthFailure("INVALID_INPUT", 400, message); };

/** Deterministic UUID (same construction as the legacy importer's stableId). */
export function syncId(...parts: string[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32).split("");
  hash[12] = "5";
  hash[16] = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function parse(raw: unknown): Input {
  const result = inputSchema.safeParse(raw);
  if (!result.success) return invalid(`Invalid variant data: ${result.error.issues[0]?.path.join(".") || "input"} ${result.error.issues[0]?.message ?? ""}`.trim());
  return result.data;
}

const optionKey = (key: string) => key.trim().toLowerCase();
const temporary = (id: string) => `~sync-${id}`;

/** Validates the configuration and returns the chosen default (a legacy variant id, or null). */
function validate(data: Input): string | null {
  const optionIds = new Set<string>(), optionKeys = new Set<string>();
  const valuesByOption = new Map<string, Set<string>>();
  for (const option of data.options) {
    if (optionIds.has(option.id)) invalid(`Duplicate option id ${option.id}`);
    if (optionKeys.has(optionKey(option.key))) invalid(`Duplicate option key ${option.key}`);
    optionIds.add(option.id); optionKeys.add(optionKey(option.key));
    const ids = new Set<string>(), keys = new Set<string>();
    for (const value of option.values) {
      if (ids.has(value.id)) invalid(`Duplicate value id ${value.id}`);
      if (keys.has(value.key)) invalid(`Duplicate value key ${value.key} in option ${option.key}`);
      ids.add(value.id); keys.add(value.key);
    }
    valuesByOption.set(option.id, ids);
  }
  const variantIds = new Set<string>(), skus = new Set<string>(), combinations = new Set<string>();
  for (const variant of data.variants) {
    if (variantIds.has(variant.id)) invalid(`Duplicate variant id ${variant.id}`);
    if (skus.has(variant.sku.toLowerCase())) invalid(`Duplicate SKU ${variant.sku}`);
    variantIds.add(variant.id); skus.add(variant.sku.toLowerCase());
    for (const [option, value] of Object.entries(variant.selections)) {
      if (!valuesByOption.get(option)?.has(value)) invalid(`Variant ${variant.sku} selects an unknown option value`);
    }
    const complete = data.options.every(option => variant.selections[option.id] !== undefined);
    if (variant.status === "active" && !complete) invalid(`Active variant ${variant.sku} must select every option`);
    if (variant.status !== "archived" && complete) {
      const signature = data.options.map(option => variant.selections[option.id]).join("\u0000");
      if (combinations.has(signature)) invalid(`Variant ${variant.sku} repeats another variant's option combination`);
      combinations.add(signature);
    }
    if (variant.originalPrice != null && variant.originalPrice < variant.price) invalid(`Compare-at price of ${variant.sku} is below its selling price`);
  }
  const live = data.variants.filter(variant => variant.status !== "archived"), defaults = live.filter(variant => variant.isDefault);
  if (defaults.length > 1) invalid("Only one variant can be the default");
  return (defaults[0] ?? live.find(variant => variant.status === "active") ?? live[0])?.id ?? null;
}

interface OptionRow { id: string; key: string; name: string; position: number }
interface ValueRow { id: string; option_id: string; key: string; label: string; position: number }
interface VariantRow { id: string; sku: string; name: string | null; status: string; is_default: boolean }

export async function syncProductVariants(client: PoolClient, raw: VariantSyncInput): Promise<VariantSyncResult> {
  const data = parse(raw), productId = data.productId;
  if (!(await client.query("SELECT 1 FROM products WHERE id=$1 FOR UPDATE", [productId])).rowCount) throw new AuthFailure("NOT_FOUND", 404, "Product was not found");
  const defaultLegacyId = validate(data);
  const result: VariantSyncResult = {
    productId, variantIds: {}, defaultVariantId: null,
    options: { created: 0, updated: 0, removed: 0 }, values: { created: 0, updated: 0, removed: 0 },
    variants: { created: 0, updated: 0, unchanged: 0, archived: 0, deleted: 0 },
    prices: { created: 0, updated: 0, unchanged: 0 }, media: { linked: 0, skipped: 0, changed: false }, stock: { movements: 0, unchanged: 0 },
  };

  // 1. Options and values. Keys that change (or belong to removed rows) move to a temporary key first,
  //    so swapping two keys never trips the per-product/per-option unique indexes.
  const existingOptions = (await client.query<OptionRow>("SELECT id,key,name,position FROM product_options WHERE product_id=$1", [productId])).rows;
  const existingValues = (await client.query<ValueRow>("SELECT id,option_id,key,label,position FROM option_values WHERE product_id=$1", [productId])).rows;
  const optionDbId = new Map<string, string>(), valueDbId = new Map<string, string>();
  const keptOptions = new Set<string>(), keptValues = new Set<string>();
  const optionPlan = data.options.map((option, position) => {
    const derived = syncId(productId, "option", option.id), key = optionKey(option.key);
    const match = existingOptions.find(row => row.id === derived && !keptOptions.has(row.id)) ?? existingOptions.find(row => row.key === key && !keptOptions.has(row.id));
    const id = match?.id ?? derived;
    keptOptions.add(id); optionDbId.set(option.id, id);
    return { option, id, key, position, match };
  });
  for (const row of existingOptions) if (!keptOptions.has(row.id) || optionPlan.some(plan => plan.match?.id === row.id && plan.key !== row.key)) await client.query("UPDATE product_options SET key=$2 WHERE id=$1", [row.id, temporary(row.id)]);
  for (const plan of optionPlan) {
    if (!plan.match) { await client.query("INSERT INTO product_options(id,product_id,key,name,position) VALUES($1,$2,$3,$4,$5)", [plan.id, productId, plan.key, plan.option.name, plan.position]); result.options.created++; }
    else if (plan.match.key !== plan.key || plan.match.name !== plan.option.name || plan.match.position !== plan.position) { await client.query("UPDATE product_options SET key=$2,name=$3,position=$4 WHERE id=$1", [plan.id, plan.key, plan.option.name, plan.position]); result.options.updated++; }
  }
  for (const plan of optionPlan) {
    const current = existingValues.filter(row => row.option_id === plan.id);
    const valuePlan = plan.option.values.map((value, position) => {
      const derived = syncId(productId, "option-value", plan.option.id, value.id);
      const match = current.find(row => row.id === derived && !keptValues.has(row.id)) ?? current.find(row => row.key === value.key && !keptValues.has(row.id));
      const id = match?.id ?? derived;
      keptValues.add(id); valueDbId.set(`${plan.option.id}\u0000${value.id}`, id);
      return { value, id, position, match };
    });
    for (const row of current) if (!keptValues.has(row.id) || valuePlan.some(item => item.match?.id === row.id && item.value.key !== row.key)) await client.query("UPDATE option_values SET key=$2 WHERE id=$1", [row.id, temporary(row.id)]);
    for (const item of valuePlan) {
      if (!item.match) { await client.query("INSERT INTO option_values(id,product_id,option_id,key,label,position) VALUES($1,$2,$3,$4,$5,$6)", [item.id, productId, plan.id, item.value.key, item.value.label, item.position]); result.values.created++; }
      else if (item.match.key !== item.value.key || item.match.label !== item.value.label || item.match.position !== item.position) { await client.query("UPDATE option_values SET key=$2,label=$3,position=$4 WHERE id=$1", [item.id, item.value.key, item.value.label, item.position]); result.values.updated++; }
    }
  }

  // 2. Variants: match by derived id, then by SKU within this product. A SKU owned by another product is a conflict.
  const existingVariants = (await client.query<VariantRow>("SELECT id,sku,name,status,is_default FROM product_variants WHERE product_id=$1 ORDER BY id", [productId])).rows;
  const matched = new Set<string>();
  const variantPlan = data.variants.map(variant => {
    const derived = syncId(productId, "variant", variant.id);
    const match = existingVariants.find(row => row.id === derived && !matched.has(row.id)) ?? existingVariants.find(row => row.sku.toLowerCase() === variant.sku.toLowerCase() && !matched.has(row.id));
    const id = match?.id ?? derived;
    matched.add(id); result.variantIds[variant.id] = id;
    return { variant, id, match, isDefault: variant.id === defaultLegacyId };
  });
  const foreign = (await client.query<{ sku: string }>("SELECT sku FROM product_variants WHERE product_id<>$1 AND lower(sku)=ANY($2::text[])", [productId, data.variants.map(variant => variant.sku.toLowerCase())])).rows;
  if (foreign.length) throw new AuthFailure("SKU_CONFLICT", 409, `SKU ${foreign[0].sku} already belongs to another product`);
  const defaultId = defaultLegacyId === null ? null : result.variantIds[defaultLegacyId];
  result.defaultVariantId = defaultId;
  // At most one non-archived default exists at any moment: clear every other default first.
  await client.query("UPDATE product_variants SET is_default=false,version=version+1,updated_at=clock_timestamp() WHERE product_id=$1 AND is_default AND ($2::uuid IS NULL OR id<>$2::uuid)", [productId, defaultId]);

  // 3. Removed variants: delete when unreferenced (savepoint), otherwise archive.
  const wantedSkus = new Set(data.variants.map(variant => variant.sku.toLowerCase()));
  for (const row of existingVariants.filter(row => !matched.has(row.id))) {
    await client.query("SAVEPOINT variant_sync_remove");
    try {
      await client.query("DELETE FROM variant_option_values WHERE variant_id=$1", [row.id]);
      await client.query("DELETE FROM product_media WHERE variant_id=$1", [row.id]);
      await client.query("DELETE FROM prices WHERE variant_id=$1", [row.id]);
      await client.query("DELETE FROM product_variants WHERE id=$1", [row.id]);
      await client.query("RELEASE SAVEPOINT variant_sync_remove");
      result.variants.deleted++;
    } catch (error) {
      // 23001 restrict_violation (ON DELETE RESTRICT), 23503 foreign_key_violation.
      if (!["23001", "23503"].includes((error as { code?: string } | null)?.code ?? "")) throw error;
      await client.query("ROLLBACK TO SAVEPOINT variant_sync_remove");
      await client.query("RELEASE SAVEPOINT variant_sync_remove");
      const sku = wantedSkus.has(row.sku.toLowerCase()) ? `${row.sku}-archived-${row.id.slice(0, 8)}` : row.sku;
      if (row.status !== "archived" || sku !== row.sku) await client.query("UPDATE product_variants SET status='archived',is_default=false,sku=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1", [row.id, sku]);
      result.variants.archived++;
    }
  }

  // 4. Upsert variants (changed SKUs pass through a temporary value so two variants can swap SKUs).
  for (const plan of variantPlan) if (plan.match && plan.match.sku !== plan.variant.sku) await client.query("UPDATE product_variants SET sku=$2 WHERE id=$1", [plan.id, temporary(plan.id)]);
  for (const plan of variantPlan) {
    const { variant } = plan, name = variant.title || null, isDefault = plan.isDefault && variant.status !== "archived";
    if (!plan.match) {
      await client.query("INSERT INTO product_variants(id,product_id,sku,name,status,is_default) VALUES($1,$2,$3,$4,$5,$6)", [plan.id, productId, variant.sku, name, variant.status, isDefault]);
      result.variants.created++;
    } else {
      // Every default except `defaultId` was cleared in step 2.
      const current = plan.match, currentDefault = current.is_default && current.id === defaultId;
      if (current.sku !== variant.sku || current.name !== name || current.status !== variant.status || currentDefault !== isDefault) {
        await client.query("UPDATE product_variants SET sku=$2,name=$3,status=$4,is_default=$5,version=version+1,updated_at=clock_timestamp() WHERE id=$1", [plan.id, variant.sku, name, variant.status, isDefault]);
        result.variants.updated++;
      } else result.variants.unchanged++;
    }
  }

  // 5. Option selections: write only differences.
  const selections = (await client.query<{ variant_id: string; option_id: string; option_value_id: string }>("SELECT variant_id,option_id,option_value_id FROM variant_option_values WHERE product_id=$1", [productId])).rows;
  for (const plan of variantPlan) {
    const wanted = new Map(Object.entries(plan.variant.selections).map(([option, value]) => [optionDbId.get(option)!, valueDbId.get(`${option}\u0000${value}`)!]));
    const current = selections.filter(row => row.variant_id === plan.id);
    for (const row of current) {
      const target = wanted.get(row.option_id);
      if (target === undefined) await client.query("DELETE FROM variant_option_values WHERE variant_id=$1 AND option_id=$2", [plan.id, row.option_id]);
      else if (target !== row.option_value_id) await client.query("UPDATE variant_option_values SET option_value_id=$3 WHERE variant_id=$1 AND option_id=$2", [plan.id, row.option_id, target]);
    }
    for (const [option, value] of wanted) if (!current.some(row => row.option_id === option)) await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)", [plan.id, productId, option, value]);
  }

  // 6. Values and options that left the input (any remaining selections belong to archived variants).
  const removedValues = existingValues.filter(row => !keptValues.has(row.id)).map(row => row.id);
  const removedOptions = existingOptions.filter(row => !keptOptions.has(row.id)).map(row => row.id);
  if (removedValues.length) {
    await client.query("DELETE FROM variant_option_values WHERE product_id=$1 AND option_value_id=ANY($2::uuid[])", [productId, removedValues]);
    await client.query("DELETE FROM option_values WHERE id=ANY($1::uuid[])", [removedValues]);
    result.values.removed = removedValues.length;
  }
  if (removedOptions.length) {
    await client.query("DELETE FROM variant_option_values WHERE product_id=$1 AND option_id=ANY($2::uuid[])", [productId, removedOptions]);
    await client.query("DELETE FROM product_options WHERE id=ANY($1::uuid[])", [removedOptions]);
    result.options.removed = removedOptions.length;
  }

  // 7. One active KZT price per live variant and market, updated in place (version+1) when it changes.
  for (const plan of variantPlan.filter(plan => plan.variant.status !== "archived")) {
    const amount = plan.variant.price.toString(), compare = plan.variant.originalPrice == null ? null : plan.variant.originalPrice.toString();
    const price = (await client.query<{ id: string; amount: string; compare: string | null }>("SELECT id,amount_minor::text AS amount,compare_at_minor::text AS compare FROM prices WHERE variant_id=$1 AND market=$2 AND currency='KZT' AND is_active", [plan.id, data.market])).rows[0];
    if (!price) {
      const inserted = await client.query("INSERT INTO prices(id,variant_id,market,amount_minor,compare_at_minor) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING", [syncId(plan.id, "price", data.market, "KZT"), plan.id, data.market, amount, compare]);
      if (!inserted.rowCount) await client.query("INSERT INTO prices(id,variant_id,market,amount_minor,compare_at_minor) VALUES($1,$2,$3,$4,$5)", [randomUUID(), plan.id, data.market, amount, compare]);
      result.prices.created++;
    } else if (price.amount !== amount || price.compare !== compare) {
      await client.query("UPDATE prices SET amount_minor=$2,compare_at_minor=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1", [price.id, amount, compare]);
      result.prices.updated++;
    } else result.prices.unchanged++;
  }

  // 8. Media: only images whose file metadata the caller verified become `ready` public assets.
  if (data.images) await syncMedia(client, data, variantPlan, result);

  // 9. Stock through the ledger (never a direct counter write).
  if (data.stock) {
    const reference = data.stock.sourceReference;
    for (const plan of variantPlan.filter(plan => plan.variant.status !== "archived" && plan.variant.stock !== undefined).sort((a, b) => a.id.localeCompare(b.id))) {
      const change = await setStockFromSource(client, { variantId: plan.id, onHand: plan.variant.stock!, sourceReference: `${reference}#${plan.variant.id}`, actorUserId: data.stock.actorUserId ?? null });
      if (change.movementId) result.stock.movements++; else result.stock.unchanged++;
    }
  }
  return result;
}

async function syncMedia(client: PoolClient, data: Input, variantPlan: { variant: Input["variants"][number]; id: string }[], result: VariantSyncResult) {
  const mediaIds = new Map<string, string>(), images = data.images ?? [];
  for (const image of images) {
    if (!image.file) { result.media.skipped++; continue; }
    const width = image.width && image.height ? image.width : null, height = width ? image.height : null, alt = image.alt?.trim() || null;
    const row = (await client.query<{ id: string; status: string; mime_type: string | null; byte_size: string | null; checksum_sha256: string | null; width: number | null; height: number | null; alt_text: string | null }>(
      "SELECT id,status,mime_type,byte_size::text AS byte_size,checksum_sha256,width,height,alt_text FROM media_assets WHERE storage_namespace=$1 AND storage_key=$2", [MEDIA_NAMESPACE, image.src])).rows[0];
    if (!row) {
      const id = syncId(MEDIA_NAMESPACE, image.src);
      await client.query("INSERT INTO media_assets(id,storage_namespace,storage_key,source_path,kind,visibility,status,mime_type,byte_size,checksum_sha256,width,height,alt_text) VALUES($1,$2,$3,$3,'image','public','ready',$4,$5,$6,$7,$8,$9)",
        [id, MEDIA_NAMESPACE, image.src, image.file.mimeType, image.file.byteSize, image.file.checksumSha256, width, height, alt]);
      mediaIds.set(image.id, id);
    } else if (row.status === "ready" || row.status === "pending") {
      if (row.status !== "ready" || row.mime_type !== image.file.mimeType || row.byte_size !== String(image.file.byteSize) || row.checksum_sha256 !== image.file.checksumSha256 || row.width !== width || row.height !== height || (alt !== null && row.alt_text !== alt))
        await client.query("UPDATE media_assets SET status='ready',mime_type=$2,byte_size=$3,checksum_sha256=$4,width=$5,height=$6,alt_text=COALESCE($7,alt_text),updated_at=clock_timestamp() WHERE id=$1", [row.id, image.file.mimeType, image.file.byteSize, image.file.checksumSha256, width, height, alt]);
      mediaIds.set(image.id, row.id);
    } else result.media.skipped++; // quarantined/archived assets are never relinked automatically
  }
  // Images chosen by a live variant form that variant's gallery; the rest (and the default image) the product's.
  const live = variantPlan.filter(plan => plan.variant.status !== "archived");
  const byVariant = new Set(live.flatMap(plan => plan.variant.imageIds));
  const alt = new Map(images.map(image => [image.id, image.alt?.trim() || null]));
  const wanted: { variantId: string | null; mediaId: string; alt: string | null; position: number; primary: boolean }[] = [];
  const productImages = images.filter(image => mediaIds.has(image.id) && (!byVariant.has(image.id) || image.id === data.defaultImageId));
  const primary = productImages.find(image => image.id === data.defaultImageId) ?? productImages[0];
  productImages.forEach((image, position) => wanted.push({ variantId: null, mediaId: mediaIds.get(image.id)!, alt: alt.get(image.id) ?? null, position, primary: image === primary }));
  for (const plan of live) {
    const ids = [...new Set(plan.variant.imageIds)].filter(id => mediaIds.has(id));
    ids.forEach((id, position) => wanted.push({ variantId: plan.id, mediaId: mediaIds.get(id)!, alt: alt.get(id) ?? null, position, primary: position === 0 }));
  }
  const signature = (rows: { variantId: string | null; mediaId: string; alt: string | null; position: number; primary: boolean }[]) => rows.map(row => [row.variantId ?? "", row.mediaId, row.alt ?? "", row.position, row.primary].join("|")).sort().join("\n");
  const existing = (await client.query<{ variant_id: string | null; media_id: string; alt_text: string | null; position: number; is_primary: boolean }>("SELECT variant_id,media_id,alt_text,position,is_primary FROM product_media WHERE product_id=$1", [data.productId])).rows
    .map(row => ({ variantId: row.variant_id, mediaId: row.media_id, alt: row.alt_text, position: row.position, primary: row.is_primary }));
  result.media.linked = wanted.length;
  if (signature(existing) === signature(wanted)) return;
  result.media.changed = true;
  await client.query("DELETE FROM product_media WHERE product_id=$1", [data.productId]);
  for (const row of wanted) await client.query("INSERT INTO product_media(id,product_id,variant_id,media_id,alt_text,position,is_primary) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [syncId(data.productId, "media", row.variantId ?? "product", row.mediaId), data.productId, row.variantId, row.mediaId, row.alt, row.position, row.primary]);
}
