// 0029 (owner 2026-11-23): products.product_code is the public URL key (/p/{code}, /p/{code}/{sku}).
// Imported products keep their garmin.com id; the rest draw from product_code_seq (>= 90000001).
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, database, partial;
const q = (sql, args = []) => database.pool.query(sql, args);
const garmin = productId => JSON.stringify({ source: { provider: "garmin", productId } });

async function migrateFolder(folder) {
  const migration = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "1", DATABASE_CONNECT_TIMEOUT_MS: "10000", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
  try { await migrate(migration.db, { migrationsFolder: folder }); } finally { await migration.close(); }
}

before(async () => {
  temporary = await startTemporaryPostgres();
  // Migrate up to 0028 first so the backfill runs over existing rows like on production.
  partial = await mkdtemp(resolve("temp", "grmn-migrations-0028-"));
  await cp("drizzle", partial, { recursive: true });
  const journalPath = resolve(partial, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter(entry => entry.idx < 29);
  await writeFile(journalPath, JSON.stringify(journal));
  await migrateFolder(partial);
  database = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "2" }));
  const insert = (key, legacy, createdAt) => q("INSERT INTO products(id,public_key,name,legacy_content,created_at) VALUES($1,$2,$3,$4::jsonb,$5)", [randomUUID(), key, `Product ${key}`, legacy, createdAt]);
  await insert("fenix-9-pro", garmin("1953727"), "2026-11-01T00:00:00Z");
  await insert("fenix-9-pro-copy", garmin("1953727"), "2026-11-02T00:00:00Z");
  await insert("manual", "{}", "2026-11-03T00:00:00Z");
  await insert("odd-id", garmin("12a"), "2026-11-04T00:00:00Z");
  await migrateFolder("drizzle");
}, { timeout: 180000 });

after(async () => {
  await database?.close();
  await temporary?.stop();
  if (partial) await rm(partial, { recursive: true, force: true });
}, { timeout: 60000 });

const codeOf = async key => (await q("SELECT product_code FROM products WHERE public_key=$1", [key])).rows[0].product_code;

test("backfill: imported products keep their garmin.com id; the first by creation wins a shared id", async () => {
  assert.equal(await codeOf("fenix-9-pro"), "1953727");
  assert.ok(Number(await codeOf("fenix-9-pro-copy")) >= 90000001);
  assert.ok(Number(await codeOf("manual")) >= 90000001);
  assert.ok(Number(await codeOf("odd-id")) >= 90000001);
});

test("new products draw a code from the sequence; codes are unique and digits only", async () => {
  await q("INSERT INTO products(id,public_key,name) VALUES($1,'fresh','Fresh')", [randomUUID()]);
  assert.ok(Number(await codeOf("fresh")) >= 90000001);
  await assert.rejects(q("INSERT INTO products(id,public_key,name,product_code) VALUES($1,'dup','Dup','1953727')", [randomUUID()]), /products_product_code_unique/);
  await assert.rejects(q("INSERT INTO products(id,public_key,name,product_code) VALUES($1,'bad','Bad','12a')", [randomUUID()]), /products_product_code_valid/);
});
