// Owner 2026-11-26 (plan docs/plans/2026-11-26-signup-orders-pickup-devices-xl.md, T1.1): migration 0033 adds gender,
// store pickup and warranty months. It is idempotent so a re-run (or a later branch re-applying it) changes nothing.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { startCatalogFixture } from "./catalog-helpers.mjs";

let f;
const q = (sql, args = []) => f.q(sql, args);
const SQL_FILE = new URL("../../drizzle/0033_account-pickup-devices.sql", import.meta.url);
const runMigrationFile = async () => {
  const text = await readFile(SQL_FILE, "utf8");
  for (const statement of text.split("--> statement-breakpoint")) if (statement.trim()) await q(statement);
};

before(async () => { f = await startCatalogFixture({ taxonomy: false }); }, { timeout: 120000 });
after(async () => { await f?.stop(); }, { timeout: 45000 });

test("0033 columns exist and a re-run is a no-op", async () => {
  await runMigrationFile();
  await runMigrationFile();
  const columns = (await q(`SELECT table_name||'.'||column_name AS c FROM information_schema.columns
    WHERE (table_name,column_name) IN (('customer_profiles','gender'),('orders','fulfillment_method'),('orders','pickup_snapshot'),('store_settings','pickup_location'),('categories','warranty_months'),('products','warranty_months')) ORDER BY 1`)).rows.map(row => row.c);
  assert.deepEqual(columns, ["categories.warranty_months", "customer_profiles.gender", "orders.fulfillment_method", "orders.pickup_snapshot", "products.warranty_months", "store_settings.pickup_location"]);
});

test("pickup seed is the Panfilova 154 showroom, daily 10:00–19:00", async () => {
  const seed = (await q("SELECT column_default FROM information_schema.columns WHERE table_name='store_settings' AND column_name='pickup_location'")).rows[0].column_default;
  assert.match(seed, /Panfilov St/);
  assert.match(seed, /10:00–19:00/);
  assert.match(seed, /"enabled": ?true/);
});

test("checks refuse bad gender, warranty months and a pickup order without a store copy", async () => {
  await assert.rejects(q("INSERT INTO categories(id,key,name,warranty_months) VALUES($1,'w-bad','W',0)", [randomUUID()]), /categories_warranty_months_valid/);
  await assert.rejects(q("INSERT INTO products(id,public_key,name,warranty_months) VALUES($1,'w-bad-p','P',121)", [randomUUID()]), /products_warranty_months_valid/);
  await q("INSERT INTO categories(id,key,name,warranty_months) VALUES($1,'w-ok','W',24)", [randomUUID()]);
  const check = (await q("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname='orders_fulfillment_method_valid'")).rows[0].d;
  assert.match(check, /pickup_snapshot IS NOT NULL/);
  const gender = (await q("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname='customer_profiles_gender_valid'")).rows[0].d;
  assert.match(gender, /unspecified/);
});
