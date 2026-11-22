// M4.3/M4.6 pure logic: garmin.com case-size and price buckets, facet counts/filters/sorts and the
// product-page accessory tab grouping.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCESSORY_TAB_ORDER, accessoriesForVariant, accessoryTabs, activityLabel, caseMillimetres, caseSizeBucket, computeFacets,
  emptySelection, matchesSelection, parseSort, priceBucket, seriesValue, sortProducts,
} from "../../src/lib/catalog-facets.ts";
import { sizeBucketFromLabel } from "../../src/lib/cms/product-variants.js";
import fs from "node:fs";
import { caseSizeFilters } from "../../src/lib/catalog-constants.ts";

test("case size buckets follow garmin.com: Small 35–43, Medium 44–49, Large ≥ 50 mm", () => {
  const cases = { "35 mm": "Small", "41 mm": "Small", "43 mm": "Small", "43.5 mm": "Small", "44mm": "Medium", "45 MM": "Medium", "47 mm": "Medium", "49 mm": "Medium", "50 mm": "Large", "51 mm": "Large", "fēnix 8 – 51 mm": "Large" };
  for (const [label, bucket] of Object.entries(cases)) assert.equal(caseSizeBucket(label), bucket, label);
  for (const label of ["S/M", "Large", "", "mm"]) assert.equal(caseSizeBucket(label), undefined, label);
  assert.equal(caseMillimetres("42,5 mm"), 42.5);
  // The legacy editor's bucket (data.json caseSize) agrees with the storefront facet.
  for (const label of ["42 mm", "43 mm", "44 mm", "47 mm", "49 mm", "50 mm", "51 mm"]) assert.equal(sizeBucketFromLabel(label), caseSizeBucket(label), label);
  // The rail's labels are messages (CatalogueGrid.caseSizes.*); English matches garmin.com's buckets.
  const en = JSON.parse(fs.readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"));
  assert.deepEqual(caseSizeFilters.map(c => c.labelKey.split(".").reduce((node, part) => node[part], en)), ["Small (35 to 43 mm)", "Medium (44 to 49 mm)", "Large (≥ 50 mm)"]);
});

test("price buckets in KZT minor units, labels and keys", () => {
  assert.equal(priceBucket("2499500"), "0-100000");
  assert.equal(priceBucket("9999999"), "0-100000");
  assert.equal(priceBucket("10000000"), "100000-250000");
  assert.equal(priceBucket("34999500"), "250000-500000");
  assert.equal(priceBucket("74999999"), "500000-750000");
  assert.equal(priceBucket("120000000"), "750000-");
  assert.equal(activityLabel("tactical-training"), "Tactical training");
  assert.equal(activityLabel("paddle-sports"), "Paddle sports");
  assert.equal(seriesValue("fēnix®"), "fenix");
  assert.equal(seriesValue("vívoactive"), "vivoactive");
  assert.equal(parseSort("price-desc"), "price-desc");
  assert.equal(parseSort("newest"), "featured");
});

const product = (key, extra = {}) => ({ key, name: key, featured: false, createdKey: "2026-01-01T00:00:00.000000Z", series: [], activities: [], level: null, variants: [{ amountMinor: "1000000", available: true, caseSize: null }], ...extra });

test("facets: OR within a facet, AND across, per-variant matching, hidden empty options, ordered", () => {
  const products = [
    product("a", { series: [{ value: "fenix", label: "fēnix" }], activities: ["running", "hiking"], level: "Premium", variants: [{ amountMinor: "30000000", available: false, caseSize: "Large" }, { amountMinor: "28000000", available: true, caseSize: "Small" }] }),
    product("b", { series: [{ value: "forerunner", label: "Forerunner" }], activities: ["running"], level: "Entry", variants: [{ amountMinor: "15000000", available: true, caseSize: "Medium" }] }),
    product("c", { activities: ["swimming"], variants: [{ amountMinor: "2000000", available: false, caseSize: null }] }),
  ];
  const sel = { ...emptySelection(), caseSizes: ["Large"], inStock: true };
  assert.equal(matchesSelection(products[0], sel), false, "the Large variant is sold out; the in-stock one is Small");
  assert.equal(matchesSelection(products[0], { ...sel, caseSizes: ["Small"] }), true);
  const facets = computeFacets(products, { ...emptySelection(), activities: ["running"] });
  const get = key => facets.find(f => f.key === key);
  assert.deepEqual(get("activities").options.map(o => [o.value, o.label, o.count, o.checked]), [["hiking", "Hiking", 1, false], ["running", "Running", 2, true], ["swimming", "Swimming", 1, false]]);
  assert.deepEqual(get("caseSizes").options.map(o => [o.value, o.count]), [["Small", 1], ["Medium", 1], ["Large", 1]]);
  assert.deepEqual(get("series").options.map(o => o.label), ["fēnix", "Forerunner"]);
  assert.deepEqual(get("prices").options.map(o => [o.value, o.count]), [["100000-250000", 1], ["250000-500000", 1]], "zero-count buckets are hidden");
  assert.deepEqual(get("availability").options, [{ value: "in-stock", label: "In stock", count: 2, checked: false }]);
  assert.deepEqual(computeFacets([], emptySelection()), []);
  // Sorts: price uses the offer a card shows (in stock first, then cheapest).
  assert.deepEqual(sortProducts(products, "price-asc").map(p => p.key), ["c", "b", "a"], "a shows its in-stock 280,000 offer, not the sold-out 300,000 one");
  assert.deepEqual(sortProducts(products, "price-desc").map(p => p.key), ["a", "b", "c"]);
  assert.deepEqual(sortProducts([product("z", { featured: true }), product("y", { createdKey: "2026-02-01T00:00:00.000000Z" }), product("x")], "featured").map(p => p.key), ["z", "y", "x"]);
});

test("accessory tabs: garmin.com order, empty tabs hidden, unknown categories before View All, ungrouped only in View All", () => {
  assert.deepEqual(ACCESSORY_TAB_ORDER.map(t => t.label), ["Apps", "Service Plans", "Bands", "Dive Bands", "MARQ Straps & Bracelets", "Cables & Chargers", "Cycling Accessories", "Heart Rate Monitors", "Sensors"]);
  const a = (id, group, variantIds = null) => ({ id, group, variantIds });
  const items = [a("sensor", { slug: "sensors", name: "Sensors" }), a("band", { slug: "bands", name: "Bands" }, ["v51"]), a("loose", null), a("strap", { slug: "marq-straps-bracelets", name: "MARQ Straps & Bracelets" }), a("custom", { slug: "screen-protectors", name: "Screen Protectors" }), a("plan", { slug: "subscription-plans", name: "Service Plans" })];
  const tabs = accessoryTabs(items);
  assert.deepEqual(tabs.map(t => t.label), ["Service Plans", "Bands", "MARQ Straps & Bracelets", "Sensors", "Screen Protectors", "View All"]);
  assert.deepEqual(tabs.at(-1).items.map(i => i.id), ["plan", "band", "strap", "sensor", "custom", "loose"]);
  assert.deepEqual(accessoriesForVariant(items, "v43").map(i => i.id), ["sensor", "loose", "strap", "custom", "plan"]);
  assert.deepEqual(accessoryTabs([]).map(t => t.label), ["View All"]);
});
