// Owner 2026-11-22 (admin bin): one SKU can be deleted from the Products list. A never-ordered SKU that was never in a
// checkout goes for good with its price, option selections, photo links and manual stock history; the product keeps a
// default and loses option values no SKU uses any more. Orders, checkout history and the last SKU are refused.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";

let f;
before(async () => { f = await startCatalogFixture({ taxonomy: false }); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const count = async (table, variantId) => (await f.q(`SELECT count(*)::int AS n FROM ${table} WHERE variant_id=$1`, [variantId])).rows[0].n;
const exists = async variantId => (await f.q("SELECT count(*)::int AS n FROM product_variants WHERE id=$1", [variantId])).rows[0].n === 1;
const productVersion = async key => (await f.q("SELECT version FROM products WHERE public_key=$1", [key])).rows[0].version;
const bySku = (product, suffix) => product.variants.find(variant => variant.sku.endsWith(suffix));

test("deleting a stocked, never-ordered SKU removes it, its prices, stock and option value", async () => {
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(nextSerial()));
  const gray = bySku(saved, "-51-G");
  assert.ok(await count("stock_movements", gray.id) > 0, "fixture has stock history");
  const out = await f.catalog.deleteVariant(f.admin, gray.id, saved.version);
  assert.equal(out.deleted, true);
  assert.equal(out.product.id, saved.id);
  assert.ok(out.product.version > saved.version);
  assert.equal(await exists(gray.id), false);
  for (const table of ["prices", "stock_movements", "inventory_balances", "variant_option_values"]) assert.equal(await count(table, gray.id), 0, table);
  const after = await f.catalog.getProduct(f.admin, saved.id);
  assert.equal(after.variants.length, 3);
  assert.equal(after.version, out.product.version);
  assert.ok(!after.options.find(option => option.key === "color").values.some(value => value.label === "Gray"));
  const audit = (await f.q("SELECT redacted_changes FROM audit_events WHERE action='catalog.stock_purged' AND target_id=$1", [gray.id])).rows;
  assert.equal(audit.length, 1);
});

test("deleting the default SKU moves the default", async () => {
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(nextSerial()));
  const first = bySku(saved, "-43-B");
  assert.equal(first.isDefault, true);
  await f.catalog.deleteVariant(f.admin, first.id, saved.version);
  const after = await f.catalog.getProduct(f.admin, saved.id);
  const defaults = after.variants.filter(variant => variant.isDefault);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].status, "active");
  const rows = (await f.q("SELECT count(*)::int AS n FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 AND v.is_default AND v.status<>'archived'", [saved.id])).rows;
  assert.equal(rows[0].n, 1);
});

test("the last SKU and a simple product's only SKU are refused", async () => {
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(nextSerial()));
  const only = (await f.q("SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1", [band.id])).rows[0].id;
  await assert.rejects(f.catalog.deleteVariant(f.admin, only, band.version), e => e.status === 409 && e.message === "This is the product's last SKU; delete the whole product instead");
  assert.equal(await exists(only), true);
  const two = await f.catalog.saveProduct(f.admin, deviceCommand(nextSerial()));
  let version = two.version;
  for (const suffix of ["-43-B", "-47-B", "-51-B"]) version = (await f.catalog.deleteVariant(f.admin, bySku(two, suffix).id, version)).product.version;
  await assert.rejects(f.catalog.deleteVariant(f.admin, bySku(two, "-51-G").id, version), e => e.status === 409 && /last SKU/.test(e.message));
});

test("an SKU with a reserve movement is refused and nothing changes", async () => {
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(nextSerial()));
  const held = bySku(saved, "-47-B");
  const location = (await f.q("SELECT location_id FROM inventory_balances WHERE variant_id=$1 LIMIT 1", [held.id])).rows[0].location_id;
  await f.q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES(gen_random_uuid(),$1,$2,0,1,'reserve',$3)", [held.id, location, "sku-del-r-" + held.id]);
  const movements = await count("stock_movements", held.id);
  await assert.rejects(f.catalog.deleteVariant(f.admin, held.id, saved.version), e => e.status === 409 && e.message === "This SKU was in a checkout, so it cannot be deleted; archive it instead");
  assert.equal(await exists(held.id), true);
  assert.equal(await count("stock_movements", held.id), movements);
  assert.equal(await productVersion(saved.id), saved.version);
});

test("stale version and missing permission are refused", async () => {
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(nextSerial()));
  const target = bySku(saved, "-51-B");
  await assert.rejects(f.catalog.deleteVariant(f.admin, target.id, saved.version + 5), e => e.status === 409 && e.code === "VERSION_CONFLICT");
  await assert.rejects(f.catalog.deleteVariant(f.reader.headers, target.id, saved.version), e => e.status === 403);
  assert.equal(await exists(target.id), true);
});

test("sku delete rolls back when the variant row survives sync", async () => {
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(nextSerial()));
  const target = bySku(saved, "-51-B");
  const movements = await count("stock_movements", target.id);
  // A reference the purge does not know about (stands in for a future table).
  await f.q("CREATE TABLE tmp_variant_ref(v uuid REFERENCES product_variants(id) ON DELETE RESTRICT)");
  try {
    await f.q("INSERT INTO tmp_variant_ref VALUES($1)", [target.id]);
    await assert.rejects(f.catalog.deleteVariant(f.admin, target.id, saved.version), e => e.status === 409 && e.message === "This SKU is still referenced; archive it instead");
    const row = (await f.q("SELECT status FROM product_variants WHERE id=$1", [target.id])).rows[0];
    assert.equal(row.status, "active");
    assert.equal(await count("stock_movements", target.id), movements);
    assert.ok(await count("prices", target.id) > 0);
    assert.equal(await productVersion(saved.id), saved.version);
  } finally {
    await f.q("DROP TABLE tmp_variant_ref");
  }
});
