// Task 2.3: the per-variant content editor's pure helpers.
import test from "node:test";
import assert from "node:assert/strict";
import { copyProductBlock, dropVariantTranslation, ownsBlock, unchangedFromProduct, withoutBlock } from "../../src/lib/cms/variant-content-edit.ts";

const product = {
  specs: [{ label: "Battery", value: "29 days" }],
  specGroups: [{ title: "Physical", items: [{ label: "Lens", value: "Sapphire" }] }],
  overviewHtml: "<p>Hi</p>",
  inTheBox: ["Watch"],
};

test("Own specs deep-copies the flat list and the groups with their titles", () => {
  const copy = copyProductBlock(product, "specs");
  assert.deepEqual(copy, { specs: product.specs, specGroups: product.specGroups });
  copy.specGroups[0].title = "Changed";copy.specGroups[0].items[0].value = "Glass";copy.specs[0].value = "1 day";
  assert.equal(product.specGroups[0].title, "Physical");assert.equal(product.specGroups[0].items[0].value, "Sapphire");assert.equal(product.specs[0].value, "29 days");
  assert.deepEqual(copyProductBlock({ ...product, specGroups: undefined }, "specs").specGroups, [], "no product groups: an own, empty list");
});

test("ownsBlock / withoutBlock / unchangedFromProduct follow the present-key rule", () => {
  const content = { ...copyProductBlock(product, "specs"), inTheBox: [] };
  assert.ok(ownsBlock(content, "specs"));assert.ok(ownsBlock(content, "box"), "an empty own list is still Own");assert.ok(!ownsBlock(content, "overview"));
  assert.ok(ownsBlock({ specGroups: [] }, "specs"));
  assert.deepEqual(withoutBlock(content, "specs"), { inTheBox: [] });
  assert.ok(unchangedFromProduct(product, content, "specs"));
  assert.ok(!unchangedFromProduct(product, { ...content, specGroups: [{ title: "Renamed", items: product.specGroups[0].items }] }, "specs"));
});

test("dropVariantTranslation removes only that variant's keys and prunes empty objects", () => {
  const translations = {
    ru: { name: "Имя", variants: { a: { content: { specs: [{ label: "Б", value: "1" }], specGroups: [], inTheBox: ["Ч"] } }, b: { content: { specs: [] } } } },
    kk: { variants: { a: { content: { specs: [] } } } },
  };
  const next = dropVariantTranslation(translations, "a", ["specs", "specGroups"]);
  assert.deepEqual(next, { ru: { name: "Имя", variants: { a: { content: { inTheBox: ["Ч"] } }, b: { content: { specs: [] } } } }, kk: {} });
  assert.equal(translations.kk.variants.a.content.specs.length, 0, "the input is not mutated");
  assert.equal(dropVariantTranslation(translations, "zzz", ["specs"]), translations, "unchanged input is returned as is");
});
