#!/usr/bin/env node
// Final review I1 (read-only data check): lists published products that have an active variant (the only
// ones the storefront sells; draft and archived variants are not sold) with no KZT price or a price of 0 or
// less, and published products that sell no variant at all (published yet invisible; listed once with
// variant_status "none"). Before I1 only the default variant was checked on publish, so such rows could exist;
// the storefront would show and sell that size at 0 ₸.
// It never writes: the query runs in a READ ONLY transaction that is rolled back.
// Usage: DATABASE_URL=postgres://... node scripts/check-unpriced-published.mjs [--allow-remote]
//        node scripts/check-unpriced-published.mjs --json [src/lib/cms/data.json]   (legacy JSON store)
// A non-local host is refused unless --allow-remote is given (do not point it at production casually).
import { pathToFileURL } from "node:url";
import pg from "pg";
import { effectiveVariantStatus, hasSellableOptions, isSellableVariantStatus } from "../src/lib/cms/publish-price.js";

export const UNPRICED_PUBLISHED_SQL = `
SELECT p.public_key AS product, p.name AS product_name, v.sku, v.name AS variant, v.status::text AS variant_status,
       v.is_default, pr.amount_minor
  FROM products p
  JOIN product_variants v ON v.product_id = p.id AND v.status = 'active'
  LEFT JOIN prices pr ON pr.variant_id = v.id AND pr.is_active AND pr.currency = 'KZT' AND pr.market = 'default'
 WHERE p.status = 'published' AND (pr.amount_minor IS NULL OR pr.amount_minor <= 0)
UNION ALL
SELECT p.public_key, p.name, NULL, NULL, 'none', false, NULL
  FROM products p
 WHERE p.status = 'published' AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.status = 'active')
 ORDER BY 2, 3`;

/** Rows of published products with an unpriced active variant, or with no active variant (variant_status
 *  "none"). `query` is pg's (sql) => Promise<{rows}>. */
export async function listUnpricedPublished(query) {
  await query("BEGIN READ ONLY");
  try {
    return (await query(UNPRICED_PUBLISHED_SQL)).rows;
  } finally {
    await query("ROLLBACK");
  }
}

/** The same check on a legacy JSON store (src/lib/cms/data.json): published products with options whose
 *  sold variants (active, or with no status) cost 0 or less or that sell no variant, or, without options, whose
 *  product price is 0 or less (the shared rule in src/lib/cms/publish-price.js). */
export function listUnpricedPublishedJSON(data) {
  const rows = [];
  for (const p of data.products ?? []) {
    if ((p.status ?? "published") !== "published") continue;
    const variants = hasSellableOptions(p) ? p.variants : [];
    if (!variants.length) { if (!(Number(p.price) > 0)) rows.push({ product: p.id, product_name: p.name, sku: p.sku, variant: null, variant_status: "active", is_default: true, amount_minor: p.price ?? null }); continue; }
    if (!variants.some((v) => isSellableVariantStatus(v.status))) { rows.push({ product: p.id, product_name: p.name, sku: null, variant: null, variant_status: "none", is_default: false, amount_minor: null }); continue; }
    for (const v of variants) if (isSellableVariantStatus(v.status) && !(Number(v.price) > 0)) rows.push({ product: p.id, product_name: p.name, sku: v.sku, variant: v.title, variant_status: effectiveVariantStatus(v.status), is_default: Boolean(v.isDefault), amount_minor: v.price ?? null });
  }
  return rows;
}

const print = (rows) => {
  console.log(`${rows.length} unpriced or unsold published product row(s)`);
  for (const row of rows) {
    if (row.variant_status === "none") { console.log(`- ${row.product_name} [${row.product}]: no active variant`); continue; }
    console.log(`- ${row.product_name} [${row.product}] variant ${row.variant ?? "(default)"} ${row.sku} (${row.variant_status}${row.is_default ? ", default" : ""}): ${row.amount_minor == null ? "no price" : `${row.amount_minor}`}`);
  }
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
