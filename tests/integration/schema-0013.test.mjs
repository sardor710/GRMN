// Migration 0013: category kinds/slugs/presets, product_compatibility, saved-address geo pin and
// typed in_the_box items. One database is upgraded from 0012 with sentinel rows; a second database in
// the same disposable cluster is migrated from scratch and used for the constraint assertions.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

const MIGRATION = "0023_taxonomy-compatibility-geo"; // was 0013 before the beta5 merge renumbered it
const env = (url) => parseServerEnv({ DATABASE_URL: url, DATABASE_POOL_MAX: "3", DATABASE_CONNECT_TIMEOUT_MS: "10000", DATABASE_STATEMENT_TIMEOUT_MS: "60000" });
let temporary, upgraded, fresh, before0013;
const sentinel = { user: randomUUID(), address: randomUUID(), product: randomUUID(), category: randomUUID() };
const q = (text, args = []) => fresh.pool.query(text, args);

async function rejects(text, args, code, constraint) {
  await assert.rejects(q(text, args), (error) => {
    assert.equal(error.code, code, error.message);
    if (constraint) assert.equal(error.constraint, constraint, error.message);
    return true;
  });
}

before(async () => {
  temporary = await startTemporaryPostgres();
  upgraded = createDatabase(env(temporary.url));
  // History copy that stops at 0012.
  const tempRoot = resolve("temp");
  before0013 = await mkdtemp(join(tempRoot, "schema-0012-"));
  if (!before0013.startsWith(tempRoot + sep)) throw new Error("Invalid prior migration fixture directory");
  await cp("drizzle", before0013, { recursive: true });
  const journal = JSON.parse(await readFile(join(before0013, "meta/_journal.json"), "utf8"));
  // Drop 0013 and every later migration (0014+ were appended after this test was written).
  const cut = journal.entries.findIndex((entry) => entry.tag === MIGRATION);
  const dropped = journal.entries.slice(cut);
  journal.entries = journal.entries.slice(0, cut);
  assert.equal(journal.entries.at(-1).tag, "0022_variant-content");
  await writeFile(join(before0013, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of dropped) await rm(join(before0013, `${entry.tag}.sql`));
  await migrate(upgraded.db, { migrationsFolder: before0013 });
  // Sentinels written under the 0012 schema.
  await upgraded.pool.query("INSERT INTO users (id,name,email) VALUES ($1,'Upgrade sentinel','upgrade-0013@example.invalid')", [sentinel.user]);
  await upgraded.pool.query("INSERT INTO customer_addresses (id,user_id,label,recipient_name,phone,country_code,city,line1,is_primary) VALUES ($1,$2,'Home','Sentinel','+77001234567','KZ','Almaty','Abay 1',true)", [sentinel.address, sentinel.user]);
  await upgraded.pool.query(`INSERT INTO products (id,public_key,name,in_the_box) VALUES ($1,'upgrade-0013','Upgrade sentinel','["Watch","Charging cable"]')`, [sentinel.product]);
  await upgraded.pool.query("INSERT INTO categories (id,key,name) VALUES ($1,'legacy-upgrade','Legacy category')", [sentinel.category]);
  await migrate(upgraded.db, { migrationsFolder: "drizzle" });

  const fresh_url = new URL(temporary.url);
  await upgraded.pool.query('CREATE DATABASE "grmn_fresh_0013"');
  fresh_url.pathname = "/grmn_fresh_0013";
  fresh = createDatabase(env(fresh_url.toString()));
  await migrate(fresh.db, { migrationsFolder: "drizzle" });
}, { timeout: 180000 });

after(async () => {
  try { await fresh?.close(); await upgraded?.close(); } finally {
    await temporary?.stop();
    if (before0013) await rm(before0013, { recursive: true, force: true });
  }
}, { timeout: 45000 });

const journalLength = async () => JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries.length;
const historyCount = async (handle) => (await handle.pool.query("SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations")).rows[0].count;

test("0013 upgrades a 0012 database, preserves sentinel rows, backfills defaults and replays safely", async () => {
  await migrate(upgraded.db, { migrationsFolder: "drizzle" });
  assert.equal(await historyCount(upgraded), await journalLength());
  const category = (await upgraded.pool.query("SELECT key,kind,slug,preset_filters,nav_visible,description FROM categories WHERE id=$1", [sentinel.category])).rows[0];
  assert.deepEqual(category, { key: "legacy-upgrade", kind: "catalog", slug: null, preset_filters: {}, nav_visible: true, description: null });
  const product = (await upgraded.pool.query("SELECT in_the_box FROM products WHERE id=$1", [sentinel.product])).rows[0];
  assert.deepEqual(product.in_the_box, ["Watch", "Charging cable"]);
  const address = (await upgraded.pool.query("SELECT city,latitude,longitude,geo_precision FROM customer_addresses WHERE id=$1", [sentinel.address])).rows[0];
  assert.deepEqual(address, { city: "Almaty", latitude: null, longitude: null, geo_precision: null });
  assert.equal((await upgraded.pool.query("SELECT name FROM users WHERE id=$1", [sentinel.user])).rows[0].name, "Upgrade sentinel");
  // The 0001 taxonomy and configuration triggers survive the upgrade.
  const triggers = (await upgraded.pool.query("SELECT tgname FROM pg_trigger WHERE tgname IN ('catalog_taxonomy_lock','catalog_category_cycle','catalog_value_lock','customer_addresses_guard') ORDER BY tgname")).rows.map((row) => row.tgname);
  assert.deepEqual(triggers, ["catalog_category_cycle", "catalog_taxonomy_lock", "catalog_value_lock", "customer_addresses_guard"]);
});

test("0013 migrates an empty database from scratch", async () => {
  assert.equal(await historyCount(fresh), await journalLength());
  const table = await q("SELECT to_regclass('public.product_compatibility') IS NOT NULL AS present");
  assert.equal(table.rows[0].present, true);
  const fn = await q("SELECT provolatile FROM pg_proc WHERE proname='catalog_in_the_box_valid'");
  assert.equal(fn.rows[0].provolatile, "i");
});

test("categories enforce kind, slug format/uniqueness and object presets without breaking the cycle trigger", async () => {
  const root = randomUUID(), child = randomUUID(), group = randomUUID();
  await q(`INSERT INTO categories (id,key,name,kind,slug,preset_filters) VALUES ($1,'smartwatches','Smartwatches','catalog','wearables-smartwatches','{}'),($2,'running','Running','catalog','sports-fitness/running-smartwatches','{"activities":["running"]}')`, [root, child]);
  await q("UPDATE categories SET parent_id=$1 WHERE id=$2", [root, child]);
  await q("INSERT INTO categories (id,key,name,kind,slug,nav_visible,description) VALUES ($1,'bands','Bands','accessory','bands',false,'Watch bands')", [group]);
  await q("INSERT INTO categories (id,key,name,kind,slug,parent_id) VALUES ($1,'quickfit-22','QuickFit 22 mm','group','bands/quickfit-22-mm',$2)", [randomUUID(), group]);
  const saved = (await q("SELECT kind,preset_filters,nav_visible FROM categories WHERE id=$1", [child])).rows[0];
  assert.deepEqual(saved, { kind: "catalog", preset_filters: { activities: ["running"] }, nav_visible: true });

  await rejects("INSERT INTO categories (id,key,name,kind) VALUES ($1,'bad-kind','Bad kind','brand')", [randomUUID()], "23514", "categories_kind_valid");
  await rejects("INSERT INTO categories (id,key,name,slug) VALUES ($1,'dupe-slug','Duplicate','wearables-smartwatches')", [randomUUID()], "23505", "categories_slug_unique");
  for (const slug of ["Wearables", "trailing-", "a//b", "/leading", "spaced slug", "fēnix"]) {
    await rejects("INSERT INTO categories (id,key,name,slug) VALUES ($1,$2,'Bad slug',$3)", [randomUUID(), `bad-${randomUUID()}`, slug], "23514", "categories_slug_valid");
  }
  await rejects(`INSERT INTO categories (id,key,name,preset_filters) VALUES ($1,'array-preset','Array preset','["running"]')`, [randomUUID()], "23514", "categories_preset_filters_object");
  // Multiple legacy rows may keep a NULL slug.
  await q("INSERT INTO categories (id,key,name) VALUES ($1,'no-slug-a','A'),($2,'no-slug-b','B')", [randomUUID(), randomUUID()]);
  // The 0001 taxonomy guard still rejects cycles.
  await rejects("UPDATE categories SET parent_id=$1 WHERE id=$2", [child, root], "23514");
});

test("product_compatibility enforces ownership, one device scope, uniqueness, no self-links and restrictive deletes", async () => {
  const device = randomUUID(), accessory = randomUUID(), other = randomUUID();
  const caseSize = randomUUID(), mm47 = randomUUID(), mm51 = randomUUID(), otherOption = randomUUID(), otherValue = randomUUID();
  const v47 = randomUUID(), v51 = randomUUID(), v51b = randomUUID(), bandBlack = randomUUID(), otherVariant = randomUUID();
  await q("INSERT INTO products (id,public_key,name) VALUES ($1,'fenix-8','fēnix 8'),($2,'quickfit-22','QuickFit 22 band'),($3,'venu-4','Venu 4')", [device, accessory, other]);
  await q("INSERT INTO product_options (id,product_id,key,name) VALUES ($1,$2,'case-size','Case size'),($3,$4,'case-size','Case size')", [caseSize, device, otherOption, other]);
  await q("INSERT INTO option_values (id,product_id,option_id,key,label) VALUES ($1,$3,$4,'47','47 mm'),($2,$3,$4,'51','51 mm'),($5,$6,$7,'45','45 mm')", [mm47, mm51, device, caseSize, otherValue, other, otherOption]);
  const edition = randomUUID(), standard = randomUUID(), solar = randomUUID();
  await q("INSERT INTO product_options (id,product_id,key,name,position) VALUES ($1,$2,'edition','Edition',1)", [edition, device]);
  await q("INSERT INTO option_values (id,product_id,option_id,key,label) VALUES ($1,$3,$4,'standard','Standard'),($2,$3,$4,'solar','Solar')", [standard, solar, device, edition]);
  await q("INSERT INTO product_variants (id,product_id,sku) VALUES ($1,$4,'FX8-47'),($2,$4,'FX8-51'),($3,$4,'FX8-51-SOLAR'),($5,$6,'QF22-BLK'),($7,$8,'VENU4-45')", [v47, v51, v51b, device, bandBlack, accessory, otherVariant, other]);
  await q("INSERT INTO variant_option_values (variant_id,product_id,option_id,option_value_id) VALUES ($1,$4,$5,$6),($2,$4,$5,$7),($3,$4,$5,$7),($1,$4,$8,$9),($2,$4,$8,$9),($3,$4,$8,$10)", [v47, v51, v51b, device, caseSize, mm47, mm51, edition, standard, solar]);

  const insert = "INSERT INTO product_compatibility (id,accessory_product_id,accessory_variant_id,device_product_id,device_option_value_id,device_variant_id,position) VALUES ($1,$2,$3,$4,$5,$6,$7)";
  await q(insert, [randomUUID(), accessory, null, device, mm51, null, 0]); // fits every 51 mm variant
  await q(insert, [randomUUID(), accessory, bandBlack, device, null, v47, 1]); // single-variant exception for one accessory SKU
  await q(insert, [randomUUID(), accessory, null, other, null, null, 0]); // fits all Venu 4 variants

  await rejects(insert, [randomUUID(), accessory, null, other, null, null, 5], "23505", "product_compatibility_link_unique");
  await rejects(insert, [randomUUID(), accessory, null, device, mm51, null, 2], "23505", "product_compatibility_link_unique");
  await rejects(insert, [randomUUID(), accessory, bandBlack, device, null, v47, 2], "23505", "product_compatibility_link_unique");
  await rejects(insert, [randomUUID(), device, null, device, null, null, 0], "23514", "product_compatibility_not_self");
  await rejects(insert, [randomUUID(), accessory, null, device, mm51, v51, 0], "23514", "product_compatibility_single_device_scope");
  await rejects(insert, [randomUUID(), accessory, null, device, null, null, -1], "23514", "product_compatibility_position_valid");
  await rejects(insert, [randomUUID(), accessory, null, device, otherValue, null, 0], "23503", "product_compatibility_device_option_value_fk");
  await rejects(insert, [randomUUID(), accessory, null, device, null, otherVariant, 0], "23503", "product_compatibility_device_variant_fk");
  await rejects(insert, [randomUUID(), accessory, otherVariant, device, null, null, 0], "23503", "product_compatibility_accessory_variant_fk");
  await rejects(insert, [randomUUID(), accessory, null, randomUUID(), null, null, 0], "23503");
  await rejects("UPDATE product_compatibility SET device_product_id=$1 WHERE device_option_value_id=$2", [other, mm51], "23503", "product_compatibility_device_option_value_fk");

  // Device side: accessories for a concrete variant resolve through all three scopes.
  const forVariant = async (variant) => (await q(`SELECT pc.accessory_product_id,pc.accessory_variant_id FROM product_variants v JOIN product_compatibility pc ON pc.device_product_id=v.product_id
    WHERE v.id=$1 AND ((pc.device_option_value_id IS NULL AND pc.device_variant_id IS NULL) OR pc.device_variant_id=v.id
      OR pc.device_option_value_id IN (SELECT option_value_id FROM variant_option_values WHERE variant_id=v.id)) ORDER BY pc.position`, [variant])).rows;
  assert.deepEqual(await forVariant(v51b), [{ accessory_product_id: accessory, accessory_variant_id: null }]);
  assert.deepEqual(await forVariant(v47), [{ accessory_product_id: accessory, accessory_variant_id: bandBlack }]);
  assert.deepEqual(await forVariant(otherVariant), [{ accessory_product_id: accessory, accessory_variant_id: null }]);
  // Accessory side: supported models are the same rows read the other way.
  const models = (await q("SELECT DISTINCT device_product_id FROM product_compatibility WHERE accessory_product_id=$1 ORDER BY 1", [accessory])).rows.map((row) => row.device_product_id);
  assert.deepEqual(models, [device, other].sort());

  // Restrictive deletes: archive instead of deleting referenced catalog rows.
  // ON DELETE RESTRICT reports restrict_violation (23001).
  const plainDevice = randomUUID();
  await q("INSERT INTO products (id,public_key,name) VALUES ($1,'edge-1050','Edge 1050')", [plainDevice]);
  await q(insert, [randomUUID(), accessory, null, plainDevice, null, null, 0]);
  await rejects("DELETE FROM products WHERE id=$1", [plainDevice], "23001", "product_compatibility_device_product_id_products_id_fk");
  // A value no variant selects yet (e.g. a future 49 mm case) is still pinned by its compatibility row.
  const mm49 = randomUUID();
  await q("INSERT INTO option_values (id,product_id,option_id,key,label) VALUES ($1,$2,$3,'49','49 mm')", [mm49, device, caseSize]);
  await q(insert, [randomUUID(), accessory, null, device, mm49, null, 3]);
  await rejects("DELETE FROM option_values WHERE id=$1", [mm49], "23001", "product_compatibility_device_option_value_fk");
  await rejects("DELETE FROM product_variants WHERE id=$1", [bandBlack], "23001", "product_compatibility_accessory_variant_fk");
});

test("customer_addresses geo pin requires both coordinates in range and a known precision", async () => {
  const user = randomUUID(), address = randomUUID();
  await q("INSERT INTO users (id,name,email) VALUES ($1,'Geo user','geo-0013@example.invalid')", [user]);
  const insert = "INSERT INTO customer_addresses (id,user_id,label,recipient_name,phone,country_code,city,line1,is_primary,latitude,longitude,geo_precision) VALUES ($1,$2,'Home','Geo','+77001234567','KZ','Almaty','Abay 1',$3,$4,$5,$6)";
  await q(insert, [address, user, true, "43.2389491", "76.8897", "exact"]);
  const saved = (await q("SELECT latitude,longitude,geo_precision FROM customer_addresses WHERE id=$1", [address])).rows[0];
  assert.deepEqual(saved, { latitude: "43.238949", longitude: "76.889700", geo_precision: "exact" });
  await q(insert, [randomUUID(), user, false, null, null, null]);
  await q(insert, [randomUUID(), user, false, "-90", "180", "manual"]);

  await rejects(insert, [randomUUID(), user, false, "43.2", null, null], "23514", "customer_addresses_geo_pair");
  await rejects(insert, [randomUUID(), user, false, null, "76.9", "locality"], "23514", "customer_addresses_geo_pair");
  await rejects(insert, [randomUUID(), user, false, "90.000001", "76.9", "street"], "23514", "customer_addresses_geo_range");
  await rejects(insert, [randomUUID(), user, false, "43.2", "-180.5", "street"], "23514", "customer_addresses_geo_range");
  await rejects(insert, [randomUUID(), user, false, null, null, "exact"], "23514", "customer_addresses_geo_precision_valid");
  await rejects(insert, [randomUUID(), user, false, "43.2", "76.9", "city"], "23514", "customer_addresses_geo_precision_valid");
  await rejects("UPDATE customer_addresses SET longitude=NULL WHERE id=$1", [address], "23514", "customer_addresses_geo_pair");
  await q("UPDATE customer_addresses SET latitude=NULL,longitude=NULL,geo_precision=NULL WHERE id=$1", [address]);
});

test("products.in_the_box accepts strings and labelled objects and rejects malformed items", async () => {
  const id = randomUUID();
  const mixed = ["fēnix 8", { label: "Charging/data cable", image: "/images/box/cable.png" }, { label: "Documentation" }, ""];
  await q("INSERT INTO products (id,public_key,name,in_the_box) VALUES ($1,'box-mixed','Box fixture',$2::jsonb)", [id, JSON.stringify(mixed)]);
  assert.deepEqual((await q("SELECT in_the_box FROM products WHERE id=$1", [id])).rows[0].in_the_box, mixed);
  const invalid = [[{ label: "" }], [{ label: "   " }], [{ image: "/x.png" }], [{ label: "Cable", image: 5 }], [{ label: "Cable", quantity: 2 }], [{ label: 7 }], [5], [null], [["nested"]], [true]];
  for (const items of invalid) {
    await rejects("UPDATE products SET in_the_box=$1::jsonb WHERE id=$2", [JSON.stringify(items), id], "23514", "products_in_the_box_items");
  }
  await rejects(`UPDATE products SET in_the_box='{"label":"x"}'::jsonb WHERE id=$1`, [id], "23514");
});
