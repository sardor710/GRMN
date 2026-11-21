// M6.3/M6.4: pure mapping between the compatibility UI and the admin command shape (decision D-C1),
// readback sentences, grouping by accessory category and the QuickFit hint.
import test from "node:test";
import assert from "node:assert/strict";
import {
  accessoryRootFor, addAccessories, buildDeviceLink, compatibilityCommand, compatibilityFromPayload, copyDeviceLinks, describeAccessoryScope,
  describeDeviceLink, deviceLinksToCommand, deviceSummaryFromPayload, fineAccessoryLinks, groupAccessories, isAccessoryProduct, mergeDeviceLink,
  quickFitWidth, removeAccessory, removeDeviceLine, suggestForWidth, accessoryLinksToCommand,
} from "../../src/components/admin/product-editor/compatibility-state.ts";
import { blankForm, buildCommand, formFromPayload } from "../../src/components/admin/product-editor/editor-state.ts";
import { taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";

const taxonomy = taxonomySeed.map(({ key, name, kind, parentKey }, position) => ({ key, name, kind, slug: key, parentKey, position, navVisible: true }));

// What GET returns for a fēnix 9 Pro-like device (trimmed): Case size 43/47/51 × colour, one archived variant.
const devicePayload = () => ({
  id: "garmin-1953453", name: "fēnix 9 Pro", thumbnail: "/uploads/f9.jpg", primaryCategory: { key: "outdoor-recreation/adventure-smartwatches", name: "Adventure" },
  options: [
    { id: "o-size", key: "case-size", name: "Case Size", values: [{ id: "v43", key: "43 mm", label: "43 mm" }, { id: "v47", key: "47 mm", label: "47 mm" }, { id: "v51", key: "51 mm", label: "51 mm" }] },
    { id: "o-color", key: "color", name: "Color", values: [{ id: "black", key: "black", label: "Black" }, { id: "gray", key: "gray", label: "Gray" }] },
    { id: "o-empty", key: "x", name: "Empty", values: [] },
  ],
  variants: [
    { sku: "F-43-B", title: "43 Black", selections: { "o-size": "v43", "o-color": "black" }, status: "active" },
    { sku: "F-47-B", title: "47 Black", selections: { "o-size": "v47", "o-color": "black" }, status: "active" },
    { sku: "F-51-B", title: "51 Black", selections: { "o-size": "v51", "o-color": "black" }, status: "active" },
    { sku: "F-51-G", title: "51 Gray", selections: { "o-size": "v51", "o-color": "gray" }, status: "draft" },
    { sku: "F-51-X", title: "old", selections: { "o-size": "v51", "o-color": "gray" }, status: "archived" },
  ],
});

// An accessory's GET compatibility: fēnix 9 Pro 51 mm + Forerunner 970 whole device.
const bandPayload = () => ({
  id: "band-26", version: 4, name: "QuickFit 26 band",
  categories: [{ key: "bands/quickfit-26-mm", primary: true }],
  compatibility: {
    devices: [{ productKey: "garmin-1953453", optionValueKeys: ["v51"], variantSkus: [] }, { productKey: "fr-970", optionValueKeys: [], variantSkus: [] }],
    accessories: [],
    compatibleDevices: [
      { productKey: "garmin-1953453", name: "fēnix 9 Pro", status: "draft", thumbnail: "/uploads/f9.jpg", primaryCategoryKey: "outdoor-recreation/adventure-smartwatches", accessoryVariantSku: null, wholeDevice: false, deviceVariantCount: 4, optionValues: [{ id: "v51", key: "51 mm", label: "51 mm", optionKey: "case-size", optionName: "Case Size", variantCount: 2 }], variants: [] },
      { productKey: "fr-970", name: "Forerunner 970", status: "published", thumbnail: null, primaryCategoryKey: "sports-fitness/running-smartwatches", accessoryVariantSku: null, wholeDevice: true, deviceVariantCount: 1, optionValues: [], variants: [] },
    ],
    compatibleAccessories: [],
  },
});

// A device's GET compatibility: one whole-device QuickFit 22 band + a 51 mm-only band made on the accessory.
const watchCompat = () => ({
  devices: [], accessories: [{ productKey: "band-22" }],
  compatibleDevices: [],
  compatibleAccessories: [
    { productKey: "band-22", name: "QuickFit 22 band", status: "published", thumbnail: null, primaryCategoryKey: "bands/quickfit-22-mm", primaryCategoryName: "QuickFit 22 mm", accessoryVariantSku: null, scope: "device", optionValue: null, variantSku: null, appliesToVariantIds: ["a", "b"] },
    { productKey: "band-26", name: "QuickFit 26 band", status: "published", thumbnail: null, primaryCategoryKey: "bands/quickfit-26-mm", primaryCategoryName: "QuickFit 26 mm", accessoryVariantSku: null, scope: "optionValue", optionValue: { id: "v51", key: "51 mm", label: "51 mm", optionKey: "case-size" }, variantSku: null, appliesToVariantIds: ["c"] },
    { productKey: "hrm", name: "HRM 600", status: "published", thumbnail: null, primaryCategoryKey: "heart-rate-monitors", primaryCategoryName: "Heart Rate Monitors", accessoryVariantSku: null, scope: "variant", optionValue: null, variantSku: "F-51-B", appliesToVariantIds: ["c"] },
  ],
});

test("GET → model pairs commands with their views and reads back as garmin.com sentences", () => {
  const model = compatibilityFromPayload(bandPayload());
  assert.deepEqual(model.devices.map(link => describeDeviceLink(link).map(line => line.text)), [["fēnix 9 Pro – 51 mm (all 2 variants)"], ["Forerunner 970 (all variants)"]]);
  assert.deepEqual(deviceLinksToCommand(model.devices), bandPayload().compatibility.devices, "model → command is lossless");
  const variantLink = { ...model.devices[0], optionValues: [], variants: [{ sku: "F-51-B", title: null }], accessoryVariantSku: "B-26-BLK" };
  assert.deepEqual(describeDeviceLink(variantLink).map(line => line.text), ["fēnix 9 Pro – SKU F-51-B (1 variant) · only this accessory's SKU B-26-BLK"]);
  assert.deepEqual(describeDeviceLink({ ...model.devices[1], deviceVariantCount: 14 })[0].text, "Forerunner 970 (all 14 variants)");
  // Junk never throws; unknown value ids fall back to the id.
  assert.deepEqual(compatibilityFromPayload({ compatibility: { devices: [null, { productKey: "" }, { productKey: "x", optionValueKeys: ["zz"] }], compatibleDevices: [{ x: 1 }] } }).devices.map(d => d.optionValues[0].label), ["zz"]);
  assert.deepEqual(compatibilityFromPayload({}), { devices: [], accessories: [] });
});

test("save command: an untouched side is GET's exact value; a changed side is replaced, the other kept", () => {
  const base = bandPayload();
  const form = formFromPayload(base);
  assert.deepEqual(buildCommand(base, form, false).compatibility, base.compatibility, "unchanged round trip");
  const removed = { ...form, compatibility: { ...form.compatibility, devices: removeDeviceLine(form.compatibility.devices, 1, { kind: "whole" }) } };
  const command = buildCommand(base, removed, false).compatibility;
  assert.deepEqual(command.devices, [{ productKey: "garmin-1953453", optionValueKeys: ["v51"], variantSkus: [] }]);
  assert.equal(command.accessories, base.compatibility.accessories);
  assert.equal(command.compatibleDevices, base.compatibility.compatibleDevices, "read-only echoes ride along (ignored by the server)");
  // A new product with nothing linked sends no compatibility; with links it sends only the changed side.
  assert.equal(compatibilityCommand({}, { devices: [], accessories: [] }), undefined);
  assert.equal(buildCommand({}, { ...blankForm(), name: "x", sku: "x", price: 1 }, true).compatibility, undefined);
  const withDevice = { ...blankForm(), name: "x", sku: "x", price: 1, compatibility: { devices: compatibilityFromPayload(base).devices, accessories: [] } };
  assert.deepEqual(Object.keys(buildCommand({}, withDevice, true).compatibility), ["devices"]);
});

test("device picker: option values with variant counts; none = whole device; one row per value; SKU exceptions", () => {
  const device = deviceSummaryFromPayload(devicePayload());
  assert.equal(device.variantCount, 4, "archived variants are not counted");
  assert.deepEqual(device.options.map(o => [o.name, o.values.map(v => `${v.label}:${v.variantCount}`)]), [["Case Size", ["43 mm:1", "47 mm:1", "51 mm:2"]], ["Color", ["Black:3", "Gray:1"]]]);
  const whole = buildDeviceLink(device, {});
  assert.deepEqual(deviceLinksToCommand([whole]), [{ productKey: "garmin-1953453", optionValueKeys: [], variantSkus: [] }]);
  assert.equal(describeDeviceLink(whole)[0].text, "fēnix 9 Pro (all 4 variants)");
  const two = buildDeviceLink(device, { valueIds: ["v51", "v47"], variantSkus: ["f-43-b"], accessoryVariantSku: "B-1" });
  assert.deepEqual(deviceLinksToCommand([two]), [{ productKey: "garmin-1953453", optionValueKeys: ["v47", "v51"], variantSkus: ["F-43-B"], accessoryVariantSku: "B-1" }]);
  assert.equal(describeDeviceLink(two).length, 3, "one sentence per stored row");
});

test("merging links: whole replaces finer, finer unions, whole stays whole; removing the last line drops the link", () => {
  const device = deviceSummaryFromPayload(devicePayload());
  let { devices, outcome } = mergeDeviceLink([], buildDeviceLink(device, { valueIds: ["v51"] }));
  assert.equal(outcome, "added");
  ({ devices, outcome } = mergeDeviceLink(devices, buildDeviceLink(device, { valueIds: ["v47", "v51"] })));
  assert.deepEqual([outcome, devices[0].optionValues.map(v => v.id)], ["merged", ["v51", "v47"]]);
  assert.equal(mergeDeviceLink(devices, buildDeviceLink(device, { valueIds: ["v47"] })).outcome, "unchanged");
  assert.equal(mergeDeviceLink(devices, buildDeviceLink(device, { valueIds: ["v47"], accessoryVariantSku: "B-1" })).outcome, "added", "another accessory SKU is another link");
  ({ devices, outcome } = mergeDeviceLink(devices, buildDeviceLink(device, {})));
  assert.deepEqual([outcome, devices.length, devices[0].optionValues.length], ["replaced", 1, 0]);
  assert.equal(mergeDeviceLink(devices, buildDeviceLink(device, { valueIds: ["v43"] })).outcome, "alreadyCovered");
  const finer = mergeDeviceLink([], buildDeviceLink(device, { valueIds: ["v47", "v51"] })).devices;
  const once = removeDeviceLine(finer, 0, { kind: "value", id: "v47" });
  assert.deepEqual(once[0].optionValues.map(v => v.id), ["v51"]);
  assert.deepEqual(removeDeviceLine(once, 0, { kind: "value", id: "v51" }), [], "never widens to all variants");
});

test("copy from another accessory: imports its links without its own SKU narrowing, skips self and duplicates", () => {
  const source = compatibilityFromPayload(bandPayload()).devices.map((link, i) => (i === 0 ? { ...link, accessoryVariantSku: "OTHER-SKU" } : link));
  const own = [compatibilityFromPayload(bandPayload()).devices[1]];
  const result = copyDeviceLinks(own, source, "garmin-1953453");
  assert.deepEqual([result.added, result.merged, result.skipped, result.devices.length], [0, 0, 2, 1]);
  const all = copyDeviceLinks([], source);
  assert.deepEqual([all.added, all.devices[0].accessoryVariantSku], [2, null]);
});

test("device side: whole-group add, finer accessory-side links read-only, grouped in garmin.com order", () => {
  const payload = { compatibility: watchCompat() };
  const model = compatibilityFromPayload(payload);
  assert.deepEqual(model.accessories.map(a => [a.productKey, a.categoryKey]), [["band-22", "bands/quickfit-22-mm"]]);
  const group = [
    { id: "band-22", name: "QuickFit 22 band", thumbnail: null, primaryCategory: { key: "bands/quickfit-22-mm", name: "QuickFit 22 mm" }, status: "published" },
    { id: "band-22b", name: "QuickFit 22 leather", thumbnail: null, primaryCategory: { key: "bands/quickfit-22-mm", name: "QuickFit 22 mm" }, status: "draft" },
    { id: "self", name: "Me", thumbnail: null, primaryCategory: null, status: "draft" },
  ];
  const { accessories, added } = addAccessories(model.accessories, group, "self");
  assert.equal(added, 1);
  assert.deepEqual(accessoryLinksToCommand(accessories), [{ productKey: "band-22" }, { productKey: "band-22b" }]);
  const fine = fineAccessoryLinks(payload);
  assert.deepEqual(fine.map(f => [f.productKey, describeAccessoryScope(f)]), [["band-26", "51 mm only"], ["hrm", "SKU F-51-B only"]]);
  const groups = groupAccessories(accessories, fine, taxonomy);
  assert.deepEqual(groups.map(g => [g.name, g.rows.map(r => `${r.name}${r.editable ? "" : " (read-only)"}: ${r.scopeText}`)]), [
    ["Bands", ["QuickFit 22 band: All variants", "QuickFit 22 leather: All variants", "QuickFit 26 band (read-only): 51 mm only"]],
    ["Heart Rate Monitors", ["HRM 600 (read-only): SKU F-51-B only"]],
  ]);
  // Adding the 26 mm band to the whole device hides its 51 mm row (the server collapses it on save).
  const covering = addAccessories(accessories, [{ id: "band-26", name: "QuickFit 26 band", thumbnail: null, primaryCategory: { key: "bands/quickfit-26-mm", name: "QuickFit 26 mm" }, status: "published" }]).accessories;
  assert.deepEqual(groupAccessories(covering, fine, taxonomy)[0].rows.filter(r => r.productKey === "band-26").map(r => r.editable), [true]);
  assert.deepEqual(accessoryLinksToCommand(removeAccessory(covering, "band-22")), [{ productKey: "band-22b" }, { productKey: "band-26" }]);
  assert.equal(groupAccessories([{ productKey: "x", name: "X", thumbnail: null, categoryKey: null, categoryName: null, status: null, accessoryVariantSku: null }], [], taxonomy)[0].name, "Other");
});

test("accessory detection and QuickFit hint from ACCESSORY_TAXONOMY.md", () => {
  assert.equal(accessoryRootFor("bands/quickfit-22-mm", taxonomy).name, "Bands");
  assert.equal(accessoryRootFor("sports-fitness/running-smartwatches", taxonomy), null);
  assert.equal(isAccessoryProduct([{ key: "bands/quickfit-26-mm" }], taxonomy), true);
  assert.equal(isAccessoryProduct([{ key: "watch-series/fenix" }, { key: "wearables-smartwatches" }], taxonomy), false);
  assert.equal(quickFitWidth([{ key: "bands" }, { key: "bands/quickfit-26-mm" }]), 26);
  assert.equal(quickFitWidth([{ key: "bands/quick-release-22-mm" }]), null);
  const device = deviceSummaryFromPayload(devicePayload());
  assert.deepEqual(suggestForWidth(26, device), { whole: false, valueIds: ["v51"], labels: ["51 mm"], text: "QuickFit 26 mm usually fits the 51 mm case" });
  assert.deepEqual(suggestForWidth(20, device).labels, ["43 mm"]);
  assert.deepEqual(suggestForWidth(22, device).labels, ["47 mm"]);
  assert.equal(suggestForWidth(22, { name: "MARQ Adventurer (Gen 3)", options: [] }).whole, true);
  assert.equal(suggestForWidth(26, { name: "Enduro 3", options: [] }).whole, true);
  assert.equal(suggestForWidth(26, { name: "Forerunner 970", options: [] }), null);
});
