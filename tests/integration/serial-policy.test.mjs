// Owner 2026-11-25 (plan T2.2/T2.3): "needs serial" read from the database — a category's setting is its own or its
// nearest ancestor's, archived categories don't count, the product setting wins, unfiled products fall back to
// their old-site category then their name. Admin ▸ Categories edits the setting; the report lists every product.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startCatalogFixture } from "./catalog-helpers.mjs";
import { resolveSerialRequirements, setProductSerialPolicy, serialPolicyReport } from "../../src/server/fulfillment/serial-policy.ts";

let f;
const q = (sql, args = []) => f.q(sql, args);
const ids = new Map();
async function category(key, { parent = null, kind = "catalog", policy = null, archived = false, name = key } = {}) {
  const id = randomUUID(); ids.set(key, id);
  await q("INSERT INTO categories(id,key,name,parent_id,kind,slug,serial_policy,archived) VALUES($1,$2,$3,$4,$5,$2,$6,$7)", [id, key, name, parent ? ids.get(parent) : null, kind, policy, archived]);
}
async function product(name, { categories = [], policy = null, legacy = {} } = {}) {
  const id = randomUUID();
  await q("INSERT INTO products(id,public_key,name,status,serial_policy,legacy_content) VALUES($1,$2,$3,'published',$4,$5)", [id, "serial-" + id, name, policy, JSON.stringify(legacy)]);
  for (const key of categories) await q("INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,false)", [id, ids.get(key)]);
  return id;
}
const decision = async id => (await resolveSerialRequirements(f.database.pool, [id])).get(id);

before(async () => {
  f = await startCatalogFixture({ taxonomy: false });
  await category("bands", { kind: "accessory", policy: "none", name: "Bands" });
  await category("bands/quickfit-22-mm", { kind: "accessory", parent: "bands", name: "QuickFit 22 mm" });
  await category("heart-rate-monitors", { kind: "accessory", policy: "required", name: "Heart Rate Monitors" });
  await category("cables-chargers", { kind: "accessory", policy: "none", name: "Cables & Chargers" });
  await category("wearables-smartwatches", { name: "Smartwatches" });
  await category("sports-fitness/multisport-smartwatches", { parent: "wearables-smartwatches", name: "Multisport Smartwatches" });
  await category("old-accessories", { kind: "accessory", policy: "none", archived: true });
}, { timeout: 120000 });
after(async () => { await f?.stop(); }, { timeout: 45000 });

test("a child category inherits its parent's setting", async () => {
  assert.deepEqual(await decision(await product("QuickFit 22 Silicone", { categories: ["bands/quickfit-22-mm"] })), { required: false, source: "category", detail: "bands/quickfit-22-mm" });
});

test("a watch in an unset branch needs a serial; an HRM filed under a sport too", async () => {
  assert.equal((await decision(await product("fēnix 8", { categories: ["sports-fitness/multisport-smartwatches"] }))).required, true);
  assert.deepEqual(await decision(await product("HRM 600", { categories: ["heart-rate-monitors", "sports-fitness/multisport-smartwatches"] })), { required: true, source: "category", detail: "heart-rate-monitors" });
});

test("an archived category does not count", async () => {
  assert.deepEqual(await decision(await product("Old thing", { categories: ["old-accessories"] })), { required: true, source: "default", detail: null });
});

test("the product setting wins and can be changed back to automatic", async () => {
  const id = await product("Odd band", { categories: ["heart-rate-monitors"] });
  const client = await f.database.pool.connect();
  try {
    const before = (await client.query("SELECT version,updated_at FROM products WHERE id=$1", [id])).rows[0];
    await setProductSerialPolicy(client, id, "none");
    assert.deepEqual(await decision(id), { required: false, source: "product", detail: null });
    const afterRow = (await client.query("SELECT version,updated_at FROM products WHERE id=$1", [id])).rows[0];
    assert.deepEqual(afterRow, before, "the open product editor's version must not change");
    await setProductSerialPolicy(client, id, null);
    assert.equal((await decision(id)).source, "category");
  } finally { client.release(); }
});

test("an unfiled product uses its old-site category, otherwise it needs a serial (names are never used)", async () => {
  assert.deepEqual(await decision(await product("Something", { legacy: { category: "Accessories", subCategory: "Cables & Chargers" } })), { required: false, source: "legacy-category", detail: "cables-chargers" });
  assert.deepEqual(await decision(await product("QuickFit 26 Band")), { required: true, source: "default", detail: null });
  assert.deepEqual(await decision(await product("vívoactive 6 with Silicone Band")), { required: true, source: "default", detail: null });
});

test("Admin ▸ Categories sets and clears the setting, and shows it on the tree", async () => {
  let tree;
  const epochOf = async () => (await q("SELECT epoch::text AS epoch FROM catalog_taxonomy_guard WHERE id=1")).rows[0]?.epoch ?? "0";
  tree = await f.catalog.updateCategory(f.admin, await epochOf(), "wearables-smartwatches", { serialPolicy: "none" });
  const top = tree.menu.find(item => item.key === "wearables-smartwatches");
  assert.equal(top.serialPolicy, "none");
  assert.equal((await decision(await product("Watch Y", { categories: ["sports-fitness/multisport-smartwatches"] }))).required, false);
  tree = await f.catalog.updateCategory(f.admin, await epochOf(), "wearables-smartwatches", { serialPolicy: null });
  assert.equal(tree.menu.find(item => item.key === "wearables-smartwatches").serialPolicy, null);
  await assert.rejects(f.catalog.updateCategory(f.admin, await epochOf(), "bands", { serialPolicy: "maybe" }), error => error.status === 400);
});

test("the report lists every product with its decision and flags guesses", async () => {
  const rows = await serialPolicyReport(f.database.pool);
  const byName = new Map(rows.map(row => [row.name, row]));
  assert.equal(byName.get("Something").guess, true, "an old-site category decision is a guess");
  assert.equal(byName.get("Something").needsSerial, false);
  assert.equal(byName.get("QuickFit 26 Band").guess, false);
  assert.equal(byName.get("QuickFit 26 Band").needsSerial, true);
  assert.equal(byName.get("HRM 600").guess, false);
  assert.equal(byName.get("HRM 600").needsSerial, true);
});

test("the product editor reads and changes the serial setting; only catalog editors may change it", async () => {
  const { createFulfillmentService } = await import("../../src/server/fulfillment/service.ts");
  const service = createFulfillmentService({ pool: f.database.pool, authorize: f.authorize });
  const id = await product("Editor watch", { categories: ["sports-fitness/multisport-smartwatches"] });
  assert.deepEqual(await service.getProductSerial(f.admin, id), { productId: id, policy: null, decision: { required: true, source: "default", detail: "sports-fitness/multisport-smartwatches" } });
  const changed = await service.setProductSerial(f.catalogEditor.headers, { productId: id, policy: "none" });
  assert.equal(changed.policy, "none");assert.equal(changed.decision.required, false);
  assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action='catalog.serial_policy' AND target_id=$1", [id])).rows[0].n, 1);
  await assert.rejects(service.setProductSerial(f.reader.headers, { productId: id, policy: "required" }), error => error.status === 403);
  await assert.rejects(service.setProductSerial(f.admin, { productId: id, policy: "maybe" }), error => error.status === 400);
  await assert.rejects(service.setProductSerial(f.admin, { productId: randomUUID(), policy: null }), error => error.status === 404);
});
