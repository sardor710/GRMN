// Owner 2026-11-23: the public catalog reads a product by its code (/p/{code}); cards, accessories and devices carry it.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { createCatalogService } from "../../src/server/catalog/service.ts";

let f, api;
before(async () => { f = await startCatalogFixture(); api = createCatalogService({ pool: f.database.pool }); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const codeOf = async id => (await f.database.pool.query("SELECT product_code FROM products WHERE public_key=$1", [id])).rows[0].product_code;

test("getProductByCode returns the published product with its code; unknown, malformed or draft codes give null", async () => {
  const n = nextSerial();
  const watch = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const code = await codeOf(watch.id);
  assert.match(code, /^[0-9]+$/);
  const page = await api.getProductByCode(code, "default", "KZT");
  assert.equal(page.productCode, code);
  assert.equal(page.publicKey, watch.id);
  const byKey = await api.getProductByPublicKey(page.publicKey, "default", "KZT");
  assert.equal(byKey.productCode, code);
  assert.equal(await api.getProductByCode(page.publicKey, "default", "KZT"), null, "a public key is not a code");
  assert.equal(await api.getProductByCode("999999999999", "default", "KZT"), null);
  const draft = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-draft`, { status: "draft" }));
  assert.equal(await api.getProductByCode(await codeOf(draft.id), "default", "KZT"), null);
});

test("listing cards carry the product code", async () => {
  const n = nextSerial();
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n));
  const cards = await api.getProductsByKeys([(await f.database.pool.query("SELECT public_key FROM products WHERE public_key=$1", [band.id])).rows[0].public_key], { market: "default", locale: "en", displayCurrency: "KZT" });
  assert.equal(cards.items[0].productCode, await codeOf(band.id));
});

const keyOf = async editor => editor.id;

test("admin: a product code can be set, must be free, and shows in the editor; a garmin.com import keeps its id", async () => {
  const n = nextSerial();
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(n, { productCode: String(7000000 + n) }));
  assert.equal(saved.productCode, String(7000000 + n));
  const other = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-other`));
  assert.match(other.productCode, /^9[0-9]{7,}$/, "no code given: the sequence assigns one");
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...other, productCode: String(7000000 + n) }), e => e.status === 409 && /already used/.test(e.message));
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...other, productCode: "12a" }), e => e.status === 400);
  const imported = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-imp`, { source: { provider: "garmin", productId: String(6000000 + n), url: "https://www.garmin.com/en-US/p/1/", partNumber: "x", importedAt: "2026-11-23T00:00:00.000Z" } }));
  assert.equal(imported.productCode, String(6000000 + n));
});

test("admin: variant SEO per language is saved, kept when omitted, and shown on that variant's page in its language", async () => {
  const n = nextSerial(), base = deviceCommand(n);
  const command = { ...base, variants: base.variants.map(v => v.id === "v47b" ? { ...v, seo: { en: { title: "  Own EN title ", description: "" }, ru: { title: "Свой заголовок", description: "Своё описание" } } } : v) };
  const saved = await f.catalog.saveProduct(f.admin, command);
  const v47 = saved.variants.find(v => v.sku === `DEV-${n}-47-B`);
  assert.deepEqual(v47.seo, { en: { title: "Own EN title" }, ru: { title: "Свой заголовок", description: "Своё описание" } });
  // A save without `seo` keeps it; `seo: {}` clears it.
  const again = await f.catalog.saveProduct(f.admin, { ...saved, variants: saved.variants.map(({ seo, ...v }) => v) });
  assert.deepEqual(again.variants.find(v => v.sku === `DEV-${n}-47-B`).seo, v47.seo);
  const en = await api.getProductByCode(saved.productCode, "default", "KZT", "en");
  assert.deepEqual(en.variants.find(v => v.sku === `DEV-${n}-47-B`).seo, { title: "Own EN title" });
  assert.equal(en.variants.find(v => v.sku === `DEV-${n}-43-B`).seo, undefined);
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...again, variants: again.variants.map(v => ({ ...v, seo: { en: { title: "x".repeat(71) } } })) }), e => e.status === 400);
  const cleared = await f.catalog.saveProduct(f.admin, { ...again, variants: again.variants.map(v => ({ ...v, seo: {} })) });
  assert.equal(cleared.variants.find(v => v.sku === `DEV-${n}-47-B`).seo, undefined);
});
