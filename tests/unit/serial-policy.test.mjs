// Owner 2026-11-25 (plan T2.1): every electronic device needs a serial at packing; only non-electronic accessories
// (bands, cases, cables, chargers, mounts) and digital items don't. The name fallback for unfiled products must
// fail safe: a device is never exempted because its name mentions a band or a case.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSerial } from "../../src/server/fulfillment/serial-policy.ts";

const base = { productPolicy: null, categories: [], legacyCategories: [], name: "Product" };
const decide = input => decideSerial({ ...base, ...input });

test("an explicit 'needs serial' category wins over an unset one", () => {
  const d = decide({ categories: [{ key: "heart-rate-monitors", kind: "accessory", effective: "required" }, { key: "sports-fitness/running-smartwatches", kind: "catalog", effective: null }] });
  assert.deepEqual(d, { required: true, source: "category", detail: "heart-rate-monitors" });
});

test("a band in a watch series and a QuickFit type needs no serial", () => {
  const d = decide({ categories: [{ key: "watch-series/fenix", kind: "group", effective: null }, { key: "bands", kind: "accessory", effective: "none" }, { key: "bands/quickfit-22-mm", kind: "group", effective: "none" }] });
  assert.deepEqual(d, { required: false, source: "category", detail: "bands" });
});

test("a watch wrongly also filed under 'no serial' categories still needs a serial (real MARQ filing)", () => {
  const d = decide({ categories: [{ key: "wearables-smartwatches", kind: "catalog", effective: null }, { key: "apps", kind: "accessory", effective: "none" }, { key: "cables-chargers", kind: "accessory", effective: "none" }, { key: "watch-series/marq", kind: "group", effective: null }] });
  assert.deepEqual(d, { required: true, source: "default", detail: "wearables-smartwatches" });
});

test("a filed product whose categories are all unset needs a serial by default", () => {
  assert.deepEqual(decide({ categories: [{ key: "sports-fitness/multisport-smartwatches", kind: "catalog", effective: null }] }), { required: true, source: "default", detail: "sports-fitness/multisport-smartwatches" });
  assert.deepEqual(decide({ categories: [{ key: "watch-series/venu", kind: "group", effective: null }] }), { required: true, source: "default", detail: null });
});

test("the product setting beats every category", () => {
  assert.deepEqual(decide({ productPolicy: "none", categories: [{ key: "heart-rate-monitors", kind: "accessory", effective: "required" }] }), { required: false, source: "product", detail: null });
  assert.deepEqual(decide({ productPolicy: "required", categories: [{ key: "bands", kind: "accessory", effective: "none" }] }), { required: true, source: "product", detail: null });
});

test("an unfiled product uses its old-site category first", () => {
  assert.deepEqual(decide({ legacyCategories: [{ key: "heart-rate-monitors", kind: "accessory", effective: "required" }], name: "HRM 600 Band" }), { required: true, source: "legacy-category", detail: "heart-rate-monitors" });
  assert.deepEqual(decide({ legacyCategories: [{ key: "cables-chargers", kind: "accessory", effective: "none" }] }), { required: false, source: "legacy-category", detail: "cables-chargers" });
});

test("an unfiled accessory is exempted by a name that is about the accessory", () => {
  for (const name of ["QuickFit 22 Band", "Ремешок QuickFit 22", "Charging Cable", "Garmin Charging Clip", "Protective Case", "Screen Protector (6-pack)", "Кабель для зарядки"]) {
    assert.equal(decide({ name }).required, false, name);
    assert.equal(decide({ name }).source, "name", name);
  }
});

test("an unfiled device is never exempted by its name", () => {
  for (const name of ["fēnix 8", "vívoactive 6 with Silicone Band", "Forerunner 970 Stainless Steel Case", "Edge Mount", "ECHOMAP UHD2 fishfinder", "Approach Z82 rangefinder", "HRM 600", "Часы Venu 4 с ремешком"]) {
    assert.deepEqual(decide({ name }), { required: true, source: "default", detail: null }, name);
  }
});

test("legacy categories that are all unset fall through to the name, then the default", () => {
  assert.equal(decide({ legacyCategories: [{ key: "wearables-smartwatches", kind: "catalog", effective: null }], name: "Venu 4" }).source, "default");
});
