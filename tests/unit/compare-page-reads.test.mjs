// Final review I2, per request: the compare route (generateMetadata + the page, which Next runs for one request)
// never has more than COMPARE_READ_CONCURRENCY product detail reads in flight. The real page module runs with
// its imports stubbed; getCompareItems is the real collectCompareItems over a counting reader.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as compareItems from "../../src/lib/compare/compare-items.ts";
import { collectCompareResult, COMPARE_READ_CONCURRENCY } from "../../src/lib/compare/resolve.ts";

const legacyDetail = (id) => ({ id, title: id, partNumber: id, price: "100", gallery: [], specs: [], specGroups: [] });

function loadPage(read) {
  const source = fs.readFileSync(new URL("../../src/app/[lang]/compare/page.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const translator = async () => (key) => key;
  const modules = {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next-intl/server": { getTranslations: translator },
    "@/components/SiteHeader": { SiteHeader: () => null },
    "@/components/SiteFooter": { SiteFooter: () => null },
    "@/components/CompareTool": { CompareTool: () => null },
    "@/lib/products": { catalogues: [{ slug: "wearables" }] },
    "@/lib/compare/compare-items": compareItems,
    "@/lib/compare/server": { getCompareItems: (items, locale) => collectCompareResult(items, locale, read) },
    "@/lib/compare/search": { searchCompareProducts: async () => null },
    "@/lib/catalog/variant-selection": { VARIANT_PARAM: "variant" },
    "@/server/cms/source": { cmsBackend: () => "json" },
    "@/i18n/seo": { ROUTE_LOCALES: { compare: ["en"] }, localizedSeo: () => ({}) },
    "@/i18n/page-locale": { initPageLocale: async () => "en", getMetaTranslations: translator },
  };
  const exports = {};
  new Function("require", "exports", code)((name) => {
    if (!(name in modules)) throw new Error(`unstubbed import ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

test("one compare request (metadata + page) keeps at most 2 detail reads in flight and reads each product once", async () => {
  let inFlight = 0, peak = 0;
  const calls = [];
  const read = async (id) => {
    calls.push(id);
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return legacyDetail(id);
  };
  const page = loadPage(read);
  const params = Promise.resolve({ lang: "en" });
  const searchParams = Promise.resolve({ item: ["A", "B", "C", "D", "E"] });
  // Next renders the metadata and the page for the same request concurrently.
  await Promise.all([page.generateMetadata({ params, searchParams }), page.default({ params, searchParams })]);
  assert.ok(peak <= COMPARE_READ_CONCURRENCY, `peak ${peak}`);
  assert.equal(peak, 2);
  assert.deepEqual(calls.sort(), ["A", "B", "C", "D", "E"], "generateMetadata reads no product; the page reads each once");
});

test("the page passes products whose read failed to CompareTool as unavailable (kept in the stored selection)", async () => {
  const page = loadPage(async (id) => { if (id === "B") throw new Error("down"); return legacyDetail(id); });
  const params = Promise.resolve({ lang: "en" });
  const tree = await page.default({ params, searchParams: Promise.resolve({ item: ["A", "B"] }) });
  const tool = (function find(node) {
    if (!node || typeof node !== "object") return undefined;
    if (node.props && "unavailable" in node.props) return node;
    for (const child of [].concat(node.props?.children ?? [])) { const hit = find(child); if (hit) return hit; }
    return undefined;
  })(tree);
  assert.deepEqual(tool?.props.unavailable, ["B"]);
  assert.deepEqual(tool.props.items.map((item) => item.productId), ["A"]);
});
