import test from "node:test";
import assert from "node:assert/strict";
import {
  applyImportedDraft,
  blankForm,
  buildCommand,
  cleanSpecGroups,
  describeSaveError,
  formFromPayload,
  formSignature,
  moneyValue,
  normalizeInTheBox,
  validateForm,
} from "../../src/components/admin/product-editor/editor-state.ts";
import { buildTaxonomyTree, categoryPath, filterTaxonomyTree, normalizeCategories, setPrimaryCategory, taxonomyIndex, toggleCategory } from "../../src/lib/admin/taxonomy-tree.ts";
import { taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";

const taxonomy = taxonomySeed.map(({ key, name, kind, parentKey }, position) => ({ key, name, kind, slug: key, parentKey, position, navVisible: true }));

// What GET /api/admin/catalog/products/:key returns for a simple product (trimmed to what matters).
const simplePayload = () => ({
  id: "smoke-band", version: 3, name: "QuickFit 22 band", sku: "010-12345-00", price: 24995, description: "Silicone band",
  image: "/uploads/band.jpg", family: "QuickFit", category: "", subCategory: "", activities: [], stock: 7, stockBaseline: 7,
  stockReserved: 1, stockAvailable: 6, stockTracked: true, stockManaged: true, status: "published", isFeatured: false,
  specs: [{ label: "Width", value: "22 mm" }], inTheBox: ["Band", { label: "Pins", image: "/uploads/pins.jpg" }, "  "],
  features: [{ title: "Keep me", body: "untouched" }], compatibleAccessories: [], images: [{ id: "img-1", src: "/uploads/band.jpg", alt: "", source: "upload" }],
  defaultImageId: "img-1", options: [], variants: [], categories: [{ key: "bands", primary: true }], primaryCategory: { key: "bands", name: "Bands" },
  relations: { related: ["fenix-8"], upsell: ["marq"] },
  compatibility: { devices: [{ productKey: "fenix-8", optionValueKeys: ["51mm"], variantSkus: [] }], accessories: [], compatibleDevices: [{ x: 1 }], compatibleAccessories: [] },
  currency: "KZT", createdAt: "2026-11-21T00:00:00.000000Z", updatedAt: "2026-11-21T00:00:00.000000Z", thumbnail: "/uploads/band.jpg",
  seoTitle: "", seoDescription: "", focusKeywords: [], canonicalUrl: "", noIndex: false, ogImage: "",
});

test("a blank product has no presets: no specs, no in-the-box, no categories, no activities", () => {
  const form = blankForm();
  assert.deepEqual([form.specGroups, form.inTheBox, form.categories, form.activities, form.related], [[], [], [], [], []]);
  assert.equal(form.status, "draft");
  assert.equal(form.sku, "");
});

test("in-the-box loads old strings and {label,image} objects, dropping blanks", () => {
  assert.deepEqual(normalizeInTheBox(["Watch", " ", { label: "Cable", image: "/uploads/c.jpg" }, { label: "" }, 4]), [{ label: "Watch" }, { label: "Cable", image: "/uploads/c.jpg" }]);
  assert.deepEqual(normalizeInTheBox(undefined), []);
});

test("a legacy flat spec list becomes one editable group; empty rows/groups are dropped on save", () => {
  const form = formFromPayload(simplePayload());
  assert.deepEqual(form.specGroups, [{ title: "General", items: [{ label: "Width", value: "22 mm" }] }]);
  assert.deepEqual(cleanSpecGroups([{ title: " A ", items: [{ label: " x ", value: " 1 " }, { label: "", value: "" }] }, { title: "Empty", items: [{ label: " ", value: "" }] }]), [{ title: "A", items: [{ label: "x", value: "1" }] }]);
});

test("save body = GET payload + edits: untouched fields round-trip, simple stock carries its baseline", () => {
  const base = simplePayload();
  const form = { ...formFromPayload(base), name: "QuickFit 22 band (black)", stock: 12, related: ["fenix-8", "forerunner-970"] };
  const command = buildCommand(base, form, false);
  assert.equal(command.id, undefined, "the URL carries the key");
  assert.equal(command.version, 3);
  assert.equal(command.name, "QuickFit 22 band (black)");
  assert.equal(command.stock, 12);
  assert.equal(command.stockBaseline, 7);
  assert.deepEqual(command.features, base.features);
  assert.deepEqual(command.compatibility, base.compatibility);
  assert.deepEqual(command.relations, { related: ["fenix-8", "forerunner-970"], upsell: ["marq"] });
  assert.deepEqual(command.inTheBox, ["Band", { label: "Pins", image: "/uploads/pins.jpg" }]);
  assert.deepEqual(command.categories, [{ key: "bands", primary: true }]);
  assert.deepEqual(command.specs, [{ label: "Width", value: "22 mm" }]);
});

test("variant products never send product-level stock; new products omit id, version and baseline", () => {
  const base = { ...simplePayload(), variants: [{ id: "v1", sku: "A-1", title: "Black", selections: {}, price: 100, stock: 3, stockBaseline: 3, status: "active", isDefault: true, imageIds: [] }] };
  const command = buildCommand(base, formFromPayload(base), false);
  assert.equal("stock" in command, false);
  assert.equal("stockBaseline" in command, false);
  assert.equal(command.variants[0].stockBaseline, 3, "per-variant baselines round-trip");
  const created = buildCommand({}, { ...blankForm(), name: "New", sku: "N-1", price: 1500.5, stock: 4 }, true);
  assert.equal("id" in created || "version" in created || "stockBaseline" in created || "originalPrice" in created, false);
  assert.equal(created.stock, 4);
  assert.equal(created.price, 1500.5);
});

test("clearing the compare-at price on an existing product sends null; money keeps two decimals", () => {
  const base = { ...simplePayload(), originalPrice: 29995 };
  const command = buildCommand(base, { ...formFromPayload(base), originalPrice: null }, false);
  assert.equal(command.originalPrice, null);
  assert.equal(moneyValue(19.999), 20);
  assert.equal(moneyValue(-1), undefined);
  assert.equal(moneyValue(null), undefined);
});

// M9.3 review finding 4: a variant with no active price round-trips as null, never as 0 KZT.
test("a variant without a price round-trips null; an active one without a price is flagged", () => {
  const variant = (extra) => ({ id: "v1", sku: "A-1", title: "Black", selections: {}, price: null, stock: 0, stockBaseline: 0, status: "draft", isDefault: true, imageIds: [], ...extra });
  const base = { ...simplePayload(), price: null, variants: [variant(), variant({ id: "v2", sku: "A-2", price: 100, status: "active", isDefault: false })] };
  const form = formFromPayload(base);
  assert.equal(form.variants[0].price, null);
  assert.equal(form.price, null);
  const command = buildCommand(base, form, false);
  assert.equal(command.variants[0].price, null, "no 0 KZT invented for the unpriced draft variant");
  assert.equal(command.variants[1].price, 100);
  assert.equal(validateForm(form), null, "a draft variant may lack a price");
  const active = { ...form, variants: [{ ...form.variants[0], status: "active" }, form.variants[1]] };
  assert.deepEqual([validateForm(active)?.tab, /A-1/.test(validateForm(active)?.message ?? ""), /price/.test(validateForm(active)?.message ?? "")], ["variants", true, true]);
});

test("validation points at the tab to fix", () => {
  assert.equal(validateForm(blankForm()).tab, "general");
  assert.match(validateForm({ ...blankForm(), name: "X" }).message, /SKU/);
  assert.match(validateForm({ ...blankForm(), name: "X", sku: "S" }).message, /price/);
  assert.equal(validateForm({ ...blankForm(), name: "X", sku: "S", price: 0 }), null);
  assert.equal(validateForm({ ...blankForm(), name: "X", variants: [{ id: "v", sku: " ", title: "", selections: {}, price: 1, stock: 0, status: "active", isDefault: true, imageIds: [] }] }).tab, "variants");
  assert.equal(validateForm({ ...blankForm(), name: "X", sku: "S", price: 1, inTheBox: [{ label: " " }] }).tab, "box");
});

test("garmin.com import stays a draft, brings no in-the-box presets and preselects breadcrumb categories", () => {
  const draft = { name: "fēnix 9", sku: "010-03000-00", price: 500000, status: "published", category: "Wearables", subCategory: "Adventure", family: "fēnix 9", inTheBox: [] };
  const form = applyImportedDraft(blankForm(), draft, taxonomy);
  assert.equal(form.status, "draft");
  assert.deepEqual(form.inTheBox, []);
  assert.equal(form.categories.filter((category) => category.primary).length, 1);
  assert.equal(form.categories.find((category) => category.primary).key, "outdoor-recreation/adventure-smartwatches");
  assert.ok(form.categories.some((category) => category.key === "watch-series/fenix"), "the family adds its watch-series group");
  const unmatched = applyImportedDraft(blankForm(), { ...draft, category: "Nowhere", subCategory: "Nothing", family: "Unknown" }, taxonomy);
  assert.deepEqual(unmatched.categories, []);
});

test("save errors map to actionable messages", () => {
  assert.equal(describeSaveError(409, { error: { code: "STOCK_CONFLICT", message: "x" } }).kind, "stock");
  assert.equal(describeSaveError(409, { error: { code: "VERSION_CONFLICT" } }).reloadable, true);
  const sku = describeSaveError(409, { error: { code: "SKU_CONFLICT", message: "SKU in use", conflicts: ["A-1"] }, code: "SKU_CONFLICT", conflicts: ["A-1"] });
  assert.deepEqual([sku.kind, sku.conflicts, sku.reloadable], ["sku", ["A-1"], false]);
  assert.match(describeSaveError(400, { error: { code: "INVALID_INPUT", message: "categories: Mark exactly one category as primary" } }).message, /primary/);
  assert.equal(describeSaveError(0, null).kind, "network");
});

test("unsaved-change signature changes with edits only", () => {
  const form = formFromPayload(simplePayload());
  assert.equal(formSignature(form), formSignature(formFromPayload(simplePayload())));
  assert.notEqual(formSignature(form), formSignature({ ...form, name: "Other" }));
});

test("category list helpers keep exactly one primary", () => {
  let list = toggleCategory([], "bands");
  list = toggleCategory(list, "quickfit-22");
  assert.deepEqual(list, [{ key: "bands", primary: true }, { key: "quickfit-22", primary: false }]);
  list = setPrimaryCategory(list, "quickfit-22");
  assert.deepEqual(list.map((item) => item.primary), [false, true]);
  list = toggleCategory(list, "quickfit-22");
  assert.deepEqual(list, [{ key: "bands", primary: true }]);
  assert.deepEqual(normalizeCategories([{ key: "a", primary: true }, { key: "A", primary: false }, { key: "b", primary: true }]), [{ key: "a", primary: true }, { key: "b", primary: false }]);
});

test("taxonomy tree: three sections, search keeps ancestors, paths read parent › child", () => {
  const tree = buildTaxonomyTree(taxonomy);
  assert.ok(tree.catalog.length > 0 && tree.accessory.length > 0 && tree.group.length > 0);
  const filtered = filterTaxonomyTree(tree.catalog, "running");
  assert.ok(filtered.matches >= 1);
  assert.ok(filtered.expanded.size >= 1, "parents of matches are expanded");
  const index = taxonomyIndex(taxonomy);
  assert.match(categoryPath(index, "sports-fitness/running-smartwatches"), / › /);
  assert.equal(filterTaxonomyTree(tree.group, "fenix").roots.length, 1, "diacritics are ignored (fēnix)");
});
