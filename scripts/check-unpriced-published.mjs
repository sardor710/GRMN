#!/usr/bin/env node
// Final review I1 (read-only data check): lists published products that have an active variant (the only
// ones the storefront sells; draft and archived variants are not sold) with no KZT price or a price of 0 or
// less. Before I1 only the default variant was checked on publish, so such rows could exist; the storefront
// would show and sell that size at 0 ₸.
// It never writes: the query runs in a READ ONLY transaction that is rolled back.
// Usage: DATABASE_URL=postgres://... node scripts/check-unpriced-published.mjs [--allow-remote]
//        node scripts/check-unpriced-published.mjs --json [src/lib/cms/data.json]   (legacy JSON store)
// A non-local host is refused unless --allow-remote is given (do not point it at production casually).
import { pathToFileURL } from "node:url";
import pg from "pg";
import { isSellableVariantStatus } from "../src/lib/cms/publish-price.js";

export const UNPRICED_PUBLISHED_SQL = `
SELECT p.public_key AS product, p.name AS product_name, v.sku, v.name AS variant, v.status AS variant_status,
       v.is_default, pr.amount_minor
  FROM products p
  JOIN product_variants v ON v.product_id = p.id AND v.status = 'active'
  LEFT JOIN prices pr ON pr.variant_id = v.id AND pr.is_active AND pr.currency = 'KZT' AND pr.market = 'default'
 WHERE p.status = 'published' AND (pr.amount_minor IS NULL OR pr.amount_minor <= 0)
 ORDER BY p.name, v.sku`;

/** Rows of published products with an unpriced active variant. `query` is pg's (sql) => Promise<{rows}>. */
export async function listUnpricedPublished(query) {
  await query("BEGIN READ ONLY");
  try {
    return (await query(UNPRICED_PUBLISHED_SQL)).rows;
  } finally {
    await query("ROLLBACK");
  }
}

/** The same check on a legacy JSON store (src/lib/cms/data.json): published products with options whose
 *  active variants cost 0 or less, or, without options, whose product price is 0 or less
 *  (the shared rule in src/lib/cms/publish-price.js). */
export function listUnpricedPublishedJSON(data) {
  const rows = [];
  for (const p of data.products ?? []) {
    if ((p.status ?? "published") !== "published") continue;
    const variants = (p.options ?? []).length > 0 ? (p.variants ?? []) : [];
    if (!variants.length) { if (!(Number(p.price) > 0)) rows.push({ product: p.id, product_name: p.name, sku: p.sku, variant: null, variant_status: "active", is_default: true, amount_minor: p.price ?? null }); continue; }
    for (const v of variants) if (isSellableVariantStatus(v.status) && !(Number(v.price) > 0)) rows.push({ product: p.id, product_name: p.name, sku: v.sku, variant: v.title, variant_status: v.status, is_default: Boolean(v.isDefault), amount_minor: v.price ?? null });
  }
  return rows;
}

const print = (rows) => {
  console.log(`${rows.length} unpriced active variant(s) on published products`);
  for (const row of rows)
    console.log(`- ${row.product_name} [${row.product}] variant ${row.variant ?? "(default)"} ${row.sku} (${row.variant_status}${row.is_default ? ", default" : ""}): ${row.amount_minor == null ? "no price" : `${row.amount_minor}`}`);
};

async function main() {
  const json = process.argv.indexOf("--json");
  if (json !== -1) {
    const { readFile } = await import("node:fs/promises");
    return print(listUnpricedPublishedJSON(JSON.parse(await readFile(process.argv[json + 1] ?? "src/lib/cms/data.json", "utf8"))));
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (a local or test database)");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && !process.argv.includes("--allow-remote"))
    throw new Error(`Refusing non-local host ${host}; pass --allow-remote to run it there`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    print(await listUnpricedPublished((sql) => client.query(sql)));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
