// M6.2: pure helpers behind the Options & variants step (readiness, summary, generate preview, bulk edit).
import test from "node:test";
import assert from "node:assert/strict";
import {
  addOptionValues, applyBulk, filterVariants, moveItem, newOption, parseAmount, parseValueInput, patchVariant, presetsAvailable,
  previewGenerate, renameOption, renameOptionValue, selectByRule, setDefaultVariant, skuIssues, summarizeVariants, summaryLine,
  variantChips, variantReadiness, variantsOutOfDate, removeVariants, pruneOrphanedValues,
} from "../../src/components/admin/product-editor/variants-state.ts";

let counter = 0;
const makeId = prefix => `${prefix}-${++counter}`;
const size = { id: "size", key: "case-size", name: "Case size", display: "buttons", values: [{ id: "s43", key: "43 mm", label: "43 mm" }, { id: "s47", key: "47 mm", label: "47 mm" }, { id: "s51", key: "51 mm", label: "51 mm" }] };
const color = { id: "color", key: "color", name: "Color", display: "swatch", values: [{ id: "black", key: "black", label: "Black" }, { id: "gray", key: "gray", label: "Gray" }] };
const variant = (id, selections, extra = {}) => ({ id, sku: `SKU-${id}`, title: id, selections, price: 100, stock: 3, status: "active", isDefault: false, imageIds: [], ...extra });

test("value input: comma/newline/tab separated, trimmed, duplicates skipped case-insensitively", () => {
  assert.deepEqual(parseValueInput(" 43 mm, 47 mm ,, 51 mm\nSolar\t"), ["43 mm", "47 mm", "51 mm", "Solar"]);
  const { option, duplicates } = addOptionValues(size, ["51 MM", "55 mm", "55 mm"], makeId);
  assert.deepEqual(option.values.map(v => v.label), ["43 mm", "47 mm", "51 mm", "55 mm"]);
  assert.deepEqual(duplicates, ["51 MM", "55 mm"]);
  assert.equal(addOptionValues(size, ["43 mm"], makeId).option, size, "no change returns the same option");
});

test("renames keep derived keys in step, imported keys stay put; presets disappear once used", () => {
  assert.deepEqual(renameOptionValue({ id: "v", key: "Blk", label: "Blk" }, "Black"), { id: "v", key: "Black", label: "Black" });
  assert.deepEqual(renameOptionValue({ id: "v", key: "010-1", label: "Black" }, "Jet black"), { id: "v", key: "010-1", label: "Jet black" });
  assert.equal(renameOption(newOption(makeId), "Case size").key, "case-size");
  assert.equal(renameOption({ ...size, key: "imported" }, "Size").key, "imported");
  assert.deepEqual(presetsAvailable([size]).map(p => p.name), ["Color", "Edition"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"]);
});

test("ready to sell = active + price > 0 + stock > 0 + SKU, blockers in order", () => {
  assert.deepEqual(variantReadiness(variant("a", {})), { ready: true, blockers: [] });
  assert.deepEqual(variantReadiness(variant("a", {}, { sku: " ", status: "draft", price: 0, stock: 0 })).blockers, ["noSku", "draft", "noPrice", "outOfStock"]);
  assert.deepEqual(variantReadiness(variant("a", {}, { status: "archived" })).blockers, ["archived"]);
});

test("summary line counts ready, out of stock, drafts, archived and SKU problems", () => {
  const list = [
    variant("a", {}), variant("b", {}, { stock: 0 }), variant("c", {}, { status: "draft" }), variant("d", {}, { status: "archived", stock: 0 }),
    variant("e", {}, { sku: "SKU-a" }),
  ];
  const summary = summarizeVariants(list);
  assert.deepEqual(summary, { total: 5, ready: 2, outOfStock: 1, drafts: 1, archived: 1, skuProblems: 2 });
  assert.equal(summaryLine(summary), "5 variants · 2 ready to sell · 1 out of stock · 1 draft · 1 archived · 2 SKU problems");
  assert.equal(summaryLine(summarizeVariants([variant("a", {})])), "1 variant · 1 ready to sell");
  assert.equal(summaryLine(summarizeVariants([])), "No variants yet");
});

test("SKU issues: empty, duplicate in product, server conflict", () => {
  const issues = skuIssues([variant("a", {}, { sku: "" }), variant("b", {}, { sku: "x-1" }), variant("c", {}, { sku: "X-1" }), variant("d", {}, { sku: "taken" })], ["TAKEN"]);
  assert.deepEqual(Object.fromEntries(issues), { a: "SKU is required", b: "Duplicate SKU in this product", c: "Duplicate SKU in this product", d: "SKU already used by another product" });
});

test("generate preview: counts before applying, keeps existing variants, flags drafts and limits", () => {
  const base = { sku: "FX", price: 1, stock: 0 };
  assert.deepEqual(previewGenerate([], [], base), { kind: "none" });
  assert.deepEqual(previewGenerate([], [variant("a", {})], base), { kind: "simple", removed: 1 });
  assert.deepEqual(previewGenerate([{ ...size, name: " " }], [], base), { kind: "unnamed" });
  const fresh = previewGenerate([size, color], [], base);
  assert.equal(fresh.kind, "apply");
  assert.deepEqual([fresh.total, fresh.created, fresh.kept, fresh.removed, fresh.createdAsDraft], [6, 6, 0, 0, false]);
  // Existing 43/black keeps its SKU and price; 47 removed from options → its variant is removed.
  const existing = [variant("v43", { size: "s43", color: "black" }, { price: 999, isDefault: true }), variant("v47", { size: "s47", color: "black" })];
  const sizes = { ...size, values: size.values.filter(v => v.id !== "s47") };
  const preview = previewGenerate([sizes, color], existing, base);
  assert.deepEqual([preview.created, preview.kept, preview.removed, preview.createdAsDraft, preview.stale], [3, 1, 1, true, true]);
  const kept = preview.variants.find(v => v.id === "v43");
  assert.deepEqual([kept.sku, kept.price, kept.isDefault], ["SKU-v43", 999, true]);
  assert.ok(preview.variants.filter(v => v.id !== "v43").every(v => v.status === "draft"));
  // In sync → nothing to do; partial matrix (imports) → not stale but can add the missing combinations.
  const full = previewGenerate([size], [variant("a", { size: "s43" }), variant("b", { size: "s47" }), variant("c", { size: "s51" })], base);
  assert.deepEqual(full, { kind: "none" });
  const partial = previewGenerate([size, color], [variant("a", { size: "s43", color: "black" }), variant("b", { size: "s47", color: "gray" }), variant("c", { size: "s51", color: "black" })], base);
  assert.deepEqual([partial.kind, partial.stale, partial.created], ["apply", false, 3]);
  const big = { id: "n", key: "n", name: "N", display: "dropdown", values: Array.from({ length: 26 }, (_, i) => ({ id: `n${i}`, key: `${i}`, label: `${i}` })) };
  assert.deepEqual(previewGenerate([big, { ...big, id: "m" }], [], base), { kind: "tooMany", total: 676 });
  assert.match(previewGenerate([big, { ...big, id: "m", values: big.values.slice(0, 5) }], [], base).warning, /130 combinations/);
});

test("out of date: removed value, missing option, unused value", () => {
  const list = [variant("a", { size: "s43" }), variant("b", { size: "s47" }), variant("c", { size: "s51" })];
  assert.equal(variantsOutOfDate([size], list), false);
  assert.equal(variantsOutOfDate([size, color], list), true);
  assert.equal(variantsOutOfDate([{ ...size, values: size.values.slice(0, 2) }], list), true);
  assert.equal(variantsOutOfDate([], list), true);
});

test("bulk edit applies only to selected rows; compare-at 0 clears; archiving the default moves it", () => {
  const list = [variant("a", {}, { isDefault: true, originalPrice: 500 }), variant("b", {}, { originalPrice: 400 }), variant("c", {})];
  const next = applyBulk(list, new Set(["a", "b"]), { price: 250, originalPrice: 0, stock: 7.9, status: "archived" });
  assert.deepEqual(next.map(v => [v.id, v.price, v.originalPrice, v.stock, v.status, v.isDefault]), [
    ["a", 250, undefined, 7, "archived", false], ["b", 250, undefined, 7, "archived", false], ["c", 100, undefined, 3, "active", true],
  ]);
  assert.equal(applyBulk(list, new Set(["c"]), { originalPrice: 777 })[2].originalPrice, 777);
  assert.deepEqual(patchVariant(list, "a", { status: "archived" }).map(v => v.isDefault), [false, true, false]);
  assert.deepEqual(setDefaultVariant(list, "c").map(v => v.isDefault), [false, false, true]);
});

test("select by rule (all 51 mm, not ready, out of stock), filters and chips", () => {
  const list = [variant("a", { size: "s43", color: "black" }), variant("b", { size: "s51", color: "black" }, { stock: 0 }), variant("c", { size: "s51", color: "gray" }, { status: "draft" })];
  assert.deepEqual([...selectByRule(list, { kind: "value", optionId: "size", valueId: "s51" })], ["b", "c"]);
  assert.deepEqual([...selectByRule(list, { kind: "notReady" })], ["b", "c"]);
  assert.deepEqual([...selectByRule(list, { kind: "outOfStock" })], ["b"]);
  assert.equal(selectByRule(list, { kind: "all" }).size, 3);
  assert.equal(selectByRule(list, { kind: "none" }).size, 0);
  assert.deepEqual(filterVariants(list, { size: "s51" }).map(v => v.id), ["b", "c"]);
  assert.deepEqual(filterVariants(list, { size: "", color: "black" }, true).map(v => v.id), ["b"]);
  assert.deepEqual(variantChips([size, color], list[2]), [{ optionName: "Case size", label: "51 mm" }, { optionName: "Color", label: "Gray" }]);
});

test("amount parsing accepts spaces and comma decimals, rejects negatives", () => {
  assert.equal(parseAmount(""), undefined);
  assert.equal(parseAmount("249 995"), 249995);
  assert.equal(parseAmount("12,5"), 12.5);
  assert.ok(Number.isNaN(parseAmount("-1")));
  assert.ok(Number.isNaN(parseAmount("abc")));
});

// M9.3 review finding 4: "no price" stays null through the variants step (never 0 KZT).
test("an unpriced variant is not ready, and edits that do not touch the price keep it null", () => {
  const unpriced = variant("u", {}, { price: null, status: "draft" });
  assert.deepEqual(variantReadiness(unpriced).blockers, ["draft", "noPrice"]);
  const [bulk] = applyBulk([unpriced], new Set(["u"]), { stock: 5, status: "active" });
  assert.deepEqual([bulk.price, bulk.stock, bulk.status], [null, 5, "active"]);
  assert.equal(patchVariant([unpriced], "u", { title: "Renamed" })[0].price, null);
  assert.equal(applyBulk([unpriced], new Set(["u"]), { price: 1500 })[0].price, 1500);
});

// Owner 2026-11-23: delete imported variants the store does not sell (bin per row, "Delete selected").
test("removeVariants drops the chosen variants and keeps the rest in order", () => {
  const list = [variant("a", {}), variant("b", {}, { isDefault: true }), variant("c", {})];
  assert.deepEqual(removeVariants(list, new Set(["a"])).map(v => v.id), ["b", "c"]);
  assert.equal(removeVariants(list, new Set(["a"]))[0].isDefault, true, "the default stays the default");
});

test("removing the default makes the first remaining active variant the default", () => {
  const list = [variant("a", {}, { isDefault: true }), variant("b", {}, { status: "draft" }), variant("c", {})];
  const next = removeVariants(list, new Set(["a"]));
  assert.deepEqual(next.map(v => [v.id, v.isDefault]), [["b", false], ["c", true]]);
});

test("removeVariants never removes the last variant", () => {
  const list = [variant("a", {}, { isDefault: true }), variant("b", {})];
  assert.equal(removeVariants(list, new Set(["a", "b"])), list, "everything selected: nothing changes");
  assert.equal(removeVariants(list, new Set(["zzz"])), list, "unknown id: nothing changes");
});

test("pruneOrphanedValues drops only the option values the deleted variants were the last to use", () => {
  const before = [variant("a", { size: "s43", color: "black" }), variant("b", { size: "s47", color: "gray" }), variant("c", { size: "s47", color: "black" })];
  const after = before.filter(v => v.id !== "b");
  const options = pruneOrphanedValues([size, color], before, after);
  assert.deepEqual(options.find(o => o.id === "color").values.map(v => v.id), ["black"], "Gray had only variant b");
  assert.deepEqual(options.find(o => o.id === "size").values.map(v => v.id), ["s43", "s47", "s51"], "47 mm is still used; 51 mm was never used and stays");
  const grayOnly = { ...color, values: [{ id: "gray", key: "gray", label: "Gray" }] };
  const onlyGray = pruneOrphanedValues([grayOnly], [variant("g", { color: "gray" })], []);
  assert.deepEqual(onlyGray, [], "an option left without values goes");
  const same = [size, color];
  assert.equal(pruneOrphanedValues(same, before, before), same, "nothing orphaned: same array");
});
