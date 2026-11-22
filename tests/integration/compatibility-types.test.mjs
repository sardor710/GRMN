// Owner 2026-11-22: a device can be linked to a whole accessory type (a charger type, QuickFit 22 mm). Accessories
// filed under that type later show on the device's Accessories tab, and the device on their Compatible Devices tab,
// without another edit. Narrowing to an option value limits it to that size.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { createCatalogService } from "../../src/server/catalog/service.ts";

let f, api;
before(async () => {
  f = await startCatalogFixture();
  api = createCatalogService({ pool: f.database.pool });
  await f.q("INSERT INTO categories(id,key,name,kind,slug,parent_id,nav_visible) SELECT $1,'cables-chargers/test-clip','Test charging clip','group','cables-chargers/test-clip',id,false FROM categories WHERE key='cables-chargers'", [randomUUID()]);
}, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const detail = key => api.getProductByPublicKey(key, "default", "KZT");
const fresh = key => f.catalog.getProduct(f.admin, key);

test("type link shows future accessories on both tabs, and the editor payload echoes it", async () => {
  const n = nextSerial();
  const device = await f.catalog.saveProduct(f.admin, deviceCommand(n, { categories: [{ key: "watch-series/fenix", primary: true }], compatibility: { types: [{ categoryKey: "cables-chargers/test-clip", optionValueKeys: [] }] } }));
  assert.deepEqual(device.compatibility.types, [{ categoryKey: "cables-chargers/test-clip", optionValueKeys: [] }]);
  assert.equal(device.compatibility.compatibleTypes[0].name, "Test charging clip");
  const charger = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-clip`, { name: `Clip ${n}`, categories: [{ key: "cables-chargers/test-clip", primary: true }] }));
  const accessories = (await detail(device.id)).compatibleAccessories;
  const row = accessories.find(a => a.publicKey === charger.id);
  assert.ok(row, "the charger filed later is listed on the device");
  assert.equal(row.variantIds, null, "an unnarrowed type link fits every variant");
  assert.deepEqual(row.group, { slug: "cables-chargers", name: "Cables & Chargers" });
  const devices = (await detail(charger.id)).compatibleDevices;
  assert.deepEqual(devices.map(d => d.label), [device.name]);
});

test("option value narrows a type link to that size, worded like garmin.com", async () => {
  const n = nextSerial();
  const device = await f.catalog.saveProduct(f.admin, deviceCommand(n, { compatibility: { types: [{ categoryKey: "bands/quickfit-22-mm", optionValueKeys: ["47 mm"] }] } }));
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-22`, { name: `QuickFit 22 band ${n}`, categories: [{ key: "bands/quickfit-22-mm", primary: true }] }));
  const page = await detail(device.id);
  const fits = page.compatibleAccessories.find(a => a.publicKey === band.id).variantIds.map(id => page.variants.find(v => v.id === id).options["case-size"]);
  assert.deepEqual([...new Set(fits)], ["47 mm"]);
  assert.deepEqual((await detail(band.id)).compatibleDevices.map(d => d.label), [`${device.name} – 47 mm`]);
});

test("type and row link for the same pair do not duplicate", async () => {
  const n = nextSerial();
  const device = await f.catalog.saveProduct(f.admin, deviceCommand(n, { compatibility: { types: [{ categoryKey: "cables-chargers/test-clip", optionValueKeys: [] }] } }));
  const charger = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-clip`, { name: `Clip ${n}`, categories: [{ key: "cables-chargers/test-clip", primary: true }], compatibility: { devices: [{ productKey: device.id }] } }));
  assert.equal((await detail(device.id)).compatibleAccessories.filter(a => a.publicKey === charger.id).length, 1);
  assert.equal((await detail(charger.id)).compatibleDevices.filter(d => d.publicKey === device.id).length, 1);
});

test("unpublished accessories stay hidden; a type link to a catalog category or series is refused", async () => {
  const n = nextSerial();
  const device = await f.catalog.saveProduct(f.admin, deviceCommand(n, { compatibility: { types: [{ categoryKey: "cables-chargers/test-clip", optionValueKeys: [] }] } }));
  const draft = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-draft`, { status: "draft", categories: [{ key: "cables-chargers/test-clip", primary: true }] }));
  assert.ok(!(await detail(device.id)).compatibleAccessories.some(a => a.publicKey === draft.id));
  for (const categoryKey of ["wearables-smartwatches", "watch-series/fenix"]) {
    await assert.rejects(f.catalog.saveProduct(f.admin, { ...(await fresh(device.id)), compatibility: { types: [{ categoryKey, optionValueKeys: [] }] } }), error => error.status === 400 && /accessory/i.test(error.message));
  }
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...(await fresh(device.id)), compatibility: { types: [{ categoryKey: "no-such-category", optionValueKeys: [] }] } }), error => error.status === 400);
});

test("removing a linked option value or deleting the device clears its type links", async () => {
  const n = nextSerial();
  let device = await f.catalog.saveProduct(f.admin, deviceCommand(n, { status: "draft", compatibility: { types: [{ categoryKey: "bands/quickfit-22-mm", optionValueKeys: ["43 mm"] }, { categoryKey: "cables-chargers/test-clip", optionValueKeys: [] }] } }));
  const size = device.options.find(o => o.key === "case-size"), s43 = size.values.find(v => v.key === "43 mm");
  device = await f.catalog.saveProduct(f.admin, { ...device, options: device.options.map(o => o.id === size.id ? { ...o, values: o.values.filter(v => v.id !== s43.id) } : o), variants: device.variants.filter(v => v.selections[size.id] !== s43.id).map((v, i) => ({ ...v, isDefault: i === 0 })) });
  assert.deepEqual(device.compatibility.types, [{ categoryKey: "cables-chargers/test-clip", optionValueKeys: [] }]);
  await f.cms.deleteProduct(f.admin, device.id, device.version);
  assert.equal((await f.q("SELECT count(*)::int AS n FROM product_compatibility_types t JOIN products p ON p.id=t.device_product_id WHERE p.public_key=$1", [device.id])).rows[0].n, 0);
});
