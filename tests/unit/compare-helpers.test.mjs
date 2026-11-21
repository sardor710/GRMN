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
import { compareItemFromDetail, collectCompareItems, collectCompareResult } from "../../src/lib/compare/resolve.ts";

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
});

test("buildCompareRows drops rows blank in every column, and groups left empty", () => {
  const a = col([g("General", [["Lens", " "], ["Weight", "99 g"]]), g("Empty", [["Note", ""]])]);
  const b = col([g("General", [["Lens", ""]]), g("Empty", [["Note", "  "]])]);
  const groups = buildCompareRows([a, b], "Specs");
  assert.deepEqual(groups.map((x) => x.title), ["General"]);
  assert.deepEqual(groups[0].rows.map((r) => [r.label, r.values]), [["Weight", ["99 g", null]]]);
  // With "Show only differences" on, every remaining row has at least one value: no all-dash rows.
  assert.ok(groups.every((x) => x.rows.every((r) => r.values.some((v) => v !== null))));
  assert.deepEqual(buildCompareRows([{ specs: [{ label: "X", value: "" }] }], "Specs"), []);
});

test("buildCompareRows keeps a label repeated inside one group as separate rows, lined up by occurrence", () => {
  const a = col([g("Battery", [["Weight", "99 g"], ["Battery life", "29 d"], ["WEIGHT", "73 g"]])]);
  const b = col([g("battery", [["Weight", "78 g"], ["Weight:", "56 g"]])]);
  const c = col([g("Battery", [["Weight", "60 g"]])]);
  const [group] = buildCompareRows([a, b, c], "Specs");
  assert.deepEqual(group.rows.map((r) => [r.key, r.label, r.values]), [
    ["battery::weight", "Weight", ["99 g", "78 g", "60 g"]],
    ["battery::battery life", "Battery life", ["29 d", null, null]],
    ["battery::weight#2", "WEIGHT", ["73 g", "56 g", null]],
  ]);
});

test("isDifferentRow follows Garmin: equal everywhere hides, a blank column or any difference shows", () => {
  const row = (values) => ({ key: "k", label: "L", values });
  assert.equal(isDifferentRow(row(["10 ATM", "10 ATM", "10 ATM"])), false, "all equal");
  assert.equal(isDifferentRow(row(["10 ATM", null])), true, "one blank");
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
  // One variant without options is not a size choice; a variant without a name is labelled by its SKU.
  const single = postgresDetail();
  single.commerce.variants = [{ ...single.commerce.variants[1], options: {}, name: "" }];
  assert.deepEqual(compareItemFromDetail(single, undefined).variants, []);
  assert.equal(compareItemFromDetail(single, undefined).sku, "W-51");
  single.commerce.variants.push({ ...single.commerce.variants[0], id: "v2", sku: "W-2", name: "Second" });
  // C-b: the picker is sorted by label (numeric-aware), since PostgreSQL details carry no option positions.
  assert.deepEqual(compareItemFromDetail(single, undefined).variants, [{ sku: "W-2", label: "Second" }, { sku: "W-51", label: "W-51" }]);
  const sizes = postgresDetail();
  sizes.commerce.variants = ["51 mm", "42 mm", "47 mm"].map((size, i) => ({ ...sizes.commerce.variants[0], id: "s" + i, sku: "S-" + size, options: { size } }));
  assert.deepEqual(compareItemFromDetail(sizes, undefined).variants.map((v) => v.label), ["42 mm", "47 mm", "51 mm"]);
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
  // C-b: the picker follows the option value order, not the order the variants were stored in.
  const reversed = legacyDetail();
  reversed.variantModel.variants.reverse();
  assert.deepEqual(compareItemFromDetail(reversed, undefined).variants.map((v) => v.sku), ["L-42", "L-46"]);
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
  // P1 is asked for twice within the first five: it is read once.
  assert.deepEqual(reads.map(([id]) => id), ["P1", "missing", "boom", "L1"]);
  assert.ok(reads.every(([, locale]) => locale === "ru"));
  assert.equal(errors.length, 1);
  assert.deepEqual(await collectCompareItems(undefined, "en", read), []);
  assert.deepEqual(await collectCompareItems([{ productId: "" }, { productId: 5 }], "en", read), []);
});

test("collectCompareItems reads each product once, however many sizes of it are compared", async () => {
  const calls = new Map();
  const read = async (id) => { calls.set(id, (calls.get(id) ?? 0) + 1); return id === "P1" ? postgresDetail() : legacyDetail(); };
  const items = await collectCompareItems([{ productId: "P1", sku: "W-47" }, { productId: "P1", sku: "W-51" }, { productId: "L1", sku: "L-42" }, { productId: "P1" }, { productId: "L1" }], "en", read);
  // Final review I3: the bare P1 ref resolves to W-47, already compared, so it is one column, not two.
  assert.deepEqual(items.map((i) => i.sku), ["W-47", "W-51", "L-42", "L-46"]);
  assert.deepEqual(Object.fromEntries(calls), { P1: 1, L1: 1 });
  // A failing product is read once too, and every column of it is dropped (onError per column).
  let boom = 0; const errors = [];
  const failing = await collectCompareItems([{ productId: "B", sku: "1" }, { productId: "B", sku: "2" }], "en", async () => { boom++; throw new Error("down"); }, (e) => errors.push(e));
  assert.deepEqual(failing, []); assert.equal(boom, 1); assert.equal(errors.length, 2);
});

// Final review I2: detail reads bypass the listing limit and the pool is small (DATABASE_POOL_MAX 5), so a
// compare request never has more than two product reads in flight.
test("collectCompareItems never has more than 2 reads in flight and keeps the column order", async () => {
  let inFlight = 0, peak = 0;
  const read = async (id) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, id === "A" ? 15 : 3));
    inFlight--;
    return { ...legacyDetail(), id, variantModel: undefined, partNumber: id };
  };
  const items = await collectCompareItems(["A", "B", "C", "D", "E"].map((productId) => ({ productId })), "en", read);
  assert.equal(peak, 2);
  assert.deepEqual(items.map((i) => i.productId), ["A", "B", "C", "D", "E"]);
  // A failing read frees its slot too.
  inFlight = 0; peak = 0;
  const errors = [];
  const some = await collectCompareItems(["A", "X", "C"].map((productId) => ({ productId })), "en",
    async (id) => { if (id === "X") throw new Error("down"); return read(id); }, (error, ref) => errors.push(ref.productId));
  assert.deepEqual(some.map((i) => i.productId), ["A", "C"]);
  assert.deepEqual(errors, ["X"]);
  assert.ok(peak <= 2);
});

// Final review I3: a stored ref to a renamed SKU falls back to the default variant; when the shopper also added
// that default variant, the two must be one column (same product + resolved SKU, case-insensitive).
test("collectCompareItems dedupes columns on product + resolved SKU", async () => {
  const read = async (id) => (id === "P1" ? postgresDetail() : legacyDetail());
  const renamed = await collectCompareItems([{ productId: "P1", sku: "W-OLD" }, { productId: "L1" }, { productId: "P1", sku: "w-47" }], "en", read);
  assert.deepEqual(renamed.map((i) => `${i.productId}:${i.sku}`), ["P1:W-47", "L1:L-46"]);
  const cased = await collectCompareItems([{ productId: "P1", sku: "W-51" }, { productId: "P1", sku: "w-51" }, { productId: "P1", sku: "W-47" }], "en", read);
  assert.deepEqual(cased.map((i) => i.sku), ["W-51", "W-47"]);
});

// Review round: a read that fails is not "this product is gone". The result names the products whose read
// errored, so the page can keep them in the shopper's stored selection; unknown products are simply absent.
test("collectCompareResult tells unavailable (failed read) products apart from unknown ones", async () => {
  const read = async (id) => {
    if (id === "DOWN") throw new Error("database down");
    if (id === "GONE") return undefined;
    return { ...legacyDetail(), id, variantModel: undefined, partNumber: id };
  };
  const errors = [];
  const result = await collectCompareResult([{ productId: "A" }, { productId: "DOWN", sku: "1" }, { productId: "DOWN", sku: "2" }, { productId: "GONE" }], "en", read, (error, ref) => errors.push(ref.productId));
  assert.deepEqual(result.items.map((i) => i.productId), ["A"]);
  assert.deepEqual(result.unavailable, ["DOWN"]);
  assert.deepEqual(errors, ["DOWN", "DOWN"]);
  // collectCompareItems is the columns alone.
  assert.deepEqual((await collectCompareItems([{ productId: "A" }, { productId: "DOWN" }], "en", read)).map((i) => i.productId), ["A"]);
});
