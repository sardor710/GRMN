import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { sanitizeProductInput, isAllowedImageSrc } from "../../lib/cms/product-input.ts";
import { readVariantConfiguration, syncId, syncProductVariants, type VariantSyncInput } from "../catalog/variant-sync.ts";
import { resolveImageFiles } from "../catalog/media-files.ts";
import { collapseRedundantCompatibility, writeAccessoryCompatibility, writeDeviceCompatibility } from "./compatibility.ts";
import { parseProductCommand, READ_ONLY_KEYS, READ_ONLY_VARIANT_KEYS, type ProductCommand, type ProductCommandVariant } from "./product-command.ts";
import { loadEditorProduct, type EditorProduct } from "./catalog-read.ts";

// Transactional product save for the PostgreSQL CMS (M2): product row + legacy_content (kept for
// back-compat readers) + options/variants/prices/media/stock through syncProductVariants (stock via the
// inventory ledger) + product_categories + product_compatibility + product_relations, in the caller's
// transaction. The caller authorizes catalog:write; `requireInventory` is awaited only when the save would
// create a product or change a stock level.

export class SkuConflict extends AuthFailure {
  readonly conflicts: string[];
  constructor(conflicts: string[]) {
    super("SKU_CONFLICT", 409, `SKU already in use: ${conflicts.join(", ")}`);
    this.conflicts = conflicts;
  }
}

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (message: string): never => fail("INVALID_INPUT", 400, message);
const json = (value: unknown) => JSON.stringify(value);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export interface WriteContext { principal: Principal; requireInventory: () => Promise<unknown> }
export interface WriteResult { productId: string; publicKey: string; version: number; created: boolean }

interface OldProduct { id: string; public_key: string; version: number; status: string; legacy_content: Record<string, unknown>; name: string; description: string; family: string | null; badge: string | null; price_suffix: string | null; is_featured: boolean; specs: unknown; features: unknown; in_the_box: unknown; seo_title: string | null; seo_description: string | null; focus_keywords: unknown; canonical_url: string | null; no_index: boolean; og_image_source: string | null }

/** Parse + sanitize (overview HTML, image/swatch allowlists) into a command; 400 on the first problem. */
export function prepareCommand(raw: unknown): ProductCommand {
  const parsed = parseProductCommand(raw);
  if (!parsed.ok) return invalid(parsed.message);
  const command = parsed.command;
  const checked = sanitizeProductInput(command as unknown as Record<string, unknown>);
  if (!checked.ok) return invalid(checked.error);
  const data = checked.product as unknown as ProductCommand;
  for (const item of data.inTheBox ?? []) if (typeof item === "object" && item.image && !isAllowedImageSrc(item.image)) invalid(`In-the-box image not allowed: ${item.image.slice(0, 80)}`);
  for (const key of READ_ONLY_KEYS) delete (data as Record<string, unknown>)[key];
  for (const variant of data.variants ?? []) for (const key of READ_ONLY_VARIANT_KEYS) delete (variant as Record<string, unknown>)[key];
  return data;
}

/** Minor units → exact KZT decimal text (syncProductVariants takes KZT amounts). */
const minorToKzt = (minor: string) => { const value = BigInt(minor); return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`; };
const variantStatusFor =(status: string) => status === "archived" ? "archived" as const : status === "published" ? "active" as const : "draft" as const;

export async function writeProduct(client: PoolClient, context: WriteContext, raw: unknown): Promise<WriteResult> {
  const data = prepareCommand(raw);
  const old = data.id ? (await client.query<OldProduct>("SELECT * FROM products WHERE public_key=$1 FOR UPDATE", [data.id])).rows[0] : undefined;
  if (data.id && !old) fail("NOT_FOUND", 404, "Product was not found");
  if (old ? data.version !== old.version : data.version !== undefined && data.version !== 0) fail("VERSION_CONFLICT", 409, "Product changed; reload before saving");
  if (!old) await context.requireInventory(); // creating a product creates its stock rows
  const productId = old?.id ?? randomUUID(), publicKey = old?.public_key ?? randomUUID(), status = data.status ?? old?.status ?? "draft";
  const current = old ? await readVariantConfiguration(client, productId) : { options: [], variants: [] };
  const oldContent = record(old?.legacy_content);

  // 1. The variant set to sync. `variants` omitted = keep the configuration and patch only the default
  //    variant from the product-level fields (older screens that know nothing about variants);
  //    `variants: []` = a simple product with exactly one default variant.
  let options = data.options, variants: ProductCommandVariant[];
  const defaultCurrent = current.variants.find(variant => variant.isDefault) ?? current.variants[0];
  const simpleDefault = (): ProductCommandVariant => ({
    id: defaultCurrent?.id ?? "default", sku: data.sku ?? defaultCurrent?.sku ?? invalid("A product without variants needs a SKU"), title: "", selections: {},
    price: data.price ?? defaultCurrent?.priceMinor ?? invalid("A product without variants needs a price"),
    originalPrice: data.originalPrice === undefined ? defaultCurrent?.compareAtMinor ?? null : data.originalPrice,
    stock: data.stock, stockBaseline: data.stockBaseline, status: variantStatusFor(status), isDefault: true, imageIds: [],
  });
  if (data.variants === undefined && options === undefined && current.options.length) {
    options = current.options.map(option => ({ id: option.id, key: option.key, name: option.name, display: option.display, values: option.values.map(value => ({ id: value.id, key: value.key, label: value.label, ...(value.swatchColor ? { swatchColor: value.swatchColor } : {}), ...(value.swatchImage ? { swatchImage: value.swatchImage } : {}) })) }));
    variants = current.variants.map(variant => variant === defaultCurrent
      ? { ...simpleDefault(), id: variant.id, title: variant.title ?? "", selections: variant.selections, status: variant.status }
      : { id: variant.id, sku: variant.sku, title: variant.title ?? "", selections: variant.selections, price: variant.priceMinor ?? "0", originalPrice: variant.compareAtMinor, status: variant.status, isDefault: false, imageIds: [] });
  } else if (!data.variants?.length) { options = []; variants = [simpleDefault()]; }
  else variants = data.variants;
  options ??= [];
  const isSimple = !data.variants?.length && !options.length;

  // 2. Exact money rules and SKU uniqueness (case-insensitive, across every product) before any write.
  for (const variant of variants) if (variant.originalPrice != null && BigInt(variant.originalPrice) < BigInt(variant.price)) invalid(`Compare-at price of ${variant.sku} cannot be below its selling price`);
  const lowered = variants.map(variant => variant.sku.toLowerCase());
  const duplicates = [...new Set(variants.filter((variant, index) => lowered.indexOf(variant.sku.toLowerCase()) !== index).map(variant => variant.sku))];
  if (duplicates.length) throw new SkuConflict(duplicates);
  const foreign = (await client.query<{ sku: string }>("SELECT sku FROM product_variants WHERE product_id<>$1 AND lower(sku)=ANY($2::text[]) ORDER BY sku", [productId, lowered])).rows;
  if (foreign.length) throw new SkuConflict(foreign.map(row => row.sku));

  // 3. Stock: only changed levels are written (ledger); a change needs inventory:write, and a level that
  //    moved since the editor loaded it (stockBaseline) is a conflict, never a silent overwrite.
  const matchCurrent = (variant: ProductCommandVariant) => current.variants.find(row => row.id === variant.id || row.id === syncId(productId, "variant", variant.id)) ?? current.variants.find(row => row.sku.toLowerCase() === variant.sku.toLowerCase());
  let stockChanges = 0;
  const syncVariants = variants.map(variant => {
    const { stock, stockBaseline, ...rest } = variant;
    const existing = matchCurrent(variant);
    if (stock === undefined || variant.status === "archived") return rest;
    if (existing && existing.tracked && existing.onHand === stock) return rest;
    // Unchanged in the editor (equal to what it loaded): keep whatever the ledger holds now.
    if (existing && stockBaseline !== undefined && stock === stockBaseline) return rest;
    if (existing && stockBaseline !== undefined && existing.onHand !== stockBaseline) fail("STOCK_CONFLICT", 409, `Stock of ${variant.sku} changed to ${existing.onHand} since it was loaded; reload before saving`);
    if ((!existing || !existing.tracked) && stock === 0) return { ...rest, stock };
    if (existing && stock < existing.reserved) fail("INSUFFICIENT_STOCK", 409, `Stock of ${variant.sku} cannot go below its ${existing.reserved} reserved units`);
    stockChanges++;
    return { ...rest, stock };
  });
  if (stockChanges && old) await context.requireInventory();

  // 4. Product row. legacy_content first takes the command's legacy-only fields (and the per-variant extras
  //    the tables have no columns for), then is rewritten from the stored result at the end of the save.
  const content: Record<string, unknown> = { ...oldContent };
  for (const key of LEGACY_KEYS) if ((data as Record<string, unknown>)[key] !== undefined) content[key] = (data as Record<string, unknown>)[key];
  if (data.variants !== undefined || data.options !== undefined || !current.options.length) content.variants = isSimple ? [] : variants.map(variant => ({ id: variant.id, sku: variant.sku, imageIds: variant.imageIds, ...(variant.sourcePartNumber ? { sourcePartNumber: variant.sourcePartNumber } : {}), ...(variant.sourcePrice ? { sourcePrice: variant.sourcePrice } : {}) }));
  const pick = <T>(value: T | undefined, fallback: T): T => value === undefined ? fallback : value;
  const fields = [
    data.name, pick(data.description, old?.description ?? ""), pick(data.family, old?.family ?? null) || null, pick(data.badge, old?.badge ?? null) || null, pick(data.priceSuffix, old?.price_suffix ?? null) || null,
    status, pick(data.isFeatured, old?.is_featured ?? false), json(pick(data.specs, old?.specs ?? [])), json(pick(data.features, old?.features ?? [])), json(pick(data.inTheBox, old?.in_the_box ?? [])),
    json(content), pick(data.seoTitle, old?.seo_title ?? null) || null, pick(data.seoDescription, old?.seo_description ?? null) || null, json(pick(data.focusKeywords, old?.focus_keywords ?? [])),
    pick(data.canonicalUrl, old?.canonical_url ?? null) || null, pick(data.noIndex, old?.no_index ?? false), pick(data.ogImage, old?.og_image_source ?? null) || null,
  ];
  if (old) await client.query("UPDATE products SET name=$2,description=$3,family=$4,badge=$5,price_suffix=$6,status=$7,is_featured=$8,specs=$9,features=$10,in_the_box=$11,legacy_content=$12,seo_title=$13,seo_description=$14,focus_keywords=$15,canonical_url=$16,no_index=$17,og_image_source=$18,version=version+1,updated_at=clock_timestamp() WHERE id=$1", [productId, ...fields]);
  else await client.query("INSERT INTO products(id,name,description,family,badge,price_suffix,status,is_featured,specs,features,in_the_box,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source,public_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)", [productId, ...fields, publicKey]);

  // 5. Options, variants, prices, media and stock (ledger) in one place.
  const images = data.images;
  const files = images ? await resolveImageFiles(client, images.map(image => image.src)) : undefined;
  const input: VariantSyncInput = {
    productId, options, variants: syncVariants.map(variant => ({ ...variant, price: minorToKzt(variant.price), originalPrice: variant.originalPrice == null ? null : minorToKzt(variant.originalPrice) })),
    ...(images ? { images: images.map(image => ({ id: image.id, src: image.src, alt: image.alt, width: image.width, height: image.height, file: files?.get(image.src) ?? null })), defaultImageId: data.defaultImageId ?? null } : {}),
    stock: { sourceReference: `admin:${publicKey}`, actorUserId: context.principal.userId },
  };
  await syncProductVariants(client, input);

  // 6. Categories (replace the set; exactly one primary), relations, compatibility.
  if (data.categories !== undefined) await writeCategories(client, productId, data.categories);
  if (data.relations) await writeRelations(client, productId, data.relations);
  const counterparts = new Set<string>();
  if (data.compatibility?.devices) for (const id of await writeAccessoryCompatibility(client, productId, data.compatibility.devices)) counterparts.add(id);
  if (data.compatibility?.accessories) for (const id of await writeDeviceCompatibility(client, productId, data.compatibility.accessories)) counterparts.add(id);
  if (data.compatibility || (old && (data.variants !== undefined || data.options !== undefined))) for (const id of await collapseRedundantCompatibility(client, productId)) counterparts.add(id);
  counterparts.delete(productId);
  if (counterparts.size) await client.query("UPDATE products SET version=version+1 WHERE id=ANY($1::uuid[])", [[...counterparts].sort()]);

  // 7. legacy_content = the stored editor shape (stored ids), without the relational extras, for readers
  //    that still project legacy_content (the legacy list DTO, cart image fallback, storefront category).
  const stored = await loadEditorProduct(client, productId, { relations: false });
  const legacy = legacyContent(stored);
  await client.query("UPDATE products SET legacy_content=$2 WHERE id=$1", [productId, json(legacy)]);
  const version = old ? old.version + 1 : 1;
  await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'cms.saved','product',$3,$4,$5)",
    [randomUUID(), context.principal.userId, productId, randomUUID(), json({ fields: Object.keys(data).filter(key => !["id", "version"].includes(key)), beforeVersion: old ? old.version : 0, version, stockChanges, compatibilityCounterparts: counterparts.size })]);
  return { productId, publicKey, version, created: !old };
}

/** Product fields with no column of their own; they live in legacy_content. */
const LEGACY_KEYS = ["category", "subCategory", "activities", "level", "caseSize", "compatibleAccessories", "overviewHtml", "specGroups", "source", "image", "images", "defaultImageId"] as const;
const DISPLAY_ONLY = new Set(["stock", "categories", "relations", "compatibility", "primaryCategory", "stockBaseline", "stockReserved", "stockAvailable", "stockTracked", "thumbnail", "updatedAt", "version", "currency", "stockManaged"]);
const VARIANT_DISPLAY_ONLY = new Set(["stock", "stockBaseline", "stockReserved", "stockAvailable", "stockTracked", "version", "thumbnail", "options"]);

/** The stored editor shape as the legacy CMSProduct JSON (stored ids), without relational/display extras. */
function legacyContent(stored: EditorProduct): Record<string, unknown> {
  const shape = Object.fromEntries(Object.entries(stored).filter(([key]) => !DISPLAY_ONLY.has(key)));
  shape.variants = stored.variants.map(variant => Object.fromEntries(Object.entries(variant).filter(([key]) => !VARIANT_DISPLAY_ONLY.has(key))));
  return shape;
}

async function writeCategories(client: PoolClient, productId: string, categories: { key: string; primary: boolean }[]) {
  const rows = categories.length ? (await client.query<{ id: string; key: string; archived: boolean }>("SELECT id,key,archived FROM categories WHERE lower(key)=ANY($1::text[])", [categories.map(category => category.key.toLowerCase())])).rows : [];
  const byKey = new Map(rows.map(row => [row.key.toLowerCase(), row]));
  const missing = categories.filter(category => !byKey.get(category.key.toLowerCase())).map(category => category.key);
  if (missing.length) invalid(`Unknown category: ${missing.join(", ")}`);
  const archived = categories.filter(category => byKey.get(category.key.toLowerCase())!.archived).map(category => category.key);
  if (archived.length) invalid(`Archived category cannot be assigned: ${archived.join(", ")}`);
  await client.query("DELETE FROM product_categories WHERE product_id=$1", [productId]);
  // Primary last-in after the delete keeps product_categories_primary_unique satisfied at every statement.
  for (const category of categories) await client.query("INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,$3)", [productId, byKey.get(category.key.toLowerCase())!.id, category.primary]);
}

async function writeRelations(client: PoolClient, productId: string, relations: { related?: string[]; upsell?: string[] }) {
  for (const type of ["related", "upsell"] as const) {
    const keys = relations[type];
    if (!keys) continue;
    const rows = keys.length ? (await client.query<{ id: string; public_key: string }>("SELECT id,public_key FROM products WHERE public_key=ANY($1::text[])", [keys])).rows : [];
    const byKey = new Map(rows.map(row => [row.public_key, row.id]));
    const missing = keys.filter(key => !byKey.has(key));
    if (missing.length) invalid(`Unknown related product: ${missing.slice(0, 5).join(", ")}`);
    if (keys.some(key => byKey.get(key) === productId)) invalid("A product cannot be related to itself");
    await client.query("DELETE FROM product_relations WHERE source_product_id=$1 AND relation_type=$2", [productId, type]);
    for (const [position, key] of keys.entries()) await client.query("INSERT INTO product_relations(source_product_id,target_product_id,relation_type,position) VALUES($1,$2,$3,$4)", [productId, byKey.get(key), type, position]);
  }
}

