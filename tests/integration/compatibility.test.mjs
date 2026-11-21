// D-C1: one stored compatibility fact, written from either side without clobbering, read back as
// "compatible devices" (accessory) and "compatible accessories" (device, resolved per variant).
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";

let f;
before(async () => { f = await startCatalogFixture(); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const linkRows = async accessoryKey => (await f.q(`SELECT d.public_key AS device,ov.key AS value,dv.sku AS variant,av.sku AS accessory_sku FROM product_compatibility pc
  JOIN products a ON a.id=pc.accessory_product_id JOIN products d ON d.id=pc.device_product_id
  LEFT JOIN option_values ov ON ov.id=pc.device_option_value_id LEFT JOIN product_variants dv ON dv.id=pc.device_variant_id LEFT JOIN product_variants av ON av.id=pc.accessory_variant_id
  WHERE a.public_key=$1 ORDER BY d.public_key,ov.key NULLS FIRST,dv.sku NULLS FIRST`, [accessoryKey])).rows;
const sizeValue = (device, key) => device.options.find(o => o.key === "case-size").values.find(v => v.key === key);

test("accessory side: option-value rows resolve to exactly the variants carrying that value, including future ones", async () => {
  const n = nextSerial();
  let fenix = await f.catalog.saveProduct(f.admin, deviceCommand(n, { categories: [{ key: "watch-series/fenix", primary: true }] }));
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { categories: [{ key: "bands/quickfit-26-mm", primary: true }], compatibility: { devices: [{ productKey: fenix.id, optionValueKeys: ["51 mm"] }] } }));
  assert.deepEqual(await linkRows(band.id), [{ device: fenix.id, value: "51 mm", variant: null, accessory_sku: null }]);
  assert.equal(band.compatibility.compatibleDevices.length, 1);
  const view = band.compatibility.compatibleDevices[0];
  assert.deepEqual([view.productKey, view.wholeDevice, view.optionValues.map(v => [v.label, v.variantCount]), view.deviceVariantCount, view.primaryCategoryKey], [fenix.id, false, [["51 mm", 2]], 4, "watch-series/fenix"]);
  assert.deepEqual(band.compatibility.devices, [{ productKey: fenix.id, optionValueKeys: [sizeValue(fenix, "51 mm").id], variantSkus: [] }], "the echo uses stored value ids");
  // Device side read: per-variant resolution (51 mm variants only).
  fenix = await f.catalog.getProduct(f.admin, fenix.id);
  const accessory = fenix.compatibility.compatibleAccessories.find(a => a.productKey === band.id);
  const ids51 = fenix.variants.filter(v => v.selections[fenix.options[0].id] === sizeValue(fenix, "51 mm").id).map(v => v.id).sort();
  assert.deepEqual([accessory.scope, accessory.appliesToVariantIds.sort(), accessory.primaryCategoryKey], ["optionValue", ids51, "bands/quickfit-26-mm"]);
  assert.deepEqual(fenix.compatibility.accessories, [], "finer rows are not part of the device-side command");
  // A new 51 mm colour is covered automatically.
  const color = fenix.options.find(o => o.key === "color");
  fenix = await f.catalog.saveProduct(f.admin, { ...fenix, options: fenix.options.map(o => o.id === color.id ? { ...o, values: [...o.values, { id: "blue", key: "blue", label: "Blue" }] } : o), variants: [...fenix.variants, { id: "v51u", sku: `DEV-${n}-51-U`, title: "51 mm Blue", selections: { [fenix.options[0].id]: sizeValue(fenix, "51 mm").id, [color.id]: "blue" }, price: 1, stock: 1, status: "active" }] });
  const after = fenix.compatibility.compatibleAccessories.find(a => a.productKey === band.id);
  assert.equal(after.appliesToVariantIds.length, 3);
  assert.ok(after.appliesToVariantIds.includes(fenix.variants.find(v => v.sku === `DEV-${n}-51-U`).id));
  // Echoing the read payloads changes nothing.
  const bandAgain = await f.catalog.saveProduct(f.admin, await f.catalog.getProduct(f.admin, band.id));
  assert.deepEqual(await linkRows(band.id), [{ device: fenix.id, value: "51 mm", variant: null, accessory_sku: null }]);
  assert.equal(bandAgain.compatibility.compatibleDevices.length, 1);
});

test("both sides write without clobbering each other's rows; stale editors get 409", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const bandA = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-a`, { compatibility: { devices: [{ productKey: watch.id, optionValueKeys: ["47 mm"] }] } }));
  const bandB = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-b`));
  const staleBandB = await f.catalog.getProduct(f.admin, bandB.id);
  // Device side adds band B (fits all variants) and keeps band A's 47 mm row untouched.
  let device = await f.catalog.getProduct(f.admin, watch.id);
  assert.equal(device.version, 2, "linking from the accessory side bumped the watch's version");
  device = await f.catalog.saveProduct(f.admin, { ...device, compatibility: { ...device.compatibility, accessories: [...device.compatibility.accessories, { productKey: bandB.id }] } });
  assert.deepEqual(await linkRows(bandA.id), [{ device: watch.id, value: "47 mm", variant: null, accessory_sku: null }]);
  assert.deepEqual(await linkRows(bandB.id), [{ device: watch.id, value: null, variant: null, accessory_sku: null }]);
  // Band B's editor was opened before the link: its save would drop the row, so it must reload.
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...staleBandB, name: "Stale band B" }), e => e.status === 409);
  const freshB = await f.catalog.getProduct(f.admin, bandB.id);
  assert.deepEqual(freshB.compatibility.devices, [{ productKey: watch.id, optionValueKeys: [], variantSkus: [] }]);
  await f.catalog.saveProduct(f.admin, { ...freshB, name: "Band B renamed" });
  assert.equal((await linkRows(bandB.id)).length, 1, "a fresh echo keeps the device-side row");
  // Device side removes its whole-device links; band A's finer row survives.
  device = await f.catalog.getProduct(f.admin, watch.id);
  await f.catalog.saveProduct(f.admin, { ...device, compatibility: { accessories: [] } });
  assert.equal((await linkRows(bandB.id)).length, 0);
  assert.equal((await linkRows(bandA.id)).length, 1);
  // Accessory side owns all of its rows (including ones created from the device side).
  const a = await f.catalog.getProduct(f.admin, bandA.id);
  await f.catalog.saveProduct(f.admin, { ...a, compatibility: { devices: [] } });
  assert.equal((await linkRows(bandA.id)).length, 0);
});

test("redundant rows collapse to the covering row (whole device ⊇ option value ⊇ its variants)", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const sku51g = `DEV-${n}-51-G`;
  // Same pair listed as whole device and as 51 mm in one command: the whole-device row wins.
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { compatibility: { devices: [{ productKey: watch.id }, { productKey: watch.id, optionValueKeys: ["51 mm"], variantSkus: [sku51g] }] } }));
  assert.deepEqual(await linkRows(band.id), [{ device: watch.id, value: null, variant: null, accessory_sku: null }]);
  assert.deepEqual(band.compatibility.devices, [{ productKey: watch.id, optionValueKeys: [], variantSkus: [] }]);
  // A 51 mm row makes a 51 mm variant row redundant.
  const band2 = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-2`, { compatibility: { devices: [{ productKey: watch.id, optionValueKeys: ["51 mm"], variantSkus: [sku51g, `DEV-${n}-43-B`] }] } }));
  assert.deepEqual(await linkRows(band2.id), [{ device: watch.id, value: null, variant: `DEV-${n}-43-B`, accessory_sku: null }, { device: watch.id, value: "51 mm", variant: null, accessory_sku: null }]);
  // A whole-device row added from the device side replaces the accessory's 51 mm row for that pair.
  const device = await f.catalog.getProduct(f.admin, watch.id);
  await f.catalog.saveProduct(f.admin, { ...device, compatibility: { accessories: [...device.compatibility.accessories, { productKey: band2.id }] } });
  assert.deepEqual(await linkRows(band2.id), [{ device: watch.id, value: null, variant: null, accessory_sku: null }]);
  // An accessory-variant row is covered by a row without an accessory variant.
  const strap = await f.catalog.saveProduct(f.admin, deviceCommand(`${n}-strap`, { name: `Synthetic strap ${n}`, compatibility: { devices: [{ productKey: watch.id, accessoryVariantSku: `DEV-${n}-strap-43-B` }, { productKey: watch.id }] } }));
  assert.deepEqual(await linkRows(strap.id), [{ device: watch.id, value: null, variant: null, accessory_sku: null }]);
});

test("invalid references are rejected; removed option values and variants take their rows with them", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const band = simpleCommand(n);
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...band, compatibility: { devices: [{ productKey: "no-such-product" }] } }), e => e.status === 400 && /Unknown compatible product/.test(e.message));
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...band, compatibility: { devices: [{ productKey: watch.id, optionValueKeys: ["99 mm"] }] } }), e => e.status === 400);
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...band, compatibility: { devices: [{ productKey: watch.id, variantSkus: ["NOPE"] }] } }), e => e.status === 400);
  const saved = await f.catalog.saveProduct(f.admin, { ...band, compatibility: { devices: [{ productKey: watch.id, optionValueKeys: ["43 mm"], variantSkus: [`DEV-${n}-47-B`] }] } });
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...saved, compatibility: { devices: [{ productKey: saved.id }] } }), e => e.status === 400 && /itself/.test(e.message));
  assert.equal((await linkRows(saved.id)).length, 2);
  // The watch drops the 43 mm value (and its variant) and the 47 mm variant.
  const w = await f.catalog.getProduct(f.admin, watch.id);
  const size = w.options.find(o => o.key === "case-size");
  const kept = w.variants.filter(v => ![`DEV-${n}-43-B`, `DEV-${n}-47-B`].includes(v.sku)).map(v => v.isDefault ? v : v);
  kept[0] = { ...kept[0], isDefault: true };
  await f.catalog.saveProduct(f.admin, { ...w, options: w.options.map(o => o.id === size.id ? { ...o, values: o.values.filter(v => v.key !== "43 mm") } : o), variants: kept });
  assert.deepEqual(await linkRows(saved.id), [], "rows scoped to the removed value and variant are gone");
});

// M9.3 review finding 1: an archived variant must never make the product unsavable. Archiving deletes the
// rows scoped to that variant (the other product gets version+1), reads skip archived SKUs, and a stale
// command that still names an archived SKU drops that link instead of failing with 400.
test("archiving an accessory variant with a narrowed link drops the link; both products keep saving", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const strapSku = `DEV-${n}-strap-43-B`;
  let strap = await f.catalog.saveProduct(f.admin, deviceCommand(`${n}-strap`, { name: `Synthetic strap ${n}`, compatibility: { devices: [{ productKey: watch.id, accessoryVariantSku: strapSku }] } }));
  assert.deepEqual(await linkRows(strap.id), [{ device: watch.id, value: null, variant: null, accessory_sku: strapSku }]);
  const staleLinks = strap.compatibility.devices;
  const watchVersion = (await f.catalog.getProduct(f.admin, watch.id)).version;
  // Archive the narrowed strap variant from the editor (full save, the variant stays in the list as archived).
  const variants = strap.variants.map(v => v.sku === strapSku ? { ...v, status: "archived", isDefault: false } : v.sku === `DEV-${n}-strap-47-B` ? { ...v, isDefault: true } : v);
  strap = await f.catalog.saveProduct(f.admin, { ...strap, variants });
  assert.deepEqual(await linkRows(strap.id), [], "the link scoped to the archived accessory variant is gone");
  assert.deepEqual(strap.compatibility.devices, []);
  assert.equal((await f.catalog.getProduct(f.admin, watch.id)).version, watchVersion + 1, "the watch's visible compatibility changed: version+1");
  // The editor echo saves; a stale editor command naming the archived SKU drops the link (no 400, no widening).
  strap = await f.catalog.saveProduct(f.admin, await f.catalog.getProduct(f.admin, strap.id));
  strap = await f.catalog.saveProduct(f.admin, { ...strap, compatibility: { devices: staleLinks } });
  assert.deepEqual(await linkRows(strap.id), []);
  // The device side may also echo a link to an archived accessory SKU: dropped, never rejected.
  const device = await f.catalog.getProduct(f.admin, watch.id);
  await f.catalog.saveProduct(f.admin, { ...device, compatibility: { accessories: [{ productKey: strap.id, accessoryVariantSku: strapSku }] } });
  assert.deepEqual(await linkRows(strap.id), []);
  // Unknown SKUs are still rejected.
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...(await f.catalog.getProduct(f.admin, strap.id)), compatibility: { devices: [{ productKey: watch.id, accessoryVariantSku: "NO-SUCH-SKU" }] } }), e => e.status === 400);
});

test("archiving a device variant (quick edit) drops variant-scoped links; accessories still save", async () => {
  const n = nextSerial();
  let watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const sku51g = `DEV-${n}-51-G`, sku47b = `DEV-${n}-47-B`;
  let band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { compatibility: { devices: [{ productKey: watch.id, variantSkus: [sku51g] }] } }));
  const other = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-o`, { compatibility: { devices: [{ productKey: watch.id, variantSkus: [sku51g, sku47b] }] } }));
  const staleBand = band.compatibility.devices;
  watch = await f.catalog.getProduct(f.admin, watch.id);
  const target = watch.variants.find(v => v.sku === sku51g);
  await f.catalog.quickEditVariant(f.admin, target.id, { version: watch.version, status: "archived" });
  assert.deepEqual(await linkRows(band.id), [], "the only link pointed at the archived device variant");
  assert.deepEqual(await linkRows(other.id), [{ device: watch.id, value: null, variant: sku47b, accessory_sku: null }]);
  const fresh = await f.catalog.getProduct(f.admin, band.id);
  assert.equal(fresh.version, band.version + 1, "the accessory's visible compatibility changed: version+1");
  band = await f.catalog.saveProduct(f.admin, fresh);
  // A stale command whose only scope is the archived SKU drops the item instead of widening it to the whole device.
  band = await f.catalog.saveProduct(f.admin, { ...band, compatibility: { devices: staleBand } });
  assert.deepEqual(await linkRows(band.id), []);
  const otherFresh = await f.catalog.getProduct(f.admin, other.id);
  await f.catalog.saveProduct(f.admin, { ...otherFresh, compatibility: { devices: [{ productKey: watch.id, variantSkus: [sku51g, sku47b] }] } });
  assert.deepEqual(await linkRows(other.id), [{ device: watch.id, value: null, variant: sku47b, accessory_sku: null }]);
});

test("rows left pointing at an archived variant (older data) are not read back and do not block saving", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const sku51g = `DEV-${n}-51-G`;
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { compatibility: { devices: [{ productKey: watch.id, variantSkus: [sku51g] }, { productKey: watch.id, optionValueKeys: ["43 mm"] }] } }));
  await f.q("UPDATE product_variants SET status='archived',is_default=false WHERE sku=$1", [sku51g]);
  const payload = await f.catalog.getProduct(f.admin, band.id);
  assert.deepEqual(payload.compatibility.devices.map(d => [d.optionValueKeys.length, d.variantSkus]), [[1, []]]);
  assert.deepEqual(payload.compatibility.compatibleDevices.flatMap(d => d.variants), []);
  const device = await f.catalog.getProduct(f.admin, watch.id);
  assert.deepEqual(device.compatibility.compatibleAccessories.map(a => a.scope), ["optionValue"]);
  await f.catalog.saveProduct(f.admin, payload);
  assert.deepEqual((await linkRows(band.id)).map(r => [r.value, r.variant]), [["43 mm", null]]);
});
