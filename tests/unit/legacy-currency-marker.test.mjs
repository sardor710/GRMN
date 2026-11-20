// Task 5a.2 fix round 2: USD is an explicit marker. Every legacy-mode admin save stamps currency KZT (the admin
// price fields are "₸ KZT"), seed records are marked "USD" by a one-off script, browser carts from before the
// tenge change are not read back, and product JSON-LD never claims USD.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { withStorefrontPrices } from "../../src/lib/legacy-prices.ts";
import { readLocalCart, LEGACY_CART_KEY, LOCAL_CART_PRICE_VERSION, LOCAL_CART_PRICE_VERSION_KEY } from "../../src/lib/cart-client.ts";
import { componentFixture } from "../helpers/component-fixture.mjs";

// The real legacy store against a synthetic data file in temp/ (same pattern as cms-persistence.test.mjs).
function store(t, products) {
  const root = path.resolve("temp");
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "cms-currency-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "src/lib/cms/data.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = { products, activities: [] };
  fs.writeFileSync(file, JSON.stringify(data));
  const compiled = ts.transpileModule(fs.readFileSync("src/lib/cms/store.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const cms = {};
  new Function("require", "exports", "process", "console", compiled)(name => {
    if (name === "fs") return fs;
    if (name === "path") return path;
    if (name === "./data.json") return structuredClone(data);
    if (name === "./seed") return { initialCMSData: structuredClone(data) };
    if (name === "./product-variants") return { syncLegacyFields: product => product };
    if (name === "./homepage-schema") return { createDefaultHomepageConfig: () => ({ heroBanners: [], carousels: [], promoTiles: [], storyTiles: [], categoryTiles: [] }) };
    return {};
  }, cms, { cwd: () => directory, env: { CMS_BACKEND: "legacy" } }, { error() {} });
  return { cms, read: () => JSON.parse(fs.readFileSync(file, "utf8")).products };
}

test("an admin-saved legacy product is tenge (stamped KZT) and is not converted; a USD-marked seed record is", t => {
  const seed = { id: "1462801", name: "Forerunner 970", price: 749.99, currency: "USD" };
  const { cms, read } = store(t, [seed]);

  const created = cms.saveProduct({ name: "Admin watch", price: 1350000 });
  assert.equal(created.currency, "KZT", "a new admin product is stamped KZT");
  const repriced = cms.saveProduct({ id: "1462801", name: "Forerunner 970", price: 400000 });
  assert.equal(repriced.currency, "KZT", "repricing a USD seed record in the admin (₸ field) makes it tenge");
  assert.equal(cms.saveProduct({ id: "1462801", name: "Forerunner 970", price: 400000, currency: "USD" }).currency, "KZT", "a save cannot keep USD");
  assert.deepEqual(read().map(p => p.currency), ["KZT", "KZT"]);

  assert.deepEqual([withStorefrontPrices(created, 500).price, withStorefrontPrices(repriced, 500).price], [1350000, 400000], "admin tenge is never multiplied by the rate");
  const marked = withStorefrontPrices(seed, 500);
  assert.deepEqual([marked.price, marked.currency], [374995, "KZT"], "the explicit USD marker is converted");
});

test("the one-off marker script marks only USD-scale records, adds only currency, and is idempotent", t => {
  const dir = fs.mkdtempSync(path.join(path.resolve("temp"), "mark-usd-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "data.json");
  const products = [
    { id: "seed", name: "Seed", price: 749.99 },
    { id: "kzt", name: "Admin", price: 1350000, currency: "KZT" },
    { id: "imported-source", name: "Imp", price: 224995, source: { provider: "garmin" } },
    { id: "imported-variant", name: "Imp2", price: 224995, variants: [{ id: "v", price: 224995, sourcePrice: { currency: "USD", list: 449.99, rateKztPerUsd: 500 } }] },
  ];
  fs.writeFileSync(file, JSON.stringify({ settings: { x: 1 }, products }, null, 2).replace(/\n/g, "\r\n"));
  const run = () => execFileSync(process.execPath, ["scripts/mark-legacy-usd-prices.mjs", file], { encoding: "utf8" });
  assert.match(run(), /marked 1 product\(s\) currency "USD": seed/);
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(after.products[0], { ...products[0], currency: "USD" });
  assert.deepEqual(after.products.slice(1), products.slice(1), "no other record changes");
  assert.deepEqual(after.settings, { x: 1 });
  assert.ok(fs.readFileSync(file, "utf8").includes("\r\n"), "line endings are kept");
  assert.match(run(), /marked 0 product/);
});

test("the committed data.json marks exactly the 19 USD-scale seed records", () => {
  const data = JSON.parse(fs.readFileSync("src/lib/cms/data.json", "utf8"));
  const usd = data.products.filter(p => p.currency === "USD").map(p => p.id);
  assert.equal(usd.length, 19);
  for (const p of data.products.filter(p => p.currency === "USD")) assert.ok(!p.source && !(p.variants ?? []).some(v => v.sourcePrice), `${p.id} is not imported`);
  assert.ok(data.products.filter(p => p.currency !== "USD").every(p => !p.currency), "imported records are left untouched");
});

test("a browser cart saved before the tenge prices is not read back; one written under the price version is", () => {
  const lines = JSON.stringify([{ id: "1462801", name: "Forerunner 970", price: 749.99, qty: 1 }]);
  const storage = values => ({ getItem: key => values[key] ?? null });
  assert.deepEqual(readLocalCart(storage({ [LEGACY_CART_KEY]: lines })), [], "pre-change USD-scale lines would show as ₸");
  assert.deepEqual(readLocalCart(storage({ [LEGACY_CART_KEY]: lines, [LOCAL_CART_PRICE_VERSION_KEY]: "old" })), []);
  assert.equal(readLocalCart(storage({ [LEGACY_CART_KEY]: lines, [LOCAL_CART_PRICE_VERSION_KEY]: LOCAL_CART_PRICE_VERSION })).length, 1);
  assert.deepEqual(readLocalCart(storage({ [LEGACY_CART_KEY]: "{bad", [LOCAL_CART_PRICE_VERSION_KEY]: LOCAL_CART_PRICE_VERSION })), []);
});

test("product JSON-LD is tenge only and omits the price of an unconverted legacy product instead of claiming USD", () => {
  const fixture = componentFixture("src/components/seo/JsonLd.tsx", { modules: { "@/lib/json-ld": { serializeJsonLd: value => JSON.stringify(value) }, "@/i18n/seo": { SITE_URL: "https://shop.test", absoluteUrl: p => "https://shop.test" + p } } });
  const base = { id: "1462801", name: "Forerunner 970", sku: "S", image: "/i.jpg", description: "", category: "", stock: 1 };
  const offer = props => JSON.parse(fixture.render({ url: "https://shop.test/p/1462801", locale: "en", ...props }).props.dangerouslySetInnerHTML.__html).offers;
  assert.deepEqual([offer({ product: { ...base, price: 374995, currency: "KZT" } }).priceCurrency, offer({ product: { ...base, price: 374995, currency: "KZT" } }).price], ["KZT", 374995]);
  assert.equal(offer({ product: { ...base, price: 1350000 } }).priceCurrency, "KZT", "no currency is tenge, never a USD fallback");
  const unconverted = offer({ product: { ...base, price: 749.99, currency: "USD" } });
  assert.equal("price" in unconverted, false);
  assert.equal("priceCurrency" in unconverted, false);
  assert.doesNotMatch(JSON.stringify(unconverted), /USD/);
});
