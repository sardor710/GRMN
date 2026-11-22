import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { adminDTO } from "../auth/admin-schemas.ts";
import { readVariantConfiguration } from "../catalog/variant-sync.ts";
import type { ListPage, PickerRow, ProductListRow, SkuRow, TaxonomyNode } from "../../contracts/admin-catalog.ts";
import { parseVariantContent, type VariantContent } from "../../lib/catalog/variant-content.ts";
import { rekeyVariantTranslations } from "./product-translations.ts";
import { readCompatibility, type AccessoryLinkInput, type CompatibleAccessoryView, type CompatibleDeviceView, type CompatibleTypeView, type DeviceLinkInput, type TypeLinkInput } from "./compatibility.ts";

// Admin catalog reads for the PostgreSQL CMS (M2). Lists are slim by design (owner: "products list is
// loading so slow"): no overview, specs, galleries or full variants, one thumbnail per row, aggregates
// computed per page row, keyset pagination on (updated_at DESC, id DESC) and a separate total count.
// The per-product read returns the FULL editor payload in the legacy CMSProduct shape plus the relational
// data (categories, compatibility, relations) and stock per variant.

type Query = Pick<PoolClient, "query">;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (message = "Invalid list query"): never => fail("INVALID_INPUT", 400, message);
const kzt = (minor: string | null | undefined): number | undefined => minor == null ? undefined : Number(minor) / 100;
const iso = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
export const LOW_STOCK_THRESHOLD = 5;

export interface EditorVariant {
  /** KZT; null when the variant has no active price (never shown or resaved as 0). */
  id: string; sku: string; title: string; selections: Record<string, string>; price: number | null; originalPrice?: number;
  /** On-hand at the main location (what the editor sets). */
  stock: number; stockBaseline: number; stockReserved: number; stockAvailable: number; stockTracked: boolean;
  status: "draft" | "active" | "archived"; isDefault: boolean; imageIds: string[]; sourcePartNumber?: string; sourcePrice?: Record<string, unknown>;
  version: number; thumbnail: string | null;
  /** beta5 merge (Task 2.1): this variant's own content blocks (content_overrides); a present key is "Own". Absent = inherits all. */
  content?: VariantContent;
}
export interface EditorOption { id: string; key: string; name: string; display: "buttons" | "swatch" | "dropdown"; values: { id: string; key: string; label: string; swatchColor?: string; swatchImage?: string }[] }
export interface EditorProduct extends Record<string, unknown> {
  id: string; version: number; name: string; sku: string; price: number | null; originalPrice?: number; description: string; image: string; family: string;
  category: string; subCategory: string; activities: string[];
  stock: number; stockBaseline?: number; stockReserved: number; stockAvailable: number; stockTracked: boolean; stockManaged: boolean;
  status: string; isFeatured: boolean; specs: unknown[]; inTheBox: unknown[]; features: unknown[]; compatibleAccessories: string[];
  images: Record<string, unknown>[]; options: EditorOption[]; variants: EditorVariant[];
  categories: { key: string; primary: boolean }[]; primaryCategory: { key: string; name: string } | null;
  relations: { related: string[]; upsell: string[] };
  /** Command-shaped links (send back unchanged) plus the resolved views for display. */
  compatibility: { devices: DeviceLinkInput[]; accessories: AccessoryLinkInput[]; types: TypeLinkInput[]; compatibleDevices: CompatibleDeviceView[]; compatibleAccessories: CompatibleAccessoryView[]; compatibleTypes: CompatibleTypeView[] };
  currency: "KZT"; createdAt: string; updatedAt: string; thumbnail: string | null;
}

const thumbnailSQL = (alias: string) => `COALESCE((SELECT COALESCE(m.source_path,m.storage_key) FROM product_media pm JOIN media_assets m ON m.id=pm.media_id AND m.status='ready' WHERE pm.product_id=${alias}.id AND pm.variant_id IS NULL ORDER BY pm.is_primary DESC,pm.position,pm.id LIMIT 1),${alias}.thumbnail_source)`;

export async function productIdForKey(client: Query, key: string): Promise<string> {
  const row = (await client.query<{ id: string }>("SELECT id FROM products WHERE public_key=$1", [key])).rows[0];
  return row?.id ?? fail("NOT_FOUND", 404, "Product was not found");
}

/** The full editor payload; `relations:false` skips categories/relations/compatibility (used inside saves). */
export async function loadEditorProduct(client: Query, productId: string, input: { relations?: boolean } = {}): Promise<EditorProduct> {
  const row = (await client.query<Record<string, unknown> & { legacy_content: Record<string, unknown>; updated: string; created: string; thumbnail: string | null }>(
    `SELECT p.*,to_char(p.updated_at AT TIME ZONE 'UTC',${iso}) AS updated,to_char(p.created_at AT TIME ZONE 'UTC',${iso}) AS created,${thumbnailSQL("p")} AS thumbnail FROM products p WHERE p.id=$1`, [productId])).rows[0];
  if (!row) return fail("NOT_FOUND", 404, "Product was not found");
  const legacy = adminDTO("products", row.legacy_content ?? {});
  const config = await readVariantConfiguration(client, productId);
  const thumbs = new Map((await client.query<{ variant_id: string; path: string }>(
    "SELECT DISTINCT ON (pm.variant_id) pm.variant_id,COALESCE(m.source_path,m.storage_key) AS path FROM product_media pm JOIN media_assets m ON m.id=pm.media_id AND m.status='ready' WHERE pm.product_id=$1 AND pm.variant_id IS NOT NULL ORDER BY pm.variant_id,pm.is_primary DESC,pm.position,pm.id", [productId])).rows.map(r => [r.variant_id, r.path]));
  const legacyVariants = Array.isArray(legacy.variants) ? legacy.variants as Record<string, unknown>[] : [];
  // beta5 merge: per-variant content (Task 2.1) and ru/kk overlays (Task 24), variant overlays keyed by stored id.
  const overrides = new Map((await client.query<{ id: string; content_overrides: unknown }>("SELECT id::text AS id,content_overrides FROM product_variants WHERE product_id=$1", [productId])).rows.map(r => [r.id, parseVariantContent(r.content_overrides)]));
  const storedTranslations = (await client.query<{ t: unknown }>("SELECT jsonb_object_agg(locale,content) AS t FROM product_translations WHERE product_id=$1", [productId])).rows[0]?.t;
  const translations = storedTranslations ? rekeyVariantTranslations(storedTranslations, row.legacy_content?.variants, config.variants.map(v => ({ id: v.id, sku: v.sku }))) : undefined;
  const extras = (id: string, sku: string) => legacyVariants.find(v => v.id === id) ?? legacyVariants.find(v => typeof v.sku === "string" && v.sku.toLowerCase() === sku.toLowerCase());
  const variants: EditorVariant[] = config.variants.map(variant => {
    const extra = extras(variant.id, variant.sku);
    return {
      id: variant.id, sku: variant.sku, title: variant.title ?? "", selections: variant.selections, price: kzt(variant.priceMinor) ?? null,
      ...(variant.compareAtMinor != null ? { originalPrice: kzt(variant.compareAtMinor) } : {}),
      stock: variant.onHand, stockBaseline: variant.onHand, stockReserved: variant.reserved, stockAvailable: variant.onHand - variant.reserved, stockTracked: variant.tracked,
      status: variant.status, isDefault: variant.isDefault, imageIds: Array.isArray(extra?.imageIds) ? extra.imageIds as string[] : [],
      ...(typeof extra?.sourcePartNumber === "string" ? { sourcePartNumber: extra.sourcePartNumber } : {}),
      ...(extra?.sourcePrice && typeof extra.sourcePrice === "object" ? { sourcePrice: extra.sourcePrice as Record<string, unknown> } : {}),
      version: variant.version, thumbnail: thumbs.get(variant.id) ?? null,
      ...(Object.keys(overrides.get(variant.id) ?? {}).length ? { content: overrides.get(variant.id) } : {}),
    };
  });
  // Keep the editor's variant order (legacy_content order), then any variant it does not know.
  const order = new Map(legacyVariants.map((v, index) => [String(v.sku ?? "").toLowerCase(), index]));
  variants.sort((a, b) => (order.get(a.sku.toLowerCase()) ?? 1e9) - (order.get(b.sku.toLowerCase()) ?? 1e9));
  const options: EditorOption[] = config.options.map(option => ({ id: option.id, key: option.key, name: option.name, display: option.display, values: option.values.map(value => ({ id: value.id, key: value.key, label: value.label, ...(value.swatchColor ? { swatchColor: value.swatchColor } : {}), ...(value.swatchImage ? { swatchImage: value.swatchImage } : {}) })) }));
  const simple = !options.length && variants.length <= 1;
  const main = variants.find(v => v.isDefault) ?? variants.find(v => v.status === "active") ?? variants[0];
  const sum = (pick: (v: EditorVariant) => number) => variants.filter(v => v.status !== "archived").reduce((total, v) => total + pick(v), 0);
  let categories: EditorProduct["categories"] = [], primaryCategory: EditorProduct["primaryCategory"] = null;
  const relations = { related: [] as string[], upsell: [] as string[] };
  let compatibility: Awaited<ReturnType<typeof readCompatibility>> = { command: { devices: [], accessories: [], types: [] }, compatibleDevices: [], compatibleAccessories: [], compatibleTypes: [] };
  if (input.relations !== false) {
    const cats = (await client.query<{ key: string; name: string; is_primary: boolean }>("SELECT c.key,c.name,pc.is_primary FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=$1 ORDER BY pc.is_primary DESC,c.position,c.key", [productId])).rows;
    categories = cats.map(c => ({ key: c.key, primary: c.is_primary }));
    const primary = cats.find(c => c.is_primary);
    primaryCategory = primary ? { key: primary.key, name: primary.name } : null;
    for (const rel of (await client.query<{ relation_type: string; public_key: string }>("SELECT r.relation_type,t.public_key FROM product_relations r JOIN products t ON t.id=r.target_product_id WHERE r.source_product_id=$1 AND r.relation_type IN ('related','upsell') ORDER BY r.relation_type,r.position,t.public_key", [productId])).rows)
      relations[rel.relation_type as "related" | "upsell"].push(rel.public_key);
    compatibility = await readCompatibility(client, productId);
  }
  const level = ["Entry", "Advanced", "Premium", "Youth"].includes(String(legacy.level)) ? { level: legacy.level } : {};
  const caseSize = ["Small", "Medium", "Large"].includes(String(legacy.caseSize)) ? { caseSize: legacy.caseSize } : {};
  const optional = (value: unknown) => typeof value === "string" && value ? value : undefined;
  return {
    ...(typeof legacy.overviewHtml === "string" ? { overviewHtml: legacy.overviewHtml } : {}),
    ...(Array.isArray(legacy.specGroups) ? { specGroups: legacy.specGroups } : {}),
    ...(legacy.source && typeof legacy.source === "object" && Object.keys(legacy.source).length === 5 ? { source: legacy.source } : {}),
    ...(typeof legacy.defaultImageId === "string" && legacy.defaultImageId ? { defaultImageId: legacy.defaultImageId } : {}),
    ...level, ...caseSize,
    ...(optional(row.badge) ? { badge: row.badge } : {}), ...(optional(row.price_suffix) ? { priceSuffix: row.price_suffix } : {}),
    ...(translations ? { translations } : {}),
    id: String(row.public_key), version: Number(row.version), name: String(row.name), sku: main?.sku ?? (typeof legacy.sku === "string" ? legacy.sku : ""),
    price: main?.price ?? null, ...(main?.originalPrice !== undefined ? { originalPrice: main.originalPrice } : {}),
    description: String(row.description ?? ""), image: typeof legacy.image === "string" ? legacy.image : row.thumbnail ?? "", family: String(row.family ?? ""),
    category: typeof legacy.category === "string" ? legacy.category : "", subCategory: typeof legacy.subCategory === "string" ? legacy.subCategory : "",
    activities: Array.isArray(legacy.activities) ? legacy.activities as string[] : [],
    stock: simple ? main?.stock ?? 0 : sum(v => v.stock),
    // Only a simple product edits stock at product level; variant products carry baselines per variant.
    ...(simple ? { stockBaseline: main?.stockBaseline ?? 0 } : {}),
    stockReserved: sum(v => v.stockReserved), stockAvailable: sum(v => v.stockAvailable), stockTracked: variants.some(v => v.stockTracked), stockManaged: variants.some(v => v.stockTracked),
    status: String(row.status), isFeatured: row.is_featured === true,
    specs: Array.isArray(row.specs) ? row.specs : [], inTheBox: Array.isArray(row.in_the_box) ? row.in_the_box : [], features: Array.isArray(row.features) ? row.features : [],
    compatibleAccessories: Array.isArray(legacy.compatibleAccessories) ? legacy.compatibleAccessories as string[] : [],
    seoTitle: String(row.seo_title ?? ""), seoDescription: String(row.seo_description ?? ""), focusKeywords: Array.isArray(row.focus_keywords) ? row.focus_keywords : [],
    canonicalUrl: String(row.canonical_url ?? ""), noIndex: row.no_index === true, ogImage: String(row.og_image_source ?? ""),
    images: Array.isArray(legacy.images) ? legacy.images as Record<string, unknown>[] : [],
    options: simple ? [] : options, variants: simple ? [] : variants,
    categories, primaryCategory, relations,
    compatibility: { ...compatibility.command, compatibleDevices: compatibility.compatibleDevices, compatibleAccessories: compatibility.compatibleAccessories, compatibleTypes: compatibility.compatibleTypes },
    currency: "KZT", createdAt: row.created, updatedAt: row.updated, thumbnail: row.thumbnail,
  };
}

// ---- Lists ----------------------------------------------------------------------------------------

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
  search: z.string().trim().max(200).default(""),
  status: z.enum(["draft", "published", "archived", "all"]).optional(),
  category: z.string().trim().min(1).max(200).optional(),
  family: z.string().trim().min(1).max(200).optional(),
  stock: z.enum(["in", "low", "out"]).optional(),
  exclude: z.string().trim().min(1).max(128).optional(),
}).strict();
export type ListQuery = z.input<typeof listQuery>;

interface Filters { sql: string[]; values: unknown[]; param: (value: unknown) => string; stockState?: "in" | "low" | "out" }
interface ParsedList { limit: number; cursor?: string; filters: Filters; binding: string }

async function categoryIds(client: Query, key: string): Promise<string[]> {
  const rows = (await client.query<{ id: string }>(`WITH RECURSIVE tree(id) AS (SELECT id FROM categories WHERE key=$1 AND NOT archived UNION SELECT c.id FROM categories c JOIN tree t ON c.parent_id=t.id WHERE NOT c.archived) SELECT id FROM tree`, [key])).rows;
  return rows.length ? rows.map(row => row.id) : invalid("Unknown category");
}

async function parseList(client: Query, scope: string, raw: unknown, variantSearch: boolean): Promise<ParsedList> {
  const result = listQuery.safeParse(raw);
  if (!result.success) return invalid();
  const query = result.data, values: unknown[] = [], sql: string[] = [];
  const param = (value: unknown) => { values.push(value); return `$${values.length}`; };
  if (query.status !== "all") sql.push(query.status ? `p.status=${param(query.status)}` : "p.status<>'archived'");
  if (query.family) sql.push(`p.family=${param(query.family)}`);
  if (query.exclude) sql.push(`p.public_key<>${param(query.exclude)}`);
  if (query.category) sql.push(`EXISTS (SELECT 1 FROM product_categories x WHERE x.product_id=p.id AND x.category_id=ANY(${param(await categoryIds(client, query.category))}::uuid[]))`);
  if (query.search) {
    const pattern = param(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
    sql.push(variantSearch
      ? `(v.sku ILIKE ${pattern} OR v.name ILIKE ${pattern} OR p.name ILIKE ${pattern} OR p.family ILIKE ${pattern})`
      : `(p.name ILIKE ${pattern} OR p.family ILIKE ${pattern} OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id=p.id AND sv.sku ILIKE ${pattern}))`);
  }
  const binding = JSON.stringify([scope, query.search, query.status ?? null, query.category ?? null, query.family ?? null, query.stock ?? null, query.exclude ?? null]);
  return { limit: query.limit, cursor: query.cursor, filters: { sql, values, param, stockState: query.stock }, binding };
}

function decodeCursor<T>(cursor: string | undefined, binding: string, shape: z.ZodType<T>): T | undefined {
  if (!cursor) return undefined;
  try {
    const data = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (data?.scope !== binding) throw Error();
    const parsed = shape.safeParse(data.at);
    if (!parsed.success) throw Error();
    return parsed.data;
  } catch { return fail("INVALID_CURSOR", 400, "Invalid page cursor"); }
}
const encodeCursor = (binding: string, at: unknown) => Buffer.from(JSON.stringify({ scope: binding, at })).toString("base64url");
const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
const stockCondition = (state: "in" | "low" | "out", available: string) => state === "in" ? `${available}>0` : state === "low" ? `${available}>0 AND ${available}<=${LOW_STOCK_THRESHOLD}` : `${available}<=0`;


const productAggregates = `LEFT JOIN LATERAL (
  SELECT count(*)::int AS variant_count,min(pr.amount_minor)::text AS min_price,max(pr.amount_minor)::text AS max_price,
    COALESCE(sum(b.on_hand),0)::int AS on_hand,COALESCE(sum(b.on_hand-b.reserved),0)::int AS available
  FROM product_variants v
  LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market='default'
  LEFT JOIN LATERAL (SELECT sum(ib.on_hand) AS on_hand,sum(ib.reserved) AS reserved FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE ib.variant_id=v.id) b ON true
  WHERE v.product_id=p.id AND v.status<>'archived') agg ON true`;

/** Grouped view: one row per product. */
export async function listProducts(client: Query, raw: unknown, input: { withTotal?: boolean } = {}): Promise<ListPage<ProductListRow>> {
  const list = await parseList(client, "admin:catalog-products", raw, false), { filters } = list;
  const after = decodeCursor(list.cursor, list.binding, z.object({ u: stamp, id: z.uuid() }).strict());
  const where = [...filters.sql];
  if (filters.stockState) where.push(stockCondition(filters.stockState, "agg.available"));
  const countWhere = [...where];
  const countValues = [...filters.values];
  if (after) where.push(`(p.updated_at,p.id)<(${filters.param(after.u)}::timestamptz,${filters.param(after.id)}::uuid)`);
  const clause = (parts: string[]) => parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
  const rows = (await client.query<{ id: string; public_key: string; name: string; family: string | null; status: string; version: number; updated: string; thumbnail: string | null; category_key: string | null; category_name: string | null; variant_count: number; min_price: string | null; max_price: string | null; on_hand: number; available: number }>(
    `SELECT p.id,p.public_key,p.name,p.family,p.status,p.version,to_char(p.updated_at AT TIME ZONE 'UTC',${iso}) AS updated,${thumbnailSQL("p")} AS thumbnail,
       cat.key AS category_key,cat.name AS category_name,agg.*
     FROM products p ${productAggregates}
     LEFT JOIN LATERAL (SELECT c.key,c.name FROM product_categories x JOIN categories c ON c.id=x.category_id WHERE x.product_id=p.id AND x.is_primary) cat ON true
     ${clause(where)} ORDER BY p.updated_at DESC,p.id DESC LIMIT ${filters.param(list.limit + 1)}`, filters.values)).rows;
  const more = rows.length > list.limit, page = rows.slice(0, list.limit);
  const total = input.withTotal === false ? -1 : Number((await client.query<{ n: string }>(`SELECT count(*) AS n FROM products p ${filters.stockState ? productAggregates : ""}${clause(countWhere)}`, countValues)).rows[0].n);
  return {
    items: page.map(row => ({
      id: row.public_key, name: row.name, family: row.family, status: row.status, primaryCategory: row.category_key ? { key: row.category_key, name: row.category_name! } : null,
      thumbnail: row.thumbnail, variantCount: row.variant_count, stock: { onHand: row.on_hand, available: row.available },
      price: { min: kzt(row.min_price) ?? null, max: kzt(row.max_price) ?? null }, updatedAt: row.updated, version: row.version,
    })),
    nextCursor: more ? encodeCursor(list.binding, { u: page.at(-1)!.updated, id: page.at(-1)!.id }) : null, total, limit: list.limit,
  };
}


const skuSelect = `SELECT v.id,v.sku,v.name,v.status,v.is_default,p.public_key,p.name AS product_name,p.status AS product_status,p.version AS product_version,
    to_char(p.updated_at AT TIME ZONE 'UTC',${iso}) AS updated,pr.amount_minor::text AS amount,pr.compare_at_minor::text AS compare,b.on_hand,b.reserved,
    (SELECT json_agg(json_build_object('option',o.name,'value',ov.label) ORDER BY o.position,o.id) FROM variant_option_values s JOIN product_options o ON o.id=s.option_id JOIN option_values ov ON ov.id=s.option_value_id WHERE s.variant_id=v.id) AS options,
    COALESCE((SELECT COALESCE(m.source_path,m.storage_key) FROM product_media pm JOIN media_assets m ON m.id=pm.media_id AND m.status='ready' WHERE pm.product_id=p.id AND (pm.variant_id=v.id OR pm.variant_id IS NULL) ORDER BY (pm.variant_id IS NOT NULL) DESC,pm.is_primary DESC,pm.position,pm.id LIMIT 1),p.thumbnail_source) AS thumbnail
  FROM product_variants v JOIN products p ON p.id=v.product_id
  LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market='default'
  LEFT JOIN LATERAL (SELECT sum(ib.on_hand)::int AS on_hand,sum(ib.reserved)::int AS reserved FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE ib.variant_id=v.id) b ON true`;
type SkuDbRow = { id: string; sku: string; name: string | null; status: string; is_default: boolean; public_key: string; product_name: string; product_status: string; product_version: number; updated: string; amount: string | null; compare: string | null; on_hand: number | null; reserved: number | null; options: { option: string; value: string }[] | null; thumbnail: string | null; product_id?: string };
const skuRow = (row: SkuDbRow): SkuRow => ({
  variantId: row.id, sku: row.sku, title: row.name, options: row.options ?? [], productId: row.public_key, productName: row.product_name, productStatus: row.product_status, productVersion: row.product_version,
  price: kzt(row.amount) ?? null, compareAt: kzt(row.compare) ?? null,
  stock: { onHand: row.on_hand ?? 0, reserved: row.reserved ?? 0, available: (row.on_hand ?? 0) - (row.reserved ?? 0), tracked: row.on_hand !== null },
  status: row.status, isDefault: row.is_default, thumbnail: row.thumbnail, updatedAt: row.updated,
});

/** SKU view: one row per non-archived variant across all products, same filters. */
export async function listSkus(client: Query, raw: unknown): Promise<ListPage<SkuRow>> {
  const list = await parseList(client, "admin:catalog-skus", raw, true), { filters } = list;
  const after = decodeCursor(list.cursor, list.binding, z.object({ u: stamp, id: z.uuid(), sku: z.string().min(1).max(200) }).strict());
  const where = ["v.status<>'archived'", ...filters.sql];
  if (filters.stockState) where.push(stockCondition(filters.stockState, "COALESCE(b.on_hand-b.reserved,0)"));
  const countWhere = [...where], countValues = [...filters.values];
  if (after) {
    const u = filters.param(after.u), id = filters.param(after.id), sku = filters.param(after.sku);
    where.push(`((p.updated_at,p.id)<(${u}::timestamptz,${id}::uuid) OR (p.updated_at=${u}::timestamptz AND p.id=${id}::uuid AND v.sku COLLATE "C">${sku}))`);
  }
  const rows = (await client.query<SkuDbRow & { product_id: string }>(`${skuSelect.replace("SELECT v.id,", "SELECT v.id,p.id AS product_id,")} WHERE ${where.join(" AND ")} ORDER BY p.updated_at DESC,p.id DESC,v.sku COLLATE "C" LIMIT ${filters.param(list.limit + 1)}`, filters.values)).rows;
  const more = rows.length > list.limit, page = rows.slice(0, list.limit);
  const countSQL = `SELECT count(*) AS n FROM product_variants v JOIN products p ON p.id=v.product_id${filters.stockState ? " LEFT JOIN LATERAL (SELECT sum(ib.on_hand)::int AS on_hand,sum(ib.reserved)::int AS reserved FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE ib.variant_id=v.id) b ON true" : ""} WHERE ${countWhere.join(" AND ")}`;
  const total = Number((await client.query<{ n: string }>(countSQL, countValues)).rows[0].n);
  const last = page.at(-1);
  return { items: page.map(skuRow), nextCursor: more && last ? encodeCursor(list.binding, { u: last.updated, id: last.product_id, sku: last.sku }) : null, total, limit: list.limit };
}

/** Expand a grouped row: that product's non-archived variants. */
export async function productVariantRows(client: Query, productKey: string): Promise<SkuRow[]> {
  const productId = await productIdForKey(client, productKey);
  return (await client.query<SkuDbRow>(`${skuSelect} WHERE v.product_id=$1 AND v.status<>'archived' ORDER BY v.is_default DESC,v.sku COLLATE "C"`, [productId])).rows.map(skuRow);
}

export async function readTaxonomy(client: Query): Promise<{ categories: TaxonomyNode[]; epoch: string }> {
  const epoch = (await client.query<{ epoch: string }>("SELECT epoch::text AS epoch FROM catalog_taxonomy_guard WHERE id=1")).rows[0]?.epoch ?? "0";
  const rows = (await client.query<{ key: string; name: string; kind: string; slug: string | null; parent_key: string | null; position: number; nav_visible: boolean }>(
    "SELECT c.key,c.name,c.kind,c.slug,p.key AS parent_key,c.position,c.nav_visible FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE NOT c.archived AND (p.id IS NULL OR NOT p.archived) ORDER BY c.parent_id NULLS FIRST,c.position,c.key")).rows;
  return { epoch, categories: rows.map(row => ({ key: row.key, name: row.name, kind: row.kind, slug: row.slug, parentKey: row.parent_key, position: row.position, navVisible: row.nav_visible })) };
}

/** Lazy relations/cross-sell picker: products by name/SKU/category, paged, no total. */
export async function pickProducts(client: Query, raw: unknown): Promise<{ items: PickerRow[]; nextCursor: string | null }> {
  const input = { limit: 20, ...(raw && typeof raw === "object" ? raw : {}) };
  const page = await listProducts(client, input, { withTotal: false });
  return { items: page.items.map(({ id, name, family, status, thumbnail, primaryCategory, variantCount, price }) => ({ id, name, family, status, thumbnail, primaryCategory, variantCount, price })), nextCursor: page.nextCursor };
}
export type { ListPage, PickerRow, ProductListRow, SkuRow, TaxonomyNode };
