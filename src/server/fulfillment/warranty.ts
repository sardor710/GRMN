// 0033 (owner 2026-11-26, plan docs/plans/2026-11-26-signup-orders-pickup-devices-xl.md): warranty length per product.
//   1. the product's own warranty_months, else
//   2. its categories' effective setting (own or nearest ancestor's); with several, the longest wins (the customer's
//      side), else
//   3. 12 months.
// The warranty runs from the day the unit was delivered or picked up.

export const DEFAULT_WARRANTY_MONTHS = 12;
type Query = { query: <R extends Record<string, unknown>>(sql: string, args?: unknown[]) => Promise<{ rows: R[] }> };

export function decideWarrantyMonths(productMonths: number | null, categoryMonths: readonly (number | null)[]): number {
  if (productMonths) return productMonths;
  const set = categoryMonths.filter((value): value is number => typeof value === "number" && value > 0);
  return set.length ? Math.max(...set) : DEFAULT_WARRANTY_MONTHS;
}

/** The warranty months of each product (products not found get the default). */
export async function resolveWarrantyMonths(db: Query, productIds: readonly string[]): Promise<Map<string, number>> {
  const unique = [...new Set(productIds.map(id => id.toLowerCase()))];
  const out = new Map<string, number>();
  if (!unique.length) return out;
  const rows = (await db.query<{ id: string; warranty_months: number | null; categories: (number | null)[] }>(`WITH RECURSIVE chain AS (
      SELECT c.id AS start_id, c.parent_id, c.warranty_months, 0 AS depth FROM categories c
      UNION ALL
      SELECT ch.start_id, p.parent_id, p.warranty_months, ch.depth + 1 FROM chain ch JOIN categories p ON p.id = ch.parent_id
      WHERE ch.warranty_months IS NULL AND ch.depth < 32),
    effective AS (SELECT DISTINCT ON (start_id) start_id, warranty_months FROM chain WHERE warranty_months IS NOT NULL ORDER BY start_id, depth)
    SELECT p.id, p.warranty_months,
      COALESCE((SELECT json_agg(e.warranty_months) FROM product_categories x JOIN effective e ON e.start_id = x.category_id WHERE x.product_id = p.id), '[]'::json) AS categories
    FROM products p WHERE p.id = ANY($1::uuid[])`, [unique])).rows;
  for (const id of unique) out.set(id, DEFAULT_WARRANTY_MONTHS);
  for (const row of rows) out.set(row.id, decideWarrantyMonths(row.warranty_months, row.categories));
  return out;
}

/** The warranty end: `months` calendar months after `start` (a 31st rolls back to the month's last day). */
export function warrantyEnd(start: Date, months: number): Date {
  const end = new Date(start.getTime());
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}

/** Sets a product's own warranty months (null = from its categories). Outside the editor's versioned save. */
export async function setProductWarrantyMonths(db: Query, productId: string, months: number | null): Promise<boolean> {
  const result = await db.query<{ id: string }>("UPDATE products SET warranty_months=$2 WHERE id=$1 RETURNING id", [productId, months]);
  return result.rows.length === 1;
}
