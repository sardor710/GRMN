// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, M2): which products need a serial number
// at packing. Every electronic device does; only non-electronic accessories (bands, cases, cables, chargers, mounts)
// and digital items don't. Decided per product:
//   1. the product's own setting ("required" / "none"), else
//   2. its categories' effective settings (own or nearest ancestor's): any "required" wins, else any "none" exempts,
//      else it needs a serial; a product in no category instead uses
//   3. its old-site category (legacy_content category/subCategory) the same way, else
//   4. its name, only to exempt an obvious accessory and never when the name also names a device, else
//   5. it needs a serial (the safe side for warranty).

import { matchLegacyCategories, type CategoryMatchNode } from "../catalog/category-match.ts";

export type SerialPolicy = "required" | "none";
export interface SerialDecision {
  required: boolean;
  source: "product" | "category" | "legacy-category" | "name" | "default";
  /** The deciding category key, or the matched accessory word for "name". */
  detail: string | null;
}
export interface CategorySetting { key: string; effective: SerialPolicy | null }

/** Accessory words (EN + RU stems). Latin words use \b; JS \b is ASCII-only, so Cyrillic stems match without it. */
export const NO_SERIAL_NAME = /\b(bands?|straps?|bracelets?|cables?|chargers?|charging|cases?|mounts?|protectors?|lanyards?)\b|(ремеш|браслет|кабел|зарядн|чехол|креплен|пл[её]нк)/iu;
/** Device words: a name with any of these is never exempted, whatever accessory it mentions. */
export const DEVICE_NAME = /(watch|fēnix|fenix|forerunner|venu|vívo|vivo|instinct|epix|enduro|marq|quatix|tactix|descent|approach|lily|bounce|edge|hrm|sensor|varia|rally|vector|index|echomap|striker|livescope|panoptix|gpsmap|etrex|montana|oregon|inreach|zūmo|zumo|dēzl|dezl|drive|camper|tread|catalyst|dash ?cam|tacx|neo|flux|rangefinder|fishfinder|transducer|radar|часы|датчик|навигатор|эхолот)/iu;

function byCategories(categories: readonly CategorySetting[], source: "category" | "legacy-category"): SerialDecision {
  const required = categories.find(category => category.effective === "required");
  if (required) return { required: true, source, detail: required.key };
  const exempt = categories.find(category => category.effective === "none");
  if (exempt) return { required: false, source, detail: exempt.key };
  return { required: true, source: "default", detail: null };
}

export function decideSerial(input: { productPolicy: SerialPolicy | null; categories: readonly CategorySetting[]; legacyCategories: readonly CategorySetting[]; name: string }): SerialDecision {
  if (input.productPolicy) return { required: input.productPolicy === "required", source: "product", detail: null };
  if (input.categories.length) return byCategories(input.categories, "category");
  if (input.legacyCategories.length) return byCategories(input.legacyCategories, "legacy-category");
  const name = input.name.normalize("NFKC");
  const accessory = NO_SERIAL_NAME.exec(name);
  if (accessory && !DEVICE_NAME.test(name)) return { required: false, source: "name", detail: accessory[0].toLowerCase() };
  return { required: true, source: "default", detail: null };
}

// ---------------------------------------------------------------- database
type Query = { query: <R extends Record<string, unknown>>(sql: string, args?: unknown[]) => Promise<{ rows: R[] }> };
interface ProductRow extends Record<string, unknown> {
  id: string; name: string; status: string; family: string | null; serial_policy: SerialPolicy | null;
  category: string | null; sub_category: string | null; categories: CategorySetting[];
}

/** Each category's effective setting: its own, or its nearest ancestor's (NULL when none in the chain has one). */
const EFFECTIVE_SQL = `WITH RECURSIVE chain AS (
    SELECT c.id AS start_id, c.parent_id, c.serial_policy, 0 AS depth FROM categories c
    UNION ALL
    SELECT ch.start_id, p.parent_id, p.serial_policy, ch.depth + 1 FROM chain ch JOIN categories p ON p.id = ch.parent_id
    WHERE ch.serial_policy IS NULL AND ch.depth < 32)
  SELECT c.id, c.key, c.name, c.kind, pc.key AS parent_key,
    (SELECT ch.serial_policy FROM chain ch WHERE ch.start_id = c.id AND ch.serial_policy IS NOT NULL ORDER BY ch.depth LIMIT 1) AS effective
  FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id WHERE NOT c.archived`;

async function decide(db: Query, products: ProductRow[]): Promise<Map<string, SerialDecision>> {
  const out = new Map<string, SerialDecision>();
  if (!products.length) return out;
  const needLegacy = products.some(product => !product.serial_policy && !product.categories.length);
  let nodes: CategoryMatchNode[] = [], effective = new Map<string, SerialPolicy | null>();
  if (needLegacy) {
    const rows = (await db.query<{ key: string; name: string; kind: CategoryMatchNode["kind"]; parent_key: string | null; effective: SerialPolicy | null }>(EFFECTIVE_SQL)).rows;
    nodes = rows.map(row => ({ key: row.key, name: row.name, kind: row.kind, parentKey: row.parent_key }));
    effective = new Map(rows.map(row => [row.key, row.effective]));
  }
  for (const product of products) {
    const legacyCategories = !product.serial_policy && !product.categories.length && nodes.length
      ? matchLegacyCategories(nodes, { category: product.category, subCategory: product.sub_category, family: product.family }).keys.map(key => ({ key, effective: effective.get(key) ?? null }))
      : [];
    out.set(product.id, decideSerial({ productPolicy: product.serial_policy, categories: product.categories, legacyCategories, name: product.name }));
  }
  return out;
}

async function productRows(db: Query, productIds: string[] | null): Promise<ProductRow[]> {
  return (await db.query<ProductRow>(`WITH eff AS (${EFFECTIVE_SQL})
    SELECT p.id, p.name, p.status, p.family, p.serial_policy, p.legacy_content->>'category' AS category, p.legacy_content->>'subCategory' AS sub_category,
      COALESCE((SELECT json_agg(json_build_object('key', e.key, 'effective', e.effective) ORDER BY e.key) FROM product_categories x JOIN eff e ON e.id = x.category_id WHERE x.product_id = p.id), '[]'::json) AS categories
    FROM products p WHERE ${productIds ? "p.id = ANY($1::uuid[])" : "p.status <> 'archived'"} ORDER BY p.name, p.id`, productIds ? [productIds] : [])).rows;
}

/** Whether each product needs a serial at packing (products not found are absent from the map). */
export async function resolveSerialRequirements(db: Query, productIds: string[]): Promise<Map<string, SerialDecision>> {
  const unique = [...new Set(productIds.map(id => id.toLowerCase()))];
  return unique.length ? decide(db, await productRows(db, unique)) : new Map();
}

/**
 * The product's own setting (null = decided by its categories). It is not part of the product editor's
 * versioned content, so neither version nor updated_at changes and an open editor's next save still succeeds.
 */
export async function setProductSerialPolicy(db: Query, productId: string, policy: SerialPolicy | null): Promise<boolean> {
  const result = await db.query<{ id: string }>("UPDATE products SET serial_policy=$2 WHERE id=$1 RETURNING id", [productId, policy]);
  return result.rows.length === 1;
}

export interface SerialReportRow { productId: string; status: string; name: string; needsSerial: boolean; source: SerialDecision["source"]; detail: string | null; guess: boolean }
/** Every non-archived product with its decision; name and old-site-category decisions are flagged as guesses. */
export async function serialPolicyReport(db: Query): Promise<SerialReportRow[]> {
  const rows = await productRows(db, null), decisions = await decide(db, rows);
  return rows.map(row => {
    const d = decisions.get(row.id)!;
    return { productId: row.id, status: row.status, name: row.name, needsSerial: d.required, source: d.source, detail: d.detail, guess: d.source === "name" || d.source === "legacy-category" };
  });
}
