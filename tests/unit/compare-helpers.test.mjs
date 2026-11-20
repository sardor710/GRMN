// Task C-a (plan 2026-11-21 §3): the compare page's URL format and spec table rules, Garmin-style.
// `item=<productId>~<sku>` repeated (max 5, `~<sku>` optional), old `selected=<id>` still read; rows are the
// union of groups and labels in first-seen order, labels matched case/whitespace/trademark-insensitively;
// "Show only differences" keeps a row unless every column has the same non-blank value.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPARE_MAX_ITEMS,
  buildCompareRows,
  isDifferentRow,
  normalizeSpecLabel,
  parseCompareItems,
  serializeCompareItems,
} from "../../src/lib/compare/compare-items.ts";
import { compareItemFromDetail, collectCompareItems } from "../../src/lib/compare/resolve.ts";

test("parse reads repeated item=<id>~<sku> with the sku optional, and round-trips through serialize", () => {
  const items = parseCompareItems("item=1953453~010-04337-00&item=2000~&item=3000");
  assert.deepEqual(items, [{ productId: "1953453", sku: "010-04337-00" }, { productId: "2000" }, { productId: "3000" }]);
  const params = serializeCompareItems(items);
  assert.ok(params instanceof URLSearchParams);
  assert.equal(params.toString(), "item=1953453%7E010-04337-00&item=2000&item=3000");
  assert.deepEqual(parseCompareItems(params), items);
  assert.deepEqual(parseCompareItems(params.toString()), items);
  assert.deepEqual(parseCompareItems("?" + params.toString()), items, "a leading ? is accepted");
  // Page searchParams (Next.js record shape) work too: a single value or an array.
  assert.deepEqual(parseCompareItems({ item: ["1~a", "2"] }), [{ productId: "1", sku: "a" }, { productId: "2" }]);
  assert.deepEqual(parseCompareItems({ item: "1~a" }), [{ productId: "1", sku: "a" }]);
});

test("parse caps at 5, de-duplicates exact pairs, allows the same product with different SKUs", () => {
  const six = Array.from({ length: 6 }, (_, i) => `item=p${i}`).join("&");
  assert.equal(COMPARE_MAX_ITEMS, 5);
  assert.deepEqual(parseCompareItems(six).map((i) => i.productId), ["p0", "p1", "p2", "p3", "p4"]);
  assert.deepEqual(parseCompareItems("item=a~47&item=a~47&item=a~51&item=a&item=a"), [
    { productId: "a", sku: "47" },
    { productId: "a", sku: "51" },
    { productId: "a" },
  ]);
  // Duplicates do not use up slots.
  assert.equal(parseCompareItems("item=a&item=a&item=b&item=c&item=d&item=e").length, 5);
});

test("parse accepts the old repeated selected=<id>, after item= values", () => {
  assert.deepEqual(parseCompareItems("selected=1228429&selected=2000"), [{ productId: "1228429" }, { productId: "2000" }]);
  assert.deepEqual(parseCompareItems({ selected: ["1", "2"], item: "3~x" }), [{ productId: "3", sku: "x" }, { productId: "1" }, { productId: "2" }]);
  // A legacy value is a product id only: a "~" in it is not split.
  assert.deepEqual(parseCompareItems("selected=1"), [{ productId: "1" }]);
});

test("parse trims, drops empty and over-long values, and never throws on junk", () => {
  assert.deepEqual(parseCompareItems("item=%20a%20~%20s1%20&item=&item=~sku&item=%20"), [{ productId: "a", sku: "s1" }]);
  const long = "x".repeat(201);
  assert.deepEqual(parseCompareItems(`item=${long}&item=ok~${long}&item=b`), [{ productId: "b" }]);
  assert.deepEqual(parseCompareItems(""), []);
  assert.deepEqual(parseCompareItems({}), []);
  assert.deepEqual(parseCompareItems({ item: undefined }), []);
  // Malformed percent-encoding does not throw (URLSearchParams decodes it leniently; the id just matches nothing).
  assert.equal(parseCompareItems("item=%E0%A4%A").length, 1);
  assert.deepEqual(parseCompareItems(null), []);
  // Serialize ignores bad entries the same way.
  assert.equal(serializeCompareItems([{ productId: " " }, { productId: "a", sku: "" }, { productId: "a" }]).toString(), "item=a");
});

test("normalizeSpecLabel ignores case, whitespace, trademark symbols and trailing colons", () => {
  assert.equal(normalizeSpecLabel("Battery Life (Smartwatch Mode)"), normalizeSpecLabel("BATTERY LIFE (SMARTWATCH MODE)"));
  assert.equal(normalizeSpecLabel("Garmin Pay™"), normalizeSpecLabel("GARMIN PAY"));
  assert.equal(normalizeSpecLabel("  Garmin  Pay®:  "), "garmin pay");
  assert.equal(normalizeSpecLabel("Connect IQ© Store::"), "connect iq store");
  assert.equal(normalizeSpecLabel("Вес"), normalizeSpecLabel("ВЕС"));
  assert.notEqual(normalizeSpecLabel("Weight"), normalizeSpecLabel("Weight (case only)"));
});

const col = (specGroups, specs = []) => ({ specs, specGroups });
const g = (title, items) => ({ title, items: items.map(([label, value]) => ({ label, value })) });

test("buildCompareRows unions groups and rows in first-seen order with first-seen text, null for missing", () => {
  const a = col([g("General", [["Lens", "Sapphire"], ["Weight", "99 g"]]), g("Sensors", [["GPS", "Yes"]])]);
  const b = col([g("GENERAL", [["WEIGHT:", "78 g"], ["Water rating", "10 ATM"]]), g("Connectivity", [["Garmin Pay™", "Yes"]])]);
  const c = col([g("Connectivity", [["GARMIN PAY", "No"]]), g("general", [["lens", "Glass"]])]);
  const groups = buildCompareRows([a, b, c], "Specs");
  assert.deepEqual(groups.map((x) => x.title), ["General", "Sensors", "Connectivity"]);
  assert.deepEqual(groups[0].rows.map((r) => r.label), ["Lens", "Weight", "Water rating"]);
  assert.deepEqual(groups[0].rows.map((r) => r.values), [
    ["Sapphire", null, "Glass"],
    ["99 g", "78 g", null],
    [null, "10 ATM", null],
  ]);
  assert.deepEqual(groups[1].rows, [{ key: groups[1].rows[0].key, label: "GPS", values: ["Yes", null, null] }]);
  assert.deepEqual(groups[2].rows.map((r) => [r.label, r.values]), [["Garmin Pay™", [null, "Yes", "No"]]]);
  // Keys are stable and unique.
  const keys = groups.flatMap((x) => [x.key, ...x.rows.map((r) => r.key)]);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(groups[0].key, "general");
});

test("buildCompareRows puts flat specs under the fallback group; blank values count as missing", () => {
  const flat = col([], [{ label: "Weight", value: "50 g" }, { label: "Display", value: "  " }]);
  const noGroups = { specs: [{ label: "Display", value: "MIP" }] };
  const grouped = col([g("Specs", [["weight", "60 g"]]), g("General", [["Lens", "Glass"]])]);
  const groups = buildCompareRows([flat, noGroups, grouped], "Specs");
  assert.deepEqual(groups.map((x) => x.title), ["Specs", "General"]);
  assert.deepEqual(groups[0].rows.map((r) => [r.label, r.values]), [
    ["Weight", ["50 g", null, "60 g"]],
    ["Display", [null, "MIP", null]],
  ]);
  assert.deepEqual(groups[1].rows[0].values, [null, null, "Glass"]);
  // Nothing at all: no groups. A column with neither block just gets nulls.
  assert.deepEqual(buildCompareRows([], "Specs"), []);
  assert.deepEqual(buildCompareRows([{ specs: [] }, flat], "Specs")[0].rows[0].values, [null, "50 g"]);
  // A repeated label inside one column keeps its first value.
  assert.deepEqual(buildCompareRows([col([g("G", [["A", "1"], ["a", "2"]])])], "Specs")[0].rows, [{ key: "g::a", label: "A", values: ["1"] }]);
});

test("isDifferentRow follows Garmin: equal everywhere hides, a blank column or any difference shows", () => {
  const row = (values) => ({ key: "k", label: "L", values });
  assert.equal(isDifferentRow(row(["10 ATM", "10 ATM", "10 ATM"])), false, "all equal");
  assert.equal(isDifferentRow(row(["10 ATM", null])), true, "one blank");
  assert.equal(isDifferentRow(row([null, null])), true, "all blank");
  assert.equal(isDifferentRow(row(["10 ATM", "5 ATM"])), true, "differing");
  assert.equal(isDifferentRow(row([" 10  ATM ", "10 ATM"])), false, "whitespace-only difference is equal");
  assert.equal(isDifferentRow(row(["10 atm", "10 ATM"])), true, "case is a real difference in values");
  assert.equal(isDifferentRow(row(["Yes"])), false, "a single column is never different");
});

// --- Resolving one compare column from the product-detail read (both backends) ---

const money = (minor) => ({ selling: { amountMinor: minor, currency: "KZT" }, compareAt: null, usdEquivalent: null });
const content = (groups, specs = []) => ({ specs, specGroups: groups, overviewHtml: "", inTheBox: [] });
function postgresDetail() {
  const productGroups = [g("General", [["Weight", "99 g"]])];
  const variants = [
    { id: "v47", sku: "W-47", name: "fenix 47", options: { color: "Slate Gray", "case-size": "47 mm" }, price: money("50000000"), availability: "available", gallery: [{ url: "/47.jpg", alt: "", width: null, height: null }], content: content(productGroups), ownsOverview: false },
    { id: "v51", sku: "W-51", name: "fenix 51", options: { "case-size": "51 mm" }, price: { ...money("60000000"), compareAt: { amountMinor: "65000000", currency: "KZT" } }, availability: "available", gallery: [], content: content([g("General", [["Weight", "120 g"]])]), ownsOverview: true },
  ];
  const commerce = { id: "uuid", publicKey: "P1", name: "fenix", description: "", image: { url: "/product.jpg", alt: "", width: null, height: null }, badge: null, price: money("50000000"), availability: "available",
    variants, gallery: [{ url: "/product.jpg", alt: "", width: null, height: null }], specs: [], features: [], inTheBox: [], compatibleProductKeys: [], selectedVariantId: "v47",
    optionNames: { "case-size": "Case size", color: "Color" }, specGroups: productGroups };
  return { id: "P1", title: "fenix", subtitle: "", partNumber: "W-47", price: "500000.00", currency: "KZT", commerce, breadcrumb: [], gallery: [{ view: "fenix", src: "/product.jpg" }],
    caseSizes: [], defaultCaseSize: "", versions: [], defaultVersion: "", colors: [], features: [], specs: [], inTheBox: [], related: [], specGroups: productGroups };
}

test("compareItemFromDetail (PostgreSQL) picks the SKU's variant: price, image, labels, effective specs", () => {
  const detail = postgresDetail();
  const big = compareItemFromDetail(detail, "w-51");
  assert.equal(big.productId, "P1");
  assert.equal(big.sku, "W-51");
  assert.equal(big.name, "fenix");
  assert.deepEqual(big.price, { minor: "60000000" });
  assert.deepEqual(big.compareAt, { minor: "65000000" });
  assert.equal(big.image, "/product.jpg", "no variant gallery: the product image");
  assert.deepEqual(big.content.specGroups, [g("General", [["Weight", "120 g"]])]);
  // Labels follow the option order (optionNames is ordered by position), joined with a middle dot.
  assert.deepEqual(big.variants, [{ sku: "W-47", label: "47 mm · Slate Gray" }, { sku: "W-51", label: "51 mm" }]);
  const small = compareItemFromDetail(detail, undefined);
  assert.equal(small.sku, "W-47");
  assert.equal(small.image, "/47.jpg");
  assert.equal(small.compareAt, undefined);
  assert.equal(compareItemFromDetail(detail, "nope").sku, "W-47", "unknown SKU: the default variant");
  // One variant without options is not a size choice; a missing name ("null" from the catalog read) is never a label.
  const single = postgresDetail();
  single.commerce.variants = [{ ...single.commerce.variants[1], options: {}, name: "null" }];
  assert.deepEqual(compareItemFromDetail(single, undefined).variants, []);
  assert.equal(compareItemFromDetail(single, undefined).sku, "W-51");
  single.commerce.variants.push({ ...single.commerce.variants[0], id: "v2", sku: "W-2", name: "Second" });
  assert.deepEqual(compareItemFromDetail(single, undefined).variants, [{ sku: "W-51", label: "W-51" }, { sku: "W-2", label: "Second" }]);
});

function legacyDetail(currency = "KZT") {
  const options = [{ id: "o-size", key: "size", name: "Size", display: "buttons", values: [{ id: "s42", key: "42", label: "42 mm" }, { id: "s46", key: "46", label: "46 mm" }] }];
  const variants = [
    { id: "a", sku: "L-42", title: "42", selections: { "o-size": "s42" }, price: 1000, stock: 1, status: "active", isDefault: false, imageIds: [] },
    { id: "b", sku: "L-46", title: "46", selections: { "o-size": "s46" }, price: 1200, originalPrice: 1500, stock: 1, status: "active", isDefault: true, imageIds: ["img2"] },
    { id: "c", sku: "L-DRAFT", title: "draft", selections: { "o-size": "s46" }, price: 1, stock: 1, status: "draft", isDefault: false, imageIds: [] },
  ];
  const images = [{ id: "img1", src: "/1.jpg", alt: "", source: "url" }, { id: "img2", src: "/2.jpg", alt: "", source: "url" }];
  return { id: "L1", title: "Legacy", subtitle: "", partNumber: "L-46", price: 1200, currency, breadcrumb: [], gallery: [{ view: "x", src: "/1.jpg" }], caseSizes: [], defaultCaseSize: "", versions: [], defaultVersion: "", colors: [], features: [],
    specs: [{ label: "Weight", value: "40 g" }], inTheBox: [], related: [], variantModel: { options, variants, images } };
}

test("compareItemFromDetail (legacy JSON) uses active variants, the default one, and the product's specs", () => {
  const item = compareItemFromDetail(legacyDetail(), undefined);
  assert.equal(item.sku, "L-46");
  assert.deepEqual(item.price, { major: 1200 });
  assert.deepEqual(item.compareAt, { major: 1500 });
  assert.equal(item.image, "/2.jpg");
  assert.deepEqual(item.variants, [{ sku: "L-42", label: "42 mm" }, { sku: "L-46", label: "46 mm" }]);
  assert.deepEqual(item.content, { specs: [{ label: "Weight", value: "40 g" }], specGroups: [] });
  const small = compareItemFromDetail(legacyDetail(), "l-42");
  assert.equal(small.sku, "L-42");
  assert.equal(small.image, "/1.jpg");
  assert.equal(compareItemFromDetail(legacyDetail(), "L-DRAFT").sku, "L-46", "a draft SKU is not reachable");
  assert.equal(compareItemFromDetail(legacyDetail("USD"), undefined).unconverted, true);
  // A plain product without variants.
  const plain = { ...legacyDetail(), variantModel: undefined, partNumber: "PLAIN", price: "abc" };
  const p = compareItemFromDetail(plain, "whatever");
  assert.equal(p.sku, "PLAIN");
  assert.deepEqual(p.variants, []);
  assert.equal(p.price, null, "an unreadable price is null, not a wrong number");
});

test("collectCompareItems drops unknown or failing products, caps at 5, and never throws", async () => {
  const reads = [];
  const read = async (id, locale) => {
    reads.push([id, locale]);
    if (id === "boom") throw new Error("source down");
    return id === "P1" ? postgresDetail() : id === "L1" ? legacyDetail() : undefined;
  };
  const errors = [];
  const items = await collectCompareItems(
    [{ productId: "P1", sku: "W-51" }, { productId: "missing" }, { productId: "boom" }, { productId: "L1" }, { productId: "P1" }, { productId: "P1", sku: "ignored-6th" }],
    "ru", read, (e) => errors.push(e));
  assert.deepEqual(items.map((i) => `${i.productId}:${i.sku}`), ["P1:W-51", "L1:L-46", "P1:W-47"]);
  assert.equal(reads.length, 5);
  assert.ok(reads.every(([, locale]) => locale === "ru"));
  assert.equal(errors.length, 1);
  assert.deepEqual(await collectCompareItems(undefined, "en", read), []);
  assert.deepEqual(await collectCompareItems([{ productId: "" }, { productId: 5 }], "en", read), []);
});
