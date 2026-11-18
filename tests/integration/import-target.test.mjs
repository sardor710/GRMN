// Task 23 G2: the guarded persistent-target import. db:import:rehearse only ever writes its own
// disposable cluster; staging and production need the same importer pointed at a real, migrated,
// empty database, with an explicit confirmation of which database, refusal of anything that already
// holds live commerce, a no-op replay, and a private reconciliation report.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { extractSources } from "../../scripts/migration/extract.ts";
import { syntheticCMS, sourceOptions } from "../fixtures/migration.mjs";

let temporary, handle, bare, serial = 0;
const target = () => import("../../scripts/migration/import-target.ts");
function snapshot() {
  const prefix = `target${++serial}`, cms = syntheticCMS();
  delete cms.admins; delete cms.settings;
  for (const rows of Object.values(cms)) for (const row of rows) row.id = `${prefix}-${row.id}`;
  cms.products[0].sku = `${prefix}-SKU`; cms.orders[0].items[0].productId = cms.products[0].id;
  cms.orders[0].orderNumber = `${prefix}-OLD-${9100000 + serial}`;
  cms.blogs[0].slug = `${prefix}-blog`; cms.discounts[0].code = `${prefix}-promo`;
  return extractSources(sourceOptions(cms, { namespace: prefix }));
}
async function output() { await mkdir(resolve("temp"), { recursive: true }); return mkdtemp(join(resolve("temp"), "import-target-test-")); }

before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4" }));
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  // A second, unmigrated database on the same server.
  await handle.pool.query("CREATE DATABASE grmn_bare");
  const url = new URL(temporary.url); url.pathname = "/grmn_bare";
  bare = createDatabase(parseServerEnv({ DATABASE_URL: url.toString(), DATABASE_POOL_MAX: "2" }));
}, { timeout: 120000 });
after(async () => { try { await bare?.close(); await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

test("the target import refuses a database name that does not match the confirmation", async () => {
  const { importIntoTarget } = await target(), dir = await output();
  try {
    await assert.rejects(importIntoTarget(handle.pool, snapshot(), { confirmDatabase: "grmn_production", output: dir }), /does not match/);
    assert.equal((await handle.pool.query("SELECT count(*)::int AS n FROM migration_runs")).rows[0].n, 0, "nothing was written");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the target import refuses a database that is not migrated to the shipped schema", async () => {
  const { importIntoTarget } = await target(), dir = await output();
  try { await assert.rejects(importIntoTarget(bare.pool, snapshot(), { confirmDatabase: "grmn_bare", output: dir }), /not migrated/); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test("the target import imports, replays as a no-op and writes a private reconciliation report", async () => {
  const { importIntoTarget } = await target(), dir = await output(), snap = snapshot();
  try {
    const name = (await handle.pool.query("SELECT current_database() AS n")).rows[0].n;
    const first = await importIntoTarget(handle.pool, snap, { confirmDatabase: name, output: dir });
    assert.equal(first.exitCode, 0, JSON.stringify(first.summary));
    assert.equal(first.summary.mismatches, 0);
    const counts = async () => (await handle.pool.query("SELECT (SELECT count(*) FROM products)::int AS p,(SELECT count(*) FROM orders)::int AS o,(SELECT count(*) FROM legacy_id_map)::int AS m")).rows[0];
    const before = await counts();
    const dir2 = await output();
    try {
      const replay = await importIntoTarget(handle.pool, snap, { confirmDatabase: name, output: dir2 });
      assert.equal(replay.exitCode, 0);
      assert.deepEqual(await counts(), before, "replay adds nothing");
    } finally { await rm(dir2, { recursive: true, force: true }); }
    const report = JSON.parse(await readFile(join(dir, "reconciliation.json"), "utf8"));
    assert.equal(report.artifactChecksum, snap.artifactChecksum);
    assert.equal(report.database, name);
    // The legacy order number is above the sequence floor afterwards.
    const seq = (await handle.pool.query("SELECT last_value::text AS v FROM order_number_sequence")).rows[0].v;
    assert.ok(BigInt(seq) >= BigInt(9100000 + serial), "sequence advanced past imported numbers");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the target import refuses a database that already holds live checkout orders", async () => {
  const { importIntoTarget } = await target(), dir = await output();
  const name = (await handle.pool.query("SELECT current_database() AS n")).rows[0].n;
  // Simulate live commerce: a placed order with a checkout attempt, written with triggers bypassed.
  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL session_replication_role=replica");
    const attempt = randomUUID(), cart = randomUUID(), quote = randomUUID();
    await client.query("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'user:x','live-order-key-0001',repeat('a',64))", [attempt, cart, quote]);
    await client.query("INSERT INTO orders(id,checkout_attempt_id,contact_name,contact_phone,placed_at,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor) VALUES($1,$2,'Live buyer','+77010000009',clock_timestamp(),100,0,0,0,100)", [randomUUID(), attempt]);
    await client.query("COMMIT");
  } finally { client.release(); }
  try { await assert.rejects(importIntoTarget(handle.pool, snapshot(), { confirmDatabase: name, output: dir }), /live checkout orders/); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
