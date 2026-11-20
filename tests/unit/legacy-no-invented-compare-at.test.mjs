// Follow-up F-a: legacy JSON mode never invents a compare-at price (it used to store price * 1.1, a fake sale).
// Compiles the real legacy store against a synthetic disk fixture, like cms-persistence.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function legacyStore(t) {
  const root = path.resolve("temp");
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "legacy-compare-at-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "src/lib/cms/data.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = { products: [], activities: [] };
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
  return cms;
}

test("legacy saveProduct without originalPrice stores no compareAt; an explicit one is kept", t => {
  const cms = legacyStore(t);
  const plain = cms.saveProduct({ name: "Plain", sku: "PLAIN-1", price: 1000 });
  assert.equal(plain.originalPrice, undefined);
  assert.equal(cms.getProducts().find(p => p.id === plain.id).originalPrice, undefined);
  const sale = cms.saveProduct({ name: "Sale", sku: "SALE-1", price: 1000, originalPrice: 1500 });
  assert.equal(sale.originalPrice, 1500);
});
