// Owner 2026-11-22: the admin bin deletes a never-ordered product or SKU together with its manual stock history.
// Migration 0027 opens a transaction-local door (grmn.catalog_purge) in the append-only ledger: only manual
// movements (opening, receive, adjust) and unreserved balances may go; reservations and updates never.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, database, serial = 0;
const q = (sql, args = []) => database.pool.query(sql, args);
async function inTx(work) {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
const purge = client => client.query("SELECT set_config('grmn.catalog_purge','1',true)");
async function stockedVariant({ reserve = false } = {}) {
  const product = randomUUID(), id = randomUUID(), location = randomUUID(), n = ++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,'Purge fixture','published')", [product, "purge-" + n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')", [id, product, "PURGE-" + n]);
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,$2,'Synthetic location')", [location, "purge-loc-" + n]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)", [id, location]);
  const move = (onHand, reserved, reason, extra = "") =>
    q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic:purge') RETURNING id",
      [randomUUID(), id, location, onHand, reserved, reason, `purge-${reason}-${n}${extra}`]);
  const receive = (await move(5, 0, "opening")).rows[0].id;
  await move(3, 0, "receive");
  await move(-1, 0, "adjust");
  if (reserve) await move(0, 1, "reserve");
  return { id, receive };
}

before(async () => {
  temporary = await startTemporaryPostgres();
  const migration = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "1", DATABASE_CONNECT_TIMEOUT_MS: "10000", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
  try { await migrate(migration.db, { migrationsFolder: "drizzle" }); } finally { await migration.close(); }
  database = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4" }));
});
after(async () => { await database?.close(); await temporary?.stop(); });

test("without the purge flag a receive movement and its balance cannot be deleted", async () => {
  const { id, receive } = await stockedVariant();
  await assert.rejects(q("DELETE FROM stock_movements WHERE id=$1", [receive]), /Immutable commerce history/);
  await assert.rejects(q("DELETE FROM inventory_balances WHERE variant_id=$1", [id]), /cannot be deleted/);
});

test("with the purge flag opening/receive/adjust movements and an unreserved balance are deleted", async () => {
  const { id } = await stockedVariant();
  await inTx(async client => {
    await purge(client);
    assert.equal((await client.query("DELETE FROM stock_movements WHERE variant_id=$1", [id])).rowCount, 3);
    assert.equal((await client.query("DELETE FROM inventory_balances WHERE variant_id=$1", [id])).rowCount, 1);
  });
});

test("purge flag never allows reservation movements", async () => {
  const { id } = await stockedVariant({ reserve: true });
  // A failed statement aborts the transaction; COMMIT then rolls back without an error.
  await inTx(async client => {
    await purge(client);
    await assert.rejects(client.query("DELETE FROM stock_movements WHERE variant_id=$1 AND reason='reserve'", [id]), /Immutable commerce history/);
  });
  await assert.rejects(inTx(async client => {
    await purge(client);
    await client.query("DELETE FROM stock_movements WHERE variant_id=$1 AND reason<>'reserve'", [id]);
    await client.query("DELETE FROM inventory_balances WHERE variant_id=$1", [id]);
  }), /cannot be deleted/);
});

test("updates stay refused even with the purge flag", async () => {
  const { receive } = await stockedVariant();
  await assert.rejects(inTx(async client => {
    await purge(client);
    await client.query("UPDATE stock_movements SET source_reference='x' WHERE id=$1", [receive]);
  }), /Immutable commerce history/);
});

test("the flag is transaction-local", async () => {
  const { receive } = await stockedVariant();
  await inTx(purge);
  await assert.rejects(q("DELETE FROM stock_movements WHERE id=$1", [receive]), /Immutable commerce history/);
});
