// Migration 0014: option display type, option value swatches, products.thumbnail_source (generated from
// legacy_content.image) and the admin list keyset index. One database is upgraded from 0013 with sentinel
// rows; a second one is migrated from scratch for the constraint and variant-sync assertions.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { syncProductVariants, readVariantConfiguration } from "../../src/server/catalog/variant-sync.ts";

const MIGRATION = "0024_catalog-admin-variant-display"; // was 0014 before the beta5 merge renumbered it
const env = url => parseServerEnv({ DATABASE_URL: url, DATABASE_POOL_MAX: "3", DATABASE_CONNECT_TIMEOUT_MS: "10000", DATABASE_STATEMENT_TIMEOUT_MS: "60000" });
let temporary, upgraded, fresh, history;
const sentinel = { product: randomUUID(), option: randomUUID(), value: randomUUID() };
const q = (text, args = []) => fresh.pool.query(text, args);
async function rejects(text, args, constraint) {
  await assert.rejects(q(text, args), error => { assert.equal(error.code, "23514", error.message); assert.equal(error.constraint, constraint); return true; });
}
async function sync(input) {
  const client = await fresh.pool.connect();
  try { await client.query("BEGIN"); const result = await syncProductVariants(client, input); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

before(async () => {
  temporary = await startTemporaryPostgres();
  upgraded = createDatabase(env(temporary.url));
  const tempRoot = resolve("temp");
  history = await mkdtemp(join(tempRoot, "schema-0013-"));
  if (!history.startsWith(tempRoot + sep)) throw new Error("Invalid prior migration fixture directory");
  await cp("drizzle", history, { recursive: true });
  const journal = JSON.parse(await readFile(join(history, "meta/_journal.json"), "utf8"));
  const cut = journal.entries.findIndex(entry => entry.tag === MIGRATION);
  const dropped = journal.entries.slice(cut);
  journal.entries = journal.entries.slice(0, cut);
  assert.equal(journal.entries.at(-1).tag, "0023_taxonomy-compatibility-geo");
  await writeFile(join(history, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of dropped) await rm(join(history, `${entry.tag}.sql`));
  await migrate(upgraded.db, { migrationsFolder: history });
  await upgraded.pool.query(`INSERT INTO products (id,public_key,name,legacy_content) VALUES ($1,'upgrade-0014','Upgrade sentinel','{"image":"/images/sentinel.jpg","name":"Upgrade sentinel"}')`, [sentinel.product]);
  await upgraded.pool.query("INSERT INTO product_options (id,product_id,key,name) VALUES ($1,$2,'color','Color')", [sentinel.option, sentinel.product]);
  await upgraded.pool.query("INSERT INTO option_values (id,product_id,option_id,key,label) VALUES ($1,$2,$3,'black','Black')", [sentinel.value, sentinel.product, sentinel.option]);
  await migrate(upgraded.db, { migrationsFolder: "drizzle" });
  const url = new URL(temporary.url);
  await upgraded.pool.query('CREATE DATABASE "grmn_fresh_0014"');
  url.pathname = "/grmn_fresh_0014";
  fresh = createDatabase(env(url.toString()));
  await migrate(fresh.db, { migrationsFolder: "drizzle" });
}, { timeout: 180000 });

after(async () => {
  try { await fresh?.close(); await upgraded?.close(); } finally {
    await temporary?.stop();
    if (history) await rm(history, { recursive: true, force: true });
  }
}, { timeout: 45000 });

test("0014 upgrades a 0013 database: defaults, generated thumbnail backfill and a replay-safe history", async () => {
  await migrate(upgraded.db, { migrationsFolder: "drizzle" });
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries.length;
  assert.equal((await upgraded.pool.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")).rows[0].n, journal);
  assert.equal((await upgraded.pool.query("SELECT display FROM product_options WHERE id=$1", [sentinel.option])).rows[0].display, "buttons");
  assert.deepEqual((await upgraded.pool.query("SELECT swatch_color,swatch_image_source FROM option_values WHERE id=$1", [sentinel.value])).rows[0], { swatch_color: null, swatch_image_source: null });
  assert.equal((await upgraded.pool.query("SELECT thumbnail_source FROM products WHERE id=$1", [sentinel.product])).rows[0].thumbnail_source, "/images/sentinel.jpg");
  // The generated column follows legacy_content on every write and cannot be written directly.
  await upgraded.pool.query(`UPDATE products SET legacy_content='{"image":"/images/changed.jpg"}' WHERE id=$1`, [sentinel.product]);
  assert.equal((await upgraded.pool.query("SELECT thumbnail_source FROM products WHERE id=$1", [sentinel.product])).rows[0].thumbnail_source, "/images/changed.jpg");
  await assert.rejects(upgraded.pool.query("UPDATE products SET thumbnail_source='x' WHERE id=$1", [sentinel.product]), error => error.code === "428C9");
  const triggers = (await upgraded.pool.query("SELECT tgname FROM pg_trigger WHERE tgname IN ('catalog_option_lock','catalog_value_lock','catalog_taxonomy_lock') ORDER BY tgname")).rows.map(row => row.tgname);
  assert.deepEqual(triggers, ["catalog_option_lock", "catalog_taxonomy_lock", "catalog_value_lock"]);
  const index = (await upgraded.pool.query("SELECT indexdef FROM pg_indexes WHERE indexname='products_admin_order_idx'")).rows[0].indexdef;
  assert.match(index, /updated_at DESC, id DESC/);
});

test("display and swatch constraints reject invalid values", async () => {
  const product = randomUUID(), option = randomUUID();
  await q("INSERT INTO products (id,public_key,name) VALUES ($1,$2,'Constraint fixture')", [product, `c-${product}`]);
  await rejects("INSERT INTO product_options (id,product_id,key,name,display) VALUES ($1,$2,'color','Color','grid')", [option, product], "product_options_display_valid");
  await q("INSERT INTO product_options (id,product_id,key,name,display) VALUES ($1,$2,'color','Color','swatch')", [option, product]);
  for (const color of ["#ABCDEF", "#abc", "red", "#1234567"]) await rejects("INSERT INTO option_values (id,product_id,option_id,key,label,swatch_color) VALUES ($1,$2,$3,$4,'X',$5)", [randomUUID(), product, option, color, color], "option_values_swatch_color_valid");
  await rejects("INSERT INTO option_values (id,product_id,option_id,key,label,swatch_image_source) VALUES ($1,$2,$3,'blank','X','  ')", [randomUUID(), product, option], "option_values_swatch_image_valid");
  await q("INSERT INTO option_values (id,product_id,option_id,key,label,swatch_color,swatch_image_source) VALUES ($1,$2,$3,'ok','OK','#a1b2c3','/uploads/swatch.png')", [randomUUID(), product, option]);
});

test("variant-sync persists display and normalized swatches, reads them back and clears them when removed", async () => {
  const product = randomUUID();
  await q("INSERT INTO products (id,public_key,name,status) VALUES ($1,$2,'Swatch sync','published')", [product, `s-${product}`]);
  const options = [{ id: "color", key: "color", name: "Color", display: "swatch", values: [{ id: "b", key: "black", label: "Black", swatchColor: "#ABC" }, { id: "w", key: "white", label: "White", swatchImage: "/uploads/white.png" }] }];
  const variants = [{ id: "v1", sku: `SW-${product.slice(0, 8)}-B`, selections: { color: "b" }, price: 10, status: "active", isDefault: true }, { id: "v2", sku: `SW-${product.slice(0, 8)}-W`, selections: { color: "w" }, price: 10, status: "active" }];
  await sync({ productId: product, options, variants });
  let config = await readVariantConfiguration(fresh.pool, product);
  assert.equal(config.options[0].display, "swatch");
  assert.deepEqual(config.options[0].values.map(v => [v.key, v.swatchColor, v.swatchImage]), [["black", "#aabbcc", null], ["white", null, "/uploads/white.png"]]);
  // A second identical run is a no-op; the stored ids are accepted as input ids.
  const again = await sync({ productId: product, options: config.options.map(o => ({ ...o, values: o.values.map(v => ({ ...v, swatchColor: v.swatchColor ?? undefined, swatchImage: v.swatchImage ?? undefined })) })), variants: config.variants.map(v => ({ id: v.id, sku: v.sku, selections: v.selections, price: Number(v.priceMinor) / 100, status: v.status, isDefault: v.isDefault })) });
  assert.deepEqual([again.options, again.values, again.variants.created], [{ created: 0, updated: 0, removed: 0 }, { created: 0, updated: 0, removed: 0 }, 0]);
  await sync({ productId: product, options: [{ ...options[0], display: "dropdown", values: options[0].values.map(v => ({ id: v.id, key: v.key, label: v.label })) }], variants });
  config = await readVariantConfiguration(fresh.pool, product);
  assert.equal(config.options[0].display, "dropdown");
  assert.deepEqual(config.options[0].values.map(v => [v.swatchColor, v.swatchImage]), [[null, null], [null, null]]);
  await assert.rejects(sync({ productId: product, options: [{ ...options[0], values: [{ id: "b", key: "black", label: "Black", swatchColor: "#12345678" }] }], variants: [variants[0]] }), error => error.status === 400);
});
