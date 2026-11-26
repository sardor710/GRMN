// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, T1.1): migration 0030 adds
// per-unit serial numbers and the "needs serial" setting on categories and products. The SQL is idempotent
// (beta5 re-applies it later) and seeds the starting "no serial" / "needs serial" categories only when the
// column is first added, so a re-apply never overwrites an owner's choice.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { startCatalogFixture } from "./catalog-helpers.mjs";

let f;
const q = (sql, args = []) => f.q(sql, args);
const SQL_FILE = new URL("../../drizzle/0030_order-serials.sql", import.meta.url);
const runMigrationFile = async () => {
  const text = await readFile(SQL_FILE, "utf8");
  for (const statement of text.split("--> statement-breakpoint")) if (statement.trim()) await q(statement);
};
const policy = async key => (await q("SELECT serial_policy FROM categories WHERE key=$1", [key])).rows[0]?.serial_policy;

before(async () => { f = await startCatalogFixture({ taxonomy: false }); }, { timeout: 120000 });
after(async () => { await f?.stop(); }, { timeout: 45000 });

test("re-running the migration SQL on a migrated database is a no-op", async () => {
  await runMigrationFile();
  await runMigrationFile();
  const columns = (await q("SELECT table_name,column_name FROM information_schema.columns WHERE column_name='serial_policy' ORDER BY table_name")).rows;
  assert.deepEqual(columns.map(row => row.table_name), ["categories", "products"]);
});

test("serial_policy accepts only required, none or NULL", async () => {
  await q("INSERT INTO categories(id,key,name,serial_policy) VALUES($1,'policy-ok','Policy ok','none')", [randomUUID()]);
  await assert.rejects(q("INSERT INTO categories(id,key,name,serial_policy) VALUES($1,'policy-bad','Policy bad','maybe')", [randomUUID()]), /categories_serial_policy_valid/);
  await assert.rejects(q("INSERT INTO products(id,public_key,name,serial_policy) VALUES($1,'policy-bad-p','P','yes')", [randomUUID()]), /products_serial_policy_valid/);
});

test("seed runs only when the column is first added", async () => {
  for (const key of ["bands", "cables-chargers", "heart-rate-monitors", "sensors", "wearables-smartwatches"]) {
    await q("INSERT INTO categories(id,key,name) VALUES($1,$2,$2) ON CONFLICT (key) DO NOTHING", [randomUUID(), key]);
  }
  await q("ALTER TABLE categories DROP COLUMN serial_policy");
  await runMigrationFile();
  assert.equal(await policy("bands"), "none");
  assert.equal(await policy("cables-chargers"), "none");
  assert.equal(await policy("heart-rate-monitors"), "required");
  assert.equal(await policy("sensors"), "required");
  assert.equal(await policy("wearables-smartwatches"), null);
  // The owner changes a setting; a re-apply keeps it.
  await q("UPDATE categories SET serial_policy=NULL WHERE key='bands'");
  await runMigrationFile();
  assert.equal(await policy("bands"), null);
});

test("serial key ignores case and spaces; untrimmed serials are refused", async () => {
  // Foreign keys are covered by the fulfillment tests; this one checks the generated key, CHECK and unique only.
  const client = await f.database.pool.connect();
  try {
    await client.query("SET session_replication_role=replica");
    const [order, item, shipmentItem] = [randomUUID(), randomUUID(), randomUUID()];
    const insert = (unit, serial) => client.query("INSERT INTO order_unit_serials(id,order_id,order_item_id,shipment_item_id,unit_index,serial) VALUES($1,$2,$3,$4,$5,$6) RETURNING serial_key", [randomUUID(), order, item, shipmentItem, unit, serial]);
    assert.equal((await insert(1, "abc 123")).rows[0].serial_key, "ABC123");
    await assert.rejects(insert(2, " abc "), /order_unit_serials_serial_valid/);
    await assert.rejects(insert(0, "ZERO"), /order_unit_serials_serial_valid/);
    await assert.rejects(insert(1, "OTHER"), /order_unit_serials_unit_unique/);
  } finally { await client.query("SET session_replication_role=origin"); client.release(); }
});

test("one database function defines 'same serial', with no-break and zero-width spaces listed explicitly (locale-proof)", async () => {
  // The production image (en_US.utf8) does not count U+00A0 / U+FEFF as \s; the key must not depend on the locale.
  const key = (await q("SELECT grmn_serial_key($1) AS k", ["ab" + " " + "1" + "﻿" + "2​3 4 5\t6"])).rows[0].k;
  assert.equal(key, "AB123456");
  const generated = (await q("SELECT generation_expression FROM information_schema.columns WHERE table_name='order_unit_serials' AND column_name='serial_key'")).rows[0].generation_expression;
  assert.match(generated, /grmn_serial_key/);
});
