// Owner 2026-11-22: loads the category tree, RU/KK names and menu placements into a running database and files
// products that have no categories yet (src/server/catalog/taxonomy-load.ts). Idempotent; owner edits are kept.
//   docker compose -p grmn -f deploy/compose.yml --env-file <env> run --rm -T ops \
//     node --conditions=react-server scripts/ops/load-taxonomy.mjs [--dry-run]
// --dry-run prints the counts and rolls back.
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { loadTaxonomy } from "../../src/server/catalog/taxonomy-load.ts";

const dryRun = process.argv.includes("--dry-run");
const database = createDatabase(parseServerEnv({ ...process.env, DATABASE_POOL_MAX: "1", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
const client = await database.pool.connect();
let failed = false;
try {
  await client.query("BEGIN");
  const report = await loadTaxonomy(client, { assignProducts: true });
  const totals = (await client.query(`SELECT (SELECT count(*) FROM categories)::int AS categories, (SELECT count(*) FROM category_translations)::int AS translations,
    (SELECT count(*) FROM category_menu_placements)::int AS placements, (SELECT count(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id))::int AS unfiled`)).rows[0];
  await client.query(dryRun ? "ROLLBACK" : "COMMIT");
  console.log(JSON.stringify({ dryRun, ...report, totals }));
} catch (error) {
  failed = true;
  await client.query("ROLLBACK").catch(() => {});
  console.error(error instanceof Error ? error.message : error);
} finally {
  client.release();
  await database.close();
}
process.exitCode = failed ? 1 : 0;
