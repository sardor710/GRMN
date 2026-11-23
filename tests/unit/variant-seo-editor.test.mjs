// Owner 2026-11-23: the admin SEO tab previews each variant page's generated text in EN/RU/KK from the editor's own
// form and stored translations, and fills or clears the per-language overrides.
import assert from "node:assert/strict";
import test from "node:test";
import { editorSeoProduct, fillVariantSeo, variantSeoPreview } from "../../src/components/admin/product-editor/variant-seo.ts";

const form = {
  name: "fēnix® 9 Pro", description: "Premium multisport GPS watch.", family: "fēnix", specGroups: [],
  categories: [{ key: "wearables-smartwatches", primary: true }],
  options: [{ id: "opt-size", key: "case-size", name: "Case Size", display: "buttons", values: [{ id: "v43", key: "43", label: "43 mm" }] },
    { id: "opt-color", key: "color", name: "Color", display: "swatch", values: [{ id: "black", key: "black", label: "Black" }, { id: "white", key: "white", label: "White" }] }],
  variants: [
    { id: "a", sku: "SKU-A", title: "", selections: { "opt-size": "v43", "opt-color": "black" }, price: 1, stock: 1, status: "active", isDefault: true, imageIds: [] },
    { id: "b", sku: "SKU-B", title: "", selections: { "opt-size": "v43", "opt-color": "white" }, price: 1, stock: 1, status: "active", isDefault: false, imageIds: [], seo: { ru: { title: "Свой" } } },
  ],
};
const translations = { ru: { name: "fēnix® 9 Pro", optionNames: { "opt-color": "Цвет" }, valueLabels: { black: "черный" } } };

test("editorSeoProduct localizes option values from the stored translations, falling back to English", () => {
  const ru = editorSeoProduct(form, translations, "ru");
  assert.deepEqual(ru.variants[0].optionValues, [{ key: "case-size", name: "Case Size", value: "43 mm" }, { key: "color", name: "Цвет", value: "черный" }]);
  assert.equal(ru.variants[1].optionValues[1].value, "White");
  assert.deepEqual(ru.variants[1].seo, { title: "Свой" });
});

test("variantSeoPreview gives the generated text (never the override) for the placeholder", () => {
  const preview = variantSeoPreview(form, translations, "ru", "b");
  assert.notEqual(preview.title, "Свой");
  assert.match(preview.title, /White/);
  assert.match(variantSeoPreview(form, translations, "ru", "a").title, /черный/);
});

test("fillVariantSeo fills empty fields in every language, and overwrites only when asked", () => {
  const filled = fillVariantSeo(form, translations, false);
  assert.equal(filled[1].seo.ru.title, "Свой", "an existing override is kept");
  assert.ok(filled[1].seo.ru.description.length >= 120);
  assert.ok(filled[0].seo.en.title && filled[0].seo.kk.title && filled[0].seo.ru.description);
  const overwritten = fillVariantSeo(form, translations, true);
  assert.notEqual(overwritten[1].seo.ru.title, "Свой");
});
