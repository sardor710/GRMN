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
import { PRODUCT_HTML_FIELDS } from "../../lib/cms/product-input.ts";
import { findUnpricedForPublish, unpricedMessage } from "../../lib/cms/publish-price.ts";
import { PRODUCT_SPEC } from "../../i18n/translate-record.ts";
import { LOCALES, mergedTranslations, rekeyVariantTranslations, sortedJSON, variantTranslations } from "./product-translations.ts";

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

export interface WriteContext {
  principal: Principal; requireInventory: () => Promise<unknown>;
  /**
   * beta5 merge: what a sent variant without `content` means. "inherit" (the legacy CMS route, whose content editor
   * omits it for "Same as product") resets its overrides; "keep" (default: the catalog API, whose editor may not send
   * it) leaves the stored overrides as they are.
   */
  omittedVariantContent?: "inherit" | "keep";
}
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
// beta5 merge (beta 1d8079f "archived products keep their default variant"): an archived simple product keeps its one
// variant as a draft default, so the product stays readable in the admin (price, SKU) and can be published again;
// the product status alone keeps it off the storefront.
const variantStatusFor = (status: string) => status === "published" ? "active" as const : "draft" as const;

export async function writeProduct(client: PoolClient, context: WriteContext, raw: unknown): Promise<WriteResult> {
  const data = prepareCommand(raw);
  // beta5 merge: invalid ru/kk overlays are refused before any write (the merge below repeats it on the stored rows).
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw) && (raw as { translations?: unknown }).translations !== undefined)
    mergedTranslations({}, (raw as { translations?: unknown }).translations, PRODUCT_SPEC, PRODUCT_HTML_FIELDS);
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
    // null (sent, or read back for a variant without an active price) stays null: never a made-up 0 KZT.
    price: data.price !== undefined ? data.price : defaultCurrent ? defaultCurrent.priceMinor : invalid("A product without variants needs a price"),
    originalPrice: data.originalPrice === undefined ? defaultCurrent?.compareAtMinor ?? null : data.originalPrice,
    stock: data.stock, stockBaseline: data.stockBaseline, status: variantStatusFor(status), isDefault: true, imageIds: [],
  });
  if (data.variants === undefined && options === undefined && current.options.length) {
    options = current.options.map(option => ({ id: option.id, key: option.key, name: option.name, display: option.display, values: option.values.map(value => ({ id: value.id, key: value.key, label: value.label, ...(value.swatchColor ? { swatchColor: value.swatchColor } : {}), ...(value.swatchImage ? { swatchImage: value.swatchImage } : {}) })) }));
    variants = current.variants.map(variant => variant === defaultCurrent
      ? { ...simpleDefault(), id: variant.id, title: variant.title ?? "", selections: variant.selections, status: variant.status }
      : { id: variant.id, sku: variant.sku, title: variant.title ?? "", selections: variant.selections, price: variant.priceMinor, originalPrice: variant.compareAtMinor, status: variant.status, isDefault: false, imageIds: [] });
  } else if (!data.variants?.length) { options = []; variants = [simpleDefault()]; }
  else variants = data.variants;
  options ??= [];
  // beta5 merge (beta F-c): an editor that loaded a pre-merge document sends its own variant ids (the legacy projection
  // or the importer made the stored rows). A sent id that is not a stored row id is resolved through the previous
  // document's SKU for that id, so a renamed SKU keeps its row (cart lines, stock, history) instead of a new row.
  // beta5 merge: a pre-merge editor document keys option values by their label ("Beige, Cream, White") while the
  // legacy projection stored a slug key and its own id. A sent value that matches no stored value by id, derived id
  // or key is matched by label within its option, so it keeps the stored row (id and key) instead of a new row,
  // and the variants' selections follow it.
  if (old && options.length && current.options.length) {
    const remap = new Map<string, Map<string, string>>();
    options = options.map(option => {
      const stored = current.options.find(row => row.id === option.id || row.id === syncId(productId, "option", option.id)) ?? current.options.find(row => row.key === option.key.trim().toLowerCase());
      if (!stored) return option;
      const claimed = new Set<string>();
      const values = option.values.map(value => {
        const direct = stored.values.find(row => row.id === value.id || row.id === syncId(productId, "option-value", option.id, value.id) || row.key === value.key);
        if (direct) { claimed.add(direct.id); return value; }
        return value;
      }).map(value => {
        if (stored.values.some(row => row.id === value.id || row.id === syncId(productId, "option-value", option.id, value.id) || row.key === value.key)) return value;
        const label = value.label.trim().toLowerCase();
        const row = stored.values.find(item => item.label.trim().toLowerCase() === label && !claimed.has(item.id));
        if (!row) return value;
        claimed.add(row.id);
        if (!remap.has(option.id)) remap.set(option.id, new Map());
        remap.get(option.id)!.set(value.id, row.id);
        return { ...value, id: row.id, key: row.key };
      });
      return { ...option, values };
    });
    if (remap.size) variants = variants.map(variant => ({
      ...variant,
      selections: Object.fromEntries(Object.entries(variant.selections).map(([optionId, valueId]) => [optionId, remap.get(optionId)?.get(valueId) ?? valueId])),
    }));
  }
  const sentVariantIds = variants.map(variant => ({ id: variant.id, sku: variant.sku }));
  if (old && current.variants.length) {
    const storedIds = new Set(current.variants.map(row => row.id));
    const previousSku = new Map<string, string>();
    for (const entry of (Array.isArray(oldContent.variants) ? oldContent.variants : []).map(record))
      if (typeof entry.id === "string" && typeof entry.sku === "string") previousSku.set(entry.id, entry.sku.toLowerCase());
    const claimed = new Set(variants.filter(variant => storedIds.has(variant.id)).map(variant => variant.id));
    variants = variants.map(variant => {
      if (storedIds.has(variant.id) || storedIds.has(syncId(productId, "variant", variant.id))) return variant;
      const sku = previousSku.get(variant.id), row = sku ? current.variants.find(item => item.sku.toLowerCase() === sku && !claimed.has(item.id)) : undefined;
      if (!row) return variant;
      claimed.add(row.id);
      return { ...variant, id: row.id };
    });
  }
  const isSimple = !data.variants?.length && !options.length;

  // 2. Exact money rules and SKU uniqueness (case-insensitive, across every product) before any write.
  for (const variant of variants) {
    // A missing price is never invented (no price row is written); only a variant that is for sale needs one.
    if (variant.price === null) {
      if (variant.status === "active") invalid(isSimple ? "A published product needs a price" : `Active variant ${variant.sku} needs a price (or keep it as a draft)`);
      continue;
    }
    if (variant.originalPrice != null && BigInt(variant.originalPrice) < BigInt(variant.price)) invalid(`Compare-at price of ${variant.sku} cannot be below its selling price`);
  }
  // beta5 merge (beta F-a / final review I1, owner rule): a published product sells nothing at 0 KZT. Its own price
  // (simple product), or every variant the storefront sells, must be above 0, and a variant product must sell at
  // least one. Same rule and messages as the legacy projection (lib/cms/publish-price), on every save path.
  if (status === "published") {
    const positive = (price: string | null | undefined) => price !== null && price !== undefined && BigInt(price) > BigInt(0);
    const found = findUnpricedForPublish<string | null, { sku: string; title: string; status: string; price: string | null }>({
      published: true, hasVariants: !isSimple, price: isSimple ? variants[0]?.price ?? null : null,
      variants: variants.map(variant => ({ sku: variant.sku, title: variant.title, status: variant.status, price: variant.price })),
    }, positive);
    if (found) invalid(unpricedMessage(found));
  }
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
    // The check above read the balance unlocked; the ledger write re-checks the baseline under the row lock.
    return { ...rest, stock, ...(existing && stockBaseline !== undefined ? { expectedOnHand: stockBaseline } : {}) };
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
    productId, options, variants: syncVariants.map(variant => ({ ...variant, price: variant.price === null ? null : minorToKzt(variant.price), originalPrice: variant.originalPrice == null ? null : minorToKzt(variant.originalPrice) })),
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

  // 6b. beta5 merge (Task 2.1): per-variant Specs / Overview / In the box. A present key is "Own" (even when
  //     empty); a variant sent without `content` keeps its stored overrides. A simple product has none.
  const storedRows = (await client.query<{ id: string; sku: string }>("SELECT id::text AS id,sku FROM product_variants WHERE product_id=$1", [productId])).rows;
  if (isSimple) await client.query("UPDATE product_variants SET content_overrides='{}'::jsonb,version=version+1,updated_at=clock_timestamp() WHERE product_id=$1 AND content_overrides<>'{}'::jsonb", [productId]);
  else {
    const bySku = new Map(storedRows.map(row => [row.sku.toLowerCase(), row.id]));
    for (const variant of variants) {
      const id = bySku.get(variant.sku.toLowerCase());
      if (!id || (variant.content === undefined && context.omittedVariantContent !== "inherit")) continue;
      const own = variant.content ?? {};
      const content = own.overviewHtml === undefined ? own : { ...own, overviewHtml: PRODUCT_HTML_FIELDS.overviewHtml(own.overviewHtml) };
      await client.query("UPDATE product_variants SET content_overrides=$2::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND content_overrides IS DISTINCT FROM $2::jsonb", [id, json(content)]);
    }
  }

  // 7. legacy_content = the stored editor shape (stored ids), without the relational extras, for readers
  //    that still project legacy_content (the legacy list DTO, cart image fallback, storefront category).
  const stored = await loadEditorProduct(client, productId, { relations: false });
  const legacy = legacyContent(stored);
  carrySwatchSources(legacy, data.options ?? (Array.isArray(oldContent.options) ? oldContent.options : []));
  await client.query("UPDATE products SET legacy_content=$2 WHERE id=$1", [productId, json(legacy)]);

  // 8. beta5 merge (Task 24 / Task 2.2): ru/kk overlays in product_translations, merged per locale; variant
  //    overlays follow the saved variants (keyed by stored variant id) and stale ones are pruned on every save.
  // The overlays as sent, before sanitizeProductInput normalised the command: mergedTranslations validates them
  // itself (only ru/kk, per-field limits, HTML fields sanitized), like the legacy save did.
  const sent = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as { translations?: unknown }).translations : undefined;
  const rawTranslations = record(old ? (await client.query<{ t: unknown }>("SELECT jsonb_object_agg(locale,content) AS t FROM product_translations WHERE product_id=$1", [productId])).rows[0]?.t : undefined);
  // Editor variant ids → SKU: the previous document and this save's own variants (an editor that keys its overlays by
  // its local variant ids, e.g. a new product or the content editor at /admin/products/content).
  const editorVariants = [...(Array.isArray(oldContent.variants) ? oldContent.variants : []), ...sentVariantIds];
  const storedTranslations = rekeyVariantTranslations(rawTranslations, editorVariants, storedRows);
  // An editor that loaded the pre-merge document may still send variant overlays keyed by its own variant ids.
  const merged = rekeyVariantTranslations(mergedTranslations(storedTranslations, sent, PRODUCT_SPEC, PRODUCT_HTML_FIELDS), editorVariants, storedRows);
  const translations = variantTranslations(merged, storedTranslations, sent, legacy.variants);
  for (const locale of LOCALES) {
    // A locale whose stored row is already exactly this (after re-keying and pruning) is left untouched.
    if (sortedJSON(translations[locale] ?? null) === sortedJSON(rawTranslations[locale] ?? null)) continue;
    if (translations[locale]) await client.query("INSERT INTO product_translations(product_id,locale,content,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,locale) DO UPDATE SET content=excluded.content,updated_by=excluded.updated_by,updated_at=clock_timestamp()", [productId, locale, json(translations[locale]), context.principal.userId]);
    else await client.query("DELETE FROM product_translations WHERE product_id=$1 AND locale=$2", [productId, locale]);
  }
  const version = old ? old.version + 1 : 1;
  await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'cms.saved','product',$3,$4,$5)",
    [randomUUID(), context.principal.userId, productId, randomUUID(), json({ fields: Object.keys(data).filter(key => !["id", "version"].includes(key)), beforeVersion: old ? old.version : 0, version, stockChanges, compatibilityCounterparts: counterparts.size })]);
  return { productId, publicKey, version, created: !old };
}

/** Product fields with no column of their own; they live in legacy_content. */
const LEGACY_KEYS = ["category", "subCategory", "activities", "level", "caseSize", "compatibleAccessories", "overviewHtml", "specGroups", "source", "image", "images", "defaultImageId"] as const;
const DISPLAY_ONLY = new Set(["translations", "stock", "categories", "relations", "compatibility", "primaryCategory", "stockBaseline", "stockReserved", "stockAvailable", "stockTracked", "thumbnail", "updatedAt", "version", "currency", "stockManaged"]);
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


/**
 * beta5 merge (Task C-d): the catalogue card shows a hex dot only for a colour staff picked in the editor
 * (swatchColorSource "editor"). The tables have no column for that origin, so it is copied from the sent (or
 * previously stored) options onto the rewritten legacy_content, matched by option key and value key; a hex that
 * changed without a source stays unmarked.
 */
function carrySwatchSources(legacy: Record<string, unknown>, sources: readonly unknown[]): void {
  const origin = new Map<string, unknown>();
  for (const option of sources.map(record)) for (const value of (Array.isArray(option.values) ? option.values : []).map(record))
    if (value.swatchColorSource !== undefined) origin.set(`${String(option.key).toLowerCase()}\u0000${String(value.key).toLowerCase()}`, { source: value.swatchColorSource, hex: value.swatchColor });
  if (!origin.size || !Array.isArray(legacy.options)) return;
  for (const option of legacy.options.map(record)) for (const value of (Array.isArray(option.values) ? option.values : []).map(record)) {
    const found = record(origin.get(`${String(option.key).toLowerCase()}\u0000${String(value.key).toLowerCase()}`));
    if (found.source !== undefined && typeof value.swatchColor === "string" && String(found.hex ?? "").toLowerCase() === value.swatchColor.toLowerCase()) value.swatchColorSource = found.source;
  }
}
