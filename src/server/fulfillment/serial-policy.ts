// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, M2): which products need a serial number
// at packing. Every electronic device does; only non-electronic accessories (bands, cases, cables, chargers, mounts)
// and digital items don't. Decided per product:
//   1. the product's own setting ("required" / "none"), else
//   2. its categories' effective settings (own or nearest ancestor's): any "required" wins; else any non-group
//      category with no setting (e.g. Smartwatches) means a device, so it needs a serial; else any "none" exempts;
//      else it needs a serial. Series groupings (kind "group", e.g. fēnix series) without a setting don't vote, so a
//      band in "fēnix series" + "Bands" is exempt while a watch wrongly also filed under "Apps" is not (real
//      MARQ filing, 2026-11-25). A product in no category instead uses
//   3. its old-site category (legacy_content category/subCategory) the same way, else
//   4. it needs a serial (the safe side for warranty). Final review 2026-11-26: the product name is never used —
//      names like "D2 Mach 1 Pro with Leather Band" or "Bark Collar Charger" exempted real devices; staff set an
//      unfiled accessory to "Never ask" on its General tab or file it under a "no serial" category.

import { matchLegacyCategories, type CategoryMatchNode } from "../catalog/category-match.ts";

export type SerialPolicy = "required" | "none";
export interface SerialDecision {
  required: boolean;
  source: "product" | "category" | "legacy-category" | "default";
  /** The deciding category key (or the device category behind a default). */
  detail: string | null;
}
export interface CategorySetting { key: string; kind: string; effective: SerialPolicy | null }


function byCategories(categories: readonly CategorySetting[], source: "category" | "legacy-category"): SerialDecision {
  const required = categories.find(category => category.effective === "required");
  if (required) return { required: true, source, detail: required.key };
  const device = categories.find(category => category.effective === null && category.kind !== "group");
  if (device) return { required: true, source: "default", detail: device.key };
  const exempt = categories.find(category => category.effective === "none");
  if (exempt) return { required: false, source, detail: exempt.key };
  return { required: true, source: "default", detail: null };
}

export function decideSerial(input: { productPolicy: SerialPolicy | null; categories: readonly CategorySetting[]; legacyCategories: readonly CategorySetting[]; name: string }): SerialDecision {
  if (input.productPolicy) return { required: input.productPolicy === "required", source: "product", detail: null };
  if (input.categories.length) return byCategories(input.categories, "category");
  if (input.legacyCategories.length) return byCategories(input.legacyCategories, "legacy-category");
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
  let nodes: CategoryMatchNode[] = [], effective = new Map<string, SerialPolicy | null>(), kinds = new Map<string, string>();
  if (needLegacy) {
    const rows = (await db.query<{ key: string; name: string; kind: CategoryMatchNode["kind"]; parent_key: string | null; effective: SerialPolicy | null }>(EFFECTIVE_SQL)).rows;
    nodes = rows.map(row => ({ key: row.key, name: row.name, kind: row.kind, parentKey: row.parent_key }));
    effective = new Map(rows.map(row => [row.key, row.effective]));
    kinds = new Map(rows.map(row => [row.key, row.kind]));
  }
  for (const product of products) {
    const legacyCategories = !product.serial_policy && !product.categories.length && nodes.length
      ? matchLegacyCategories(nodes, { category: product.category, subCategory: product.sub_category, family: product.family }).keys.map(key => ({ key, kind: kinds.get(key) ?? "catalog", effective: effective.get(key) ?? null }))
      : [];
    out.set(product.id, decideSerial({ productPolicy: product.serial_policy, categories: product.categories, legacyCategories, name: product.name }));
  }
  return out;
}

async function productRows(db: Query, productIds: string[] | null): Promise<ProductRow[]> {
  return (await db.query<ProductRow>(`WITH eff AS (${EFFECTIVE_SQL})
    SELECT p.id, p.name, p.status, p.family, p.serial_policy, p.legacy_content->>'category' AS category, p.legacy_content->>'subCategory' AS sub_category,
      COALESCE((SELECT json_agg(json_build_object('key', e.key, 'kind', e.kind, 'effective', e.effective) ORDER BY e.key) FROM product_categories x JOIN eff e ON e.id = x.category_id WHERE x.product_id = p.id), '[]'::json) AS categories
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
/** Every non-archived product with its decision; old-site-category decisions are flagged as guesses. */
export async function serialPolicyReport(db: Query): Promise<SerialReportRow[]> {
  const rows = await productRows(db, null), decisions = await decide(db, rows);
  return rows.map(row => {
    const d = decisions.get(row.id)!;
    return { productId: row.id, status: row.status, name: row.name, needsSerial: d.required, source: d.source, detail: d.detail, guess: d.source === "legacy-category" };
  });
}
