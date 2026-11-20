// Task 2.5: the Garmin import fills in each variant's own Specs, Overview and In the box — only the blocks
// that differ from the product-level content. No network: fixtures and an injected fetcher.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractBootstrap, parseGarminProduct, parseGarminTabs, variantContentOverrides } from "../../src/lib/import/garmin-parse.js";
import { fillVariantContentFromPages, fitDraftToSaveLimit } from "../../src/lib/import/garmin-variant-content.ts";
import { PRODUCT_HTML_FIELDS } from "../../src/lib/cms/product-input.js";

const fixture = (name) => fs.readFileSync(new URL(`../fixtures/garmin/${name}.html`, import.meta.url), "utf8");
const SOURCE = "https://www.garmin.com/en-US/p/1953453";
const NOW = "2026-11-20T00:00:00.000Z";
const parse = (html) => parseGarminProduct(html, { sourceUrl: SOURCE, rateKztPerUsd: 500, now: NOW });
/** Re-serialize a fixture after editing its bootstrap (keeps only the data the importer reads). */
const editBootstrap = (html, edit) => {
  const boot = extractBootstrap(html);
  edit(boot);
  return `<script>var GarminAppBootstrap = ${JSON.stringify(boot)};</script>`;
};
const flat = (groups) => groups.flatMap((g) => g.items.map((i) => `${g.title}|${i.label}=${i.value}`));
const variant = (product, sku) => product.variants.find((v) => v.sku === sku);

// fēnix 9: the default sku 010-04337-00 is the 51 mm watch; 010-04336-25 is a 47 mm one (checked 2026-11-20).
const MM47 = "010-04336-25";
const SAME_AS_DEFAULT = "010-04337-10"; // 51 mm, other colour: same tabs as the default sku

test("variant with different specs gets an own specGroups override", () => {
  const { product } = parse(fixture("fenix9"));
  const v = variant(product, MM47);
  assert.ok(v.content?.specGroups, "the 47 mm variant owns its specs");
  assert.ok(flat(v.content.specGroups).includes("General|Weight=78 g (case only: 56 g)"));
  assert.ok(flat(product.specGroups).includes("General|Weight=99 g (case only: 73 g)"), "product keeps the default (51 mm) specs");
  assert.equal(variant(product, "010-04337-00").content, undefined, "the default variant never gets an override");
  // Flat-spec readers get the variant's values too.
  assert.deepEqual(v.content.specs, v.content.specGroups.flatMap((g) => g.items));
  // Blocks that are equal are not stored: the 47 mm in-the-box matches the 51 mm one on garmin.com.
  for (const v2 of product.variants.filter((x) => x.content)) {
    for (const key of Object.keys(v2.content)) assert.ok(["specs", "specGroups", "overviewHtml", "inTheBox"].includes(key));
    assert.equal("specs" in v2.content, "specGroups" in v2.content, "specs is owned exactly when specGroups is");
    if (v2.content.inTheBox) assert.notDeepEqual(v2.content.inTheBox, product.inTheBox);
    if (v2.content.specGroups) assert.notDeepEqual(flat(v2.content.specGroups), flat(product.specGroups));
  }
});

test("identical tabs store no override", () => {
  const { product } = parse(fixture("fenix9"));
  assert.equal(variant(product, SAME_AS_DEFAULT).content, undefined);
  // Normalized comparison: whitespace-only differences are not a difference; order is.
  const base = { specGroups: [{ title: "General", items: [{ label: "Weight", value: "99 g" }, { label: "Size", value: "51 mm" }] }], overviewHtml: "<p>Hi</p>", inTheBox: ["Watch", "Cable"] };
  const spaced = { specGroups: [{ title: " General ", items: [{ label: "Weight ", value: " 99  g" }, { label: "Size", value: "51 mm" }] }], overviewHtml: "  <p>Hi</p>\n", inTheBox: [" Watch", "Cable "] };
  assert.equal(variantContentOverrides(base, spaced), undefined);
  // Whitespace between tags is not a difference either.
  const twoParas = { ...base, overviewHtml: "<p>A</p><p>B</p>" };
  assert.equal(variantContentOverrides(twoParas, { ...twoParas, overviewHtml: "<p>A</p>\n  <p>B</p>" }), undefined);
  assert.deepEqual(variantContentOverrides(twoParas, { ...twoParas, overviewHtml: "<p>A</p><p>C</p>" }), { overviewHtml: "<p>A</p><p>C</p>" });
  const reordered = { ...base, inTheBox: ["Cable", "Watch"] };
  assert.deepEqual(variantContentOverrides(base, reordered), { inTheBox: ["Cable", "Watch"] });
  // A block the variant's page doesn't carry is inherited, never stored as an own empty block.
  assert.equal(variantContentOverrides(base, { specGroups: [], overviewHtml: "", inTheBox: [] }), undefined);
});

test("fetch failure yields a warning and no override", async () => {
  // Pages whose bootstrap lacks a sku's tabs: the importer reads <productUrl>?sku=<sku> for those skus.
  const html = editBootstrap(fixture("fenix9"), (boot) => {
    delete boot.skus[MM47].tabs;
    delete boot.skus[SAME_AS_DEFAULT].tabs;
  });
  const { product, warnings, variantSkusWithoutTabs } = parse(html);
  assert.deepEqual([...variantSkusWithoutTabs].sort(), [MM47, SAME_AS_DEFAULT].sort());
  assert.equal(variant(product, MM47).content, undefined);

  const asked = [];
  const fetchHtml = async (url) => {
    asked.push(url.href);
    if (url.searchParams.get("sku") === MM47) return fixture("fenix9-47mm-sku-page");
    throw new Error("garmin.com answered HTTP 503");
  };
  warnings.push(...(await fillVariantContentFromPages(product, variantSkusWithoutTabs, new URL(`${SOURCE}?foo=1`), fetchHtml)));

  assert.deepEqual(asked.sort(), [`${SOURCE}?sku=${MM47}`, `${SOURCE}?sku=${SAME_AS_DEFAULT}`].sort());
  assert.equal(variant(product, SAME_AS_DEFAULT).content, undefined, "failed fetch stores no override");
  assert.ok(warnings.some((w) => w.includes(SAME_AS_DEFAULT) && /HTTP 503/.test(w)), warnings.join("\n"));
  // The fetched page keeps garmin.com's own default sku; the importer reads the requested sku's tabs.
  assert.ok(flat(variant(product, MM47).content.specGroups).includes("General|Weight=78 g (case only: 56 g)"));
});

test("a fetched page without the variant, or an off-host product link, adds a warning and no override", async () => {
  const { product } = parse(fixture("fenix9"));
  const other = product.variants.find((v) => !v.isDefault && !v.content);
  const warnings = await fillVariantContentFromPages(product, [other.sku], new URL(SOURCE), async () => fixture("fenix9-47mm-sku-page"));
  assert.equal(other.content, undefined);
  assert.ok(warnings.some((w) => w.includes(other.sku)), warnings.join("\n"));

  let called = false;
  const off = await fillVariantContentFromPages(product, [other.sku], new URL("https://evil.example.com/p/1"), async () => { called = true; return ""; });
  assert.equal(called, false, "only garmin.com hosts are fetched");
  assert.equal(off.length, 1);
});

test("variant pages are fetched at most 3 at a time", async () => {
  const { product } = parse(fixture("fenix9"));
  const skus = product.variants.filter((v) => !v.isDefault).slice(0, 7).map((v) => v.sku);
  let inFlight = 0, peak = 0;
  await fillVariantContentFromPages(product, skus, new URL(SOURCE), async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return fixture("fenix9-47mm-sku-page");
  });
  assert.equal(peak, 3);
});

test("the variant-page budget aborts fetches already in flight", async () => {
  const { product } = parse(fixture("fenix9"));
  const sku = product.variants.find((v) => !v.isDefault && !v.content).sku;
  const started = Date.now();
  let aborted = false;
  const warnings = await fillVariantContentFromPages(product, [sku], new URL(SOURCE), (_url, signal) =>
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); })),
  { budgetMs: 50, pageTimeoutMs: 60_000 });
  assert.ok(aborted, "the in-flight fetch is aborted by the budget, not by its 60 s page timeout");
  assert.ok(Date.now() - started < 5_000);
  assert.equal(variant(product, sku).content, undefined);
  assert.ok(warnings.some((w) => w.includes(sku)), warnings.join("\n"));
});

test("an oversized draft drops variant overviews largest-first to fit the save limit", () => {
  // Synthetic: a 60-variant family whose variants own a ~36 KB overview each (≈2.1 MB); limit 1 MiB here.
  const ov = (n) => `<p>${"x".repeat(n)}</p>`;
  const groups = [{ title: "General", items: [{ label: "Weight", value: "78 g" }] }];
  const variants = Array.from({ length: 60 }, (_, i) => ({
    id: `var-${i}`, sku: `SKU-${i}`, title: `Variant ${i}`, isDefault: i === 0, imageIds: [],
    ...(i === 0 ? {} : { content: { overviewHtml: ov(36_000 + i * 10), ...(i % 2 ? { specGroups: groups, specs: groups[0].items, inTheBox: ["Watch"] } : {}) } }),
  }));
  const before = new Map(variants.map((v) => [v.id, v.content?.overviewHtml?.length ?? 0]));
  const draft = { name: "Big", sku: "GARMIN-1", price: 1, overviewHtml: ov(1000), variants };
  const limit = 1024 * 1024;
  const warnings = fitDraftToSaveLimit(draft, limit);

  assert.ok(new TextEncoder().encode(JSON.stringify(draft)).byteLength <= limit);
  const dropped = variants.filter((v) => !v.isDefault && v.content?.overviewHtml === undefined);
  const kept = variants.filter((v) => v.content?.overviewHtml !== undefined);
  assert.ok(dropped.length > 0 && kept.length > 0);
  assert.equal(warnings.length, dropped.length, "one warning per dropped overview");
  assert.equal(warnings[0], "Overview for Variant 59 kept the product overview to fit the save limit.");
  assert.ok(Math.max(...kept.map((v) => before.get(v.id))) < Math.min(...dropped.map((v) => before.get(v.id))), "largest first");
  for (const v of variants.filter((_, i) => i % 2 === 1)) {
    assert.deepEqual(v.content.specGroups, groups, "specs are kept");
    assert.deepEqual(v.content.inTheBox, ["Watch"], "in-the-box is kept");
  }
  for (const v of dropped.filter((x) => Number(x.id.slice(4)) % 2 === 0)) assert.equal("content" in v, false, "an emptied override is removed (inherit)");

  // Under the limit nothing changes.
  const small = { name: "S", sku: "S", price: 1, variants: [{ id: "a", sku: "a", title: "A", content: { overviewHtml: ov(10) } }] };
  assert.deepEqual(fitDraftToSaveLimit(small, limit), []);
  assert.equal(small.variants[0].content.overviewHtml, ov(10));
});

test("imported variant overviewHtml is sanitized", async () => {
  const evil = `<pc-copy title="Own &lt;b&gt;47&lt;/b&gt;" description="&lt;img src=x onerror=alert(1)&gt;&lt;a href='javascript:alert(1)'&gt;go&lt;/a&gt;"></pc-copy><script>alert(1)</script>`;
  const html = editBootstrap(fixture("fenix9"), (boot) => { boot.skus[MM47].tabs.overviewTab.content = evil; });
  const { product } = parse(html);
  const own = variant(product, MM47).content?.overviewHtml;
  assert.equal(typeof own, "string");
  assert.match(own, /Own/);
  assert.doesNotMatch(own, /<script|onerror|javascript:/i);
  assert.equal(own, PRODUCT_HTML_FIELDS.overviewHtml(own), "already passes the cms.save sanitizer unchanged");

  // The fetched-page path uses the same parser and sanitizer.
  const page = editBootstrap(fixture("fenix9-47mm-sku-page"), (boot) => { boot.skus[MM47].tabs.overviewTab.content = evil; });
  const tabs = parseGarminTabs(page, { sku: MM47 });
  assert.doesNotMatch(tabs.overviewHtml, /<script|onerror|javascript:/i);
  assert.equal(tabs.overviewHtml, PRODUCT_HTML_FIELDS.overviewHtml(tabs.overviewHtml));
});

test("parseGarminTabs reads the page default without a sku and returns null for a sku the page lacks", () => {
  const page = fixture("fenix9-47mm-sku-page");
  const def = parseGarminTabs(page);
  assert.ok(flat(def.specGroups).includes("General|Weight=99 g (case only: 73 g)"));
  assert.ok(def.overviewHtml.length > 0 && def.inTheBox.length > 0);
  assert.equal(parseGarminTabs(page, { sku: "000-00000-00" }), null);
});
