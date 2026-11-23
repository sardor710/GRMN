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
