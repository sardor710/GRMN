// M4.6: public reads of product_compatibility. Device pages get accessories with the device variants each
// fits (resolved per variant, so new variants carrying a linked option value are covered automatically);
// accessory pages get the supported models in garmin.com wording "<device> – <option value(s)>".
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { createCatalogService } from "../../src/server/catalog/service.ts";
import { accessoriesForVariant, accessoryTabs } from "../../src/lib/catalog-facets.ts";

let f, api;
before(async () => { f = await startCatalogFixture(); api = createCatalogService({ pool: f.database.pool }); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const detail = key => api.getProductByPublicKey(key, "default", "KZT");
const sizeOf = (product, variantId) => product.variants.find(v => v.id === variantId).options["case-size"];

test("device page: accessories resolve per selected variant (whole device, option value, single variant) and group into tabs", async () => {
  const n = nextSerial();
  let fenix = await f.catalog.saveProduct(f.admin, deviceCommand(n, { categories: [{ key: "watch-series/fenix", primary: true }] }));
  const qf26 = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-26`, { name: `QuickFit 26 band ${n}`, categories: [{ key: "bands/quickfit-26-mm", primary: true }], compatibility: { devices: [{ productKey: fenix.id, optionValueKeys: ["51 mm"] }] } }));
  const hrm = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-hrm`, { name: `HRM ${n}`, categories: [{ key: "heart-rate-monitors", primary: true }], compatibility: { devices: [{ productKey: fenix.id }] } }));
  const cable = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-cable`, { name: `Cable ${n}`, stock: 0, compatibility: { devices: [{ productKey: fenix.id, variantSkus: [`DEV-${n}-47-B`] }] } }));
  const app = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-app`, { name: `App ${n}`, categories: [{ key: "apps", primary: true }], compatibility: { devices: [{ productKey: fenix.id }] } }));
  await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-draft`, { status: "draft", compatibility: { devices: [{ productKey: fenix.id }] } }));

  let device = await detail(fenix.id);
  const byKey = Object.fromEntries(device.compatibleAccessories.map(a => [a.publicKey, a]));
  assert.deepEqual(Object.keys(byKey).sort(), [qf26.id, hrm.id, cable.id, app.id].sort(), "draft accessories are not listed");
  const ids51 = device.variants.filter(v => v.options["case-size"] === "51 mm").map(v => v.id).sort();
  assert.deepEqual(byKey[qf26.id].variantIds, ids51);
  assert.equal(byKey[hrm.id].variantIds, null, "whole-device rows fit every variant");
  assert.deepEqual(byKey[cable.id].variantIds.map(id => sizeOf(device, id)), ["47 mm"]);
  assert.deepEqual([byKey[qf26.id].group, byKey[hrm.id].group, byKey[app.id].group, byKey[cable.id].group], [{ slug: "bands", name: "Bands" }, { slug: "heart-rate-monitors", name: "Heart Rate Monitors" }, { slug: "apps", name: "Apps" }, null]);
  assert.equal(byKey[cable.id].availability, "out_of_stock");
  assert.equal(byKey[qf26.id].price.selling.amountMinor, "2499500");

  const variant = size => device.variants.find(v => v.options["case-size"] === size).id;
  const fits = size => accessoriesForVariant(device.compatibleAccessories, variant(size)).map(a => a.publicKey).sort();
  assert.deepEqual(fits("43 mm"), [hrm.id, app.id].sort(), "the 51 mm band does not show on 43 mm");
  assert.deepEqual(fits("47 mm"), [hrm.id, app.id, cable.id].sort());
  assert.deepEqual(fits("51 mm"), [hrm.id, app.id, qf26.id].sort());
  assert.deepEqual(accessoryTabs(accessoriesForVariant(device.compatibleAccessories, variant("51 mm"))).map(t => [t.label, t.items.length]), [["Apps", 1], ["Bands", 1], ["Heart Rate Monitors", 1], ["View All", 3]]);

  // A new 51 mm colour variant is covered by the option-value row without touching the band.
  fenix = await f.catalog.getProduct(f.admin, fenix.id); // linking accessories bumped the device version
  const color = fenix.options.find(o => o.key === "color"), size = fenix.options.find(o => o.key === "case-size");
  const v51 = size.values.find(v => v.key === "51 mm");
  fenix = await f.catalog.saveProduct(f.admin, { ...fenix, options: fenix.options.map(o => o.id === color.id ? { ...o, values: [...o.values, { id: "blue", key: "blue", label: "Blue" }] } : o), variants: [...fenix.variants, { id: "v51u", sku: `DEV-${n}-51-U`, title: "51 mm Blue", selections: { [size.id]: v51.id, [color.id]: "blue" }, price: 1, stock: 1, status: "active" }] });
  device = await detail(fenix.id);
  const blue = device.variants.find(v => v.sku === `DEV-${n}-51-U`).id;
  assert.ok(accessoriesForVariant(device.compatibleAccessories, blue).some(a => a.publicKey === qf26.id));
  assert.equal(device.compatibleDevices.length, 0, "a device lists no supported models");
});

test("accessory page: supported models in garmin.com wording, linking to a matching device variant", async () => {
  const n = nextSerial();
  const fenix = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const other = await f.catalog.saveProduct(f.admin, deviceCommand(`${n}b`, { name: `Approach ${n}` }));
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-band`, { compatibility: { devices: [
    { productKey: fenix.id, optionValueKeys: ["51 mm", "47 mm"] },
    { productKey: other.id },
  ] } }));
  const exception = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-exc`, { compatibility: { devices: [{ productKey: fenix.id, variantSkus: [`DEV-${n}-43-B`] }] } }));

  const accessory = await detail(band.id);
  const dash = "–";
  assert.deepEqual(accessory.compatibleDevices.map(d => [d.label, d.publicKey]), [
    [`Approach ${n}`, other.id],
    [`Synthetic fēnix ${n} ${dash} 47 mm`, fenix.id],
    [`Synthetic fēnix ${n} ${dash} 51 mm`, fenix.id],
  ]);
  const whole = accessory.compatibleDevices[0], v47 = accessory.compatibleDevices[1], v51 = accessory.compatibleDevices[2];
  assert.equal(whole.sku, null, "whole-device rows link to the device page");
  assert.equal(v47.sku, `DEV-${n}-47-B`);
  assert.ok([`DEV-${n}-51-B`, `DEV-${n}-51-G`].includes(v51.sku));
  assert.deepEqual(accessory.compatibleAccessories, []);
  assert.deepEqual((await detail(exception.id)).compatibleDevices.map(d => [d.label, d.sku]), [[`Synthetic fēnix ${n} ${dash} 43 mm, Black`, `DEV-${n}-43-B`]]);
  // Unpublishing the device removes it from the list.
  await f.q("UPDATE products SET status='draft' WHERE public_key=$1", [other.id]);
  assert.deepEqual((await detail(band.id)).compatibleDevices.map(d => d.publicKey), [fenix.id, fenix.id]);
});

test("breadcrumbs follow the primary category path", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-bc`, { categories: [{ key: "watch-series/forerunner" }, { key: "sports-fitness/running-smartwatches", primary: true }] }));
  assert.deepEqual((await detail(watch.id)).breadcrumb, [{ name: "Smartwatches", slug: "wearables-smartwatches" }, { name: "Running", slug: "sports-fitness/running-smartwatches" }]);
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-band`, { categories: [{ key: "bands/quickfit-26-mm", primary: true }] }));
  assert.deepEqual((await detail(band.id)).breadcrumb, [{ name: "Bands", slug: "bands" }], "hidden groups have no page, so no crumb");
  const loose = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-loose`));
  assert.deepEqual((await detail(loose.id)).breadcrumb, []);
});
