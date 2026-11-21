import test from "node:test";
import assert from "node:assert/strict";
import { taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";
import { matchLegacyCategories, normalizeLabel, SMARTWATCHES_KEY } from "../../src/server/catalog/category-match.ts";

const nodes = taxonomySeed.map(({ key, name, kind, parentKey }) => ({ key, name, kind, parentKey }));
const match = (product) => matchLegacyCategories(nodes, product);

test("normalizeLabel strips diacritics, symbols and ampersands", () => {
  assert.equal(normalizeLabel("fēnix 9"), "fenix9");
  assert.equal(normalizeLabel("Diving & Tactical"), "divingandtactical");
  assert.equal(normalizeLabel("CIRQA™ Smart Band"), "cirqasmartband");
});

test("legacy subcategory aliases become the primary category", () => {
  const forerunner = match({ category: "Sports & Fitness", subCategory: "Running GPS", family: "Forerunner" });
  assert.equal(forerunner.primaryKey, "sports-fitness/running-smartwatches");
  assert.ok(forerunner.keys.includes("watch-series/forerunner"));
  // Running already sits under Smartwatches, so Smartwatches is not added again.
  assert.ok(!forerunner.keys.includes(SMARTWATCHES_KEY));
});

test("exact taxonomy names match without an alias", () => {
  assert.equal(match({ category: "Marine", subCategory: "Chartplotters & Fishfinders" }).primaryKey, "marine/chartplotters");
});

test("family picks the longest series prefix and diacritics do not matter", () => {
  const marq = match({ category: "Sports & Fitness", subCategory: "Luxury Smartwatches", family: "MARQ Adventurer (Gen 3)" });
  assert.equal(marq.primaryKey, "wearables-smartwatches/marq-luxury-watch-collection");
  assert.ok(marq.keys.includes("watch-series/marq"));
  const fenix = match({ category: "Outdoor Recreation", subCategory: "Adventure Watches", family: "fēnix 9" });
  assert.ok(fenix.keys.includes("watch-series/fenix"));
});

test("a watch outside the Smartwatches tree is also listed under Smartwatches", () => {
  const instinct = match({ category: "Outdoor Recreation", subCategory: "Diving & Tactical", family: "Instinct" });
  assert.equal(instinct.primaryKey, "outdoor-recreation/sportsman-and-tactical-devices");
  assert.ok(instinct.keys.includes(SMARTWATCHES_KEY));
});

test("unknown labels without a family stay unassigned and are reported", () => {
  const result = match({ category: "Mystery", subCategory: "Unknown Thing" });
  assert.equal(result.primaryKey, null);
  assert.deepEqual(result.keys, []);
  assert.deepEqual(result.unmatched, ["Unknown Thing", "Mystery"]);
});

test("every product in the committed data.json gets a primary category", async () => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(new URL("../../src/lib/cms/data.json", import.meta.url), "utf8"));
  const missing = data.products.filter((p) => !match(p).primaryKey).map((p) => `${p.id}: ${p.category} / ${p.subCategory}`);
  assert.deepEqual(missing, []);
});
