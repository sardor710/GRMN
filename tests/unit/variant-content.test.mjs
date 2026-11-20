// Task 2.1 (owner 2026-11-19): each variant may own its Specs (and grouped specs), Overview and In the
// box. Inherit with override: a present key is "Own" (even when empty); an absent key inherits the
// product's content.
import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveVariantContent, localizeVariantOverride } from "../../src/lib/catalog/variant-content.ts";

const product = {
  specs: [{ label: "Screen", value: "AMOLED" }],
  specGroups: [{ title: "General", items: [{ label: "Lens", value: "Sapphire" }] }],
  overviewHtml: "<p>Product overview</p>",
  inTheBox: ["Watch", "Charging cable"],
};

test("absent override inherits product content", () => {
  assert.deepEqual(effectiveVariantContent(product, {}), product);
  assert.deepEqual(effectiveVariantContent(product, { content: {} }), product);
  assert.deepEqual(effectiveVariantContent({ specs: [], inTheBox: [] }, {}), { specs: [], specGroups: [], overviewHtml: "", inTheBox: [] });
});

test("own empty inTheBox stays empty", () => {
  const effective = effectiveVariantContent(product, { content: { inTheBox: [] } });
  assert.deepEqual(effective.inTheBox, []);
  assert.deepEqual(effective.specs, product.specs);
  assert.equal(effective.overviewHtml, product.overviewHtml);
  assert.equal(effectiveVariantContent(product, { content: { overviewHtml: "" } }).overviewHtml, "");
});

test("own specGroups replace product specGroups", () => {
  const own = [{ title: "51 mm", items: [{ label: "Weight", value: "89 g" }] }];
  const effective = effectiveVariantContent(product, { content: { specGroups: own, specs: [{ label: "Size", value: "51 mm" }] } });
  assert.deepEqual(effective.specGroups, own);
  assert.deepEqual(effective.specs, [{ label: "Size", value: "51 mm" }]);
  assert.deepEqual(effective.inTheBox, product.inTheBox);
  // The result is a copy: changing it never changes the product.
  effective.inTheBox.push("Extra");
  assert.deepEqual(product.inTheBox, ["Watch", "Charging cable"]);
});

test("a translated override keeps only the blocks the variant owns and falls back to the English override", () => {
  const english = { inTheBox: ["Watch", "Strap"], overviewHtml: "<p>Own</p>" };
  const localized = localizeVariantOverride(english, { inTheBox: ["Часы", ""], specs: [{ label: "x", value: "y" }] }, "ru");
  assert.deepEqual(localized, { inTheBox: ["Часы", "Strap"], overviewHtml: "<p>Own</p>" });
  assert.deepEqual(localizeVariantOverride(english, undefined, "ru"), english);
  assert.deepEqual(localizeVariantOverride(english, { overviewHtml: "<p>Своё</p>" }, "en"), english);
});
