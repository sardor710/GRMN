// M6.4: the compatibility editor's pure helpers (GET → UI model → command) driven against the real catalog
// service on a disposable database: accessory-side option-value links, device-side whole-group add,
// consistent readbacks from both editors, lossless round trips, and no clobbering across editors (D-C1).
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { buildCommand, formFromPayload } from "../../src/components/admin/product-editor/editor-state.ts";
import {
  addAccessories, buildDeviceLink, compatibilityFromPayload, copyDeviceLinks, describeDeviceLink, deviceSummaryFromPayload, fineAccessoryLinks,
  groupAccessories, mergeDeviceLink, quickFitWidth, removeAccessory, suggestForWidth,
} from "../../src/components/admin/product-editor/compatibility-state.ts";
import { taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";

let f;
before(async () => { f = await startCatalogFixture(); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const taxonomy = taxonomySeed.map(({ key, name, kind, parentKey }, position) => ({ key, name, kind, slug: key, parentKey, position, navVisible: true }));
const links = async () => (await f.q(`SELECT a.public_key AS accessory,d.public_key AS device,ov.key AS value,dv.sku AS variant FROM product_compatibility pc
  JOIN products a ON a.id=pc.accessory_product_id JOIN products d ON d.id=pc.device_product_id
  LEFT JOIN option_values ov ON ov.id=pc.device_option_value_id LEFT JOIN product_variants dv ON dv.id=pc.device_variant_id
  ORDER BY a.public_key,d.public_key,ov.key NULLS FIRST,dv.sku NULLS FIRST`)).rows;
const get = key => f.catalog.getProduct(f.admin, key);
/** What the editor does on Save: GET payload + edited form → command → PUT /products/:key (the route adds id = key). */
const put = (key, command) => f.catalog.saveProduct(f.admin, { ...command, id: key });
const saveForm = async (payload, change = form => form) => put(payload.id, buildCommand(payload, change(formFromPayload(payload)), false));
const sentences = payload => compatibilityFromPayload(payload).devices.flatMap(link => describeDeviceLink(link).map(line => line.text));

test("band side links 51 mm, watch side adds the QuickFit 22 group; both editors read back the same facts", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n, { categories: [{ key: "watch-series/fenix", primary: true }] }));
  const band26 = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-26`, { name: `QuickFit 26 band ${n}`, categories: [{ key: "bands/quickfit-26-mm", primary: true }] }));
  const band22a = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-22a`, { name: `QuickFit 22 silicone ${n}`, categories: [{ key: "bands/quickfit-22-mm", primary: true }] }));
  const band22b = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-22b`, { name: `QuickFit 22 leather ${n}`, categories: [{ key: "bands/quickfit-22-mm", primary: true }] }));

  // Accessory side: open the band, pick the watch, take the QuickFit 26 suggestion (51 mm), save.
  let bandPayload = await get(band26.id);
  const device = deviceSummaryFromPayload(await get(watch.id));
  const suggestion = suggestForWidth(quickFitWidth(formFromPayload(bandPayload).categories), device);
  assert.deepEqual(suggestion.labels, ["51 mm"]);
  bandPayload = await saveForm(bandPayload, form => ({ ...form, compatibility: { ...form.compatibility, devices: mergeDeviceLink(form.compatibility.devices, buildDeviceLink(device, { valueIds: suggestion.valueIds })).devices } }));
  assert.deepEqual((await links()).filter(row => row.device === watch.id), [{ accessory: band26.id, device: watch.id, value: "51 mm", variant: null }]);
  assert.deepEqual(sentences(bandPayload), [`Synthetic fēnix ${n} – 51 mm (all 2 variants)`]);

  // Device side: open the watch, add every product of the QuickFit 22 group (picker by category), save.
  let watchPayload = await get(watch.id);
  const group = await f.catalog.picker(f.admin, { category: "bands/quickfit-22-mm", exclude: watch.id, limit: 100 });
  assert.deepEqual(group.items.map(row => row.id).sort(), [band22a.id, band22b.id].sort());
  watchPayload = await saveForm(watchPayload, form => ({ ...form, compatibility: { ...form.compatibility, accessories: addAccessories(form.compatibility.accessories, group.items, watch.id).accessories } }));
  assert.deepEqual((await links()).filter(row => row.device === watch.id), [
    { accessory: band22a.id, device: watch.id, value: null, variant: null },
    { accessory: band22b.id, device: watch.id, value: null, variant: null },
    { accessory: band26.id, device: watch.id, value: "51 mm", variant: null },
  ].sort((a, b) => a.accessory.localeCompare(b.accessory)), "the device save kept the accessory-side 51 mm row");

  // Reopen both editors: the watch groups all three under Bands, the 26 mm one read-only "51 mm only".
  watchPayload = await get(watch.id);
  const grouped = groupAccessories(formFromPayload(watchPayload).compatibility.accessories, fineAccessoryLinks(watchPayload), taxonomy);
  assert.deepEqual(grouped.map(g => [g.name, g.rows.map(r => [r.productKey, r.editable, r.scopeText]).sort()]), [["Bands", [
    [band22a.id, true, "All variants"], [band22b.id, true, "All variants"], [band26.id, false, "51 mm only"],
  ].sort()]]);
  const band22Payload = await get(band22a.id);
  assert.deepEqual(sentences(band22Payload), [`Synthetic fēnix ${n} (all 4 variants)`]);
  assert.deepEqual(sentences(await get(band26.id)), [`Synthetic fēnix ${n} – 51 mm (all 2 variants)`]);
});

test("unchanged saves from either editor are lossless; each side keeps the other's rows", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const sizeId = key => watch.options.find(o => o.key === "case-size").values.find(v => v.key === key).id;
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { categories: [{ key: "bands/quickfit-22-mm", primary: true }], compatibility: { devices: [{ productKey: watch.id, optionValueKeys: [sizeId("47 mm")], variantSkus: [`DEV-${n}-51-G`] }] } }));
  const charger = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-c`, { categories: [{ key: "cables-chargers", primary: true }] }));
  let watchPayload = await get(watch.id);
  watchPayload = await saveForm(watchPayload, form => ({ ...form, compatibility: { ...form.compatibility, accessories: addAccessories(form.compatibility.accessories, [{ id: charger.id, name: charger.name, thumbnail: null, primaryCategory: null, status: "published" }]).accessories } }));
  const before = await links();

  // Untouched compatibility: the command carries GET's exact value and nothing changes.
  for (const key of [watch.id, band.id, charger.id]) {
    const payload = await get(key);
    const command = buildCommand(payload, formFromPayload(payload), false);
    assert.deepEqual(command.compatibility, payload.compatibility, key);
    await put(key, { ...command, name: `${payload.name} (renamed)` });
  }
  assert.deepEqual(await links(), before);
  assert.deepEqual(sentences(await get(band.id)), [`Synthetic fēnix ${n} (renamed) – 47 mm (1 variant)`, `Synthetic fēnix ${n} (renamed) – SKU DEV-${n}-51-G 51 mm Gray (1 variant)`], "readbacks follow the device's current name");

  // The watch removes the charger: the band's finer rows are not the watch's to delete.
  watchPayload = await get(watch.id);
  await saveForm(watchPayload, form => ({ ...form, compatibility: { ...form.compatibility, accessories: removeAccessory(form.compatibility.accessories, charger.id) } }));
  assert.deepEqual((await links()).filter(row => row.device === watch.id).map(row => [row.accessory, row.value, row.variant]), [[band.id, null, `DEV-${n}-51-G`], [band.id, "47 mm", null]]);
});

test("a stale editor gets 409 after the other side saved; reloading and saving keeps both changes", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { categories: [{ key: "bands/quickfit-26-mm", primary: true }] }));
  const staleWatch = await get(watch.id);
  // Band editor links 51 mm while the watch editor is open.
  const device = deviceSummaryFromPayload(staleWatch);
  const value51 = device.options[0].values.find(v => v.label === "51 mm").id;
  await saveForm(await get(band.id), form => ({ ...form, compatibility: { ...form.compatibility, devices: [buildDeviceLink(device, { valueIds: [value51] })] } }));
  // The open watch editor saves an unrelated edit: refused instead of silently racing.
  await assert.rejects(saveForm(staleWatch, form => ({ ...form, name: "Stale watch" })), error => error.status === 409);
  const fresh = await get(watch.id);
  await saveForm(fresh, form => ({ ...form, name: "Fresh watch" }));
  assert.deepEqual((await links()).filter(row => row.device === watch.id).map(row => [row.accessory, row.value]), [[band.id, "51 mm"]]);
  assert.equal((await get(watch.id)).name, "Fresh watch");
});

test("copy from another accessory imports its links; whole-device from the watch replaces a finer link", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const other = await f.catalog.saveProduct(f.admin, deviceCommand(`${n}-o`));
  const source = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-s`, { categories: [{ key: "bands/quickfit-26-mm", primary: true }], compatibility: { devices: [{ productKey: watch.id, optionValueKeys: ["51 mm"] }, { productKey: other.id }] } }));
  const copyTarget = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-t`, { categories: [{ key: "bands/quickfit-26-mm", primary: true }] }));
  const sourceLinks = compatibilityFromPayload(await get(source.id)).devices;
  const saved = await saveForm(await get(copyTarget.id), form => ({ ...form, compatibility: { ...form.compatibility, devices: copyDeviceLinks(form.compatibility.devices, sourceLinks, copyTarget.id).devices } }));
  assert.deepEqual(sentences(saved), [`Synthetic fēnix ${n} – 51 mm (all 2 variants)`, `Synthetic fēnix ${n}-o (all 4 variants)`]);
  // The watch adds the copied band as a whole-device link: the 51 mm row collapses into it.
  await saveForm(await get(watch.id), form => ({ ...form, compatibility: { ...form.compatibility, accessories: addAccessories(form.compatibility.accessories, [{ id: copyTarget.id, name: copyTarget.name, thumbnail: null, primaryCategory: null, status: "published" }]).accessories } }));
  assert.deepEqual(sentences(await get(copyTarget.id)), [`Synthetic fēnix ${n} (all 4 variants)`, `Synthetic fēnix ${n}-o (all 4 variants)`]);
  assert.deepEqual((await links()).filter(row => row.accessory === source.id).length, 2, "the source accessory is untouched");
});
