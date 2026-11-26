// Owner 2026-11-25 (plan T2.3): read-only list of every non-archived product and whether packing will ask for its
// serial number (src/server/fulfillment/serial-policy.ts). CSV on stdout, counts per source on stderr.
//   docker compose -p grmn -f deploy/compose.yml --env-file <env> run --rm -T ops \
//     node --conditions=react-server scripts/ops/serial-policy-report.mjs > serial-policy-report.csv
// guess=yes rows were decided by the old-site category: check those first.
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { serialPolicyReport } from "../../src/server/fulfillment/serial-policy.ts";

const cell = value => { const text = value === null || value === undefined ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const database = createDatabase(parseServerEnv({ ...process.env, DATABASE_POOL_MAX: "1", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
let failed = false;
try {
  const rows = await serialPolicyReport(database.pool);
  console.log("product_id,status,name,needs_serial,source,detail,guess");
  for (const row of rows) console.log([row.productId, row.status, row.name, row.needsSerial ? "yes" : "no", row.source, row.detail, row.guess ? "yes" : "no"].map(cell).join(","));
  const counts = {};
  for (const row of rows) { const k = `${row.needsSerial ? "needs" : "no"}:${row.source}`; counts[k] = (counts[k] ?? 0) + 1; }
  console.error(JSON.stringify({ products: rows.length, needsSerial: rows.filter(r => r.needsSerial).length, noSerial: rows.filter(r => !r.needsSerial).length, guesses: rows.filter(r => r.guess).length, bySource: counts }));
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally { await database.close(); }
process.exitCode = failed ? 1 : 0;
