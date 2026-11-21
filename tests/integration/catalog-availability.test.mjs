// M4.5: availability from inventory_balances (on hand − reserved). Cards are "out of stock" when no active
// variant has free stock; the product page opens on an in-stock variant when the default is sold out and
// gets option definitions so out-of-stock values can be shown disabled.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { createCatalogService } from "../../src/server/catalog/service.ts";
import { catalogCardView } from "../../src/lib/public-catalog.ts";
import { chooseOptionValue, initialVariantId, optionValueStates } from "../../src/lib/variant-availability.ts";

let f, api;
before(async () => { f = await startCatalogFixture(); api = createCatalogService({ pool: f.database.pool }); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const detail = key => api.getProductByPublicKey(key, "default", "KZT");

test("default variant sold out: the page selects an in-stock variant; option values carry stock state", async () => {
  const n = nextSerial(), base = deviceCommand(n);
  // Default = 51 mm Black (0 in stock); 51 mm Gray has 7.
  const command = { ...base, variants: base.variants.map(v => ({ ...v, isDefault: v.id === "v51b", stock: v.id === "v51g" ? 7 : v.id === "v51b" ? 0 : 0 })) };
  const watch = await f.catalog.saveProduct(f.admin, command);
  const page = await detail(watch.id);
  const bySku = Object.fromEntries(page.variants.map(v => [v.sku, v]));
  assert.equal(page.defaultVariantId, bySku[`DEV-${n}-51-B`].id);
  assert.equal(page.selectedVariantId, bySku[`DEV-${n}-51-G`].id, "the only in-stock variant is preselected");
  assert.equal(page.availability, "available");
  assert.deepEqual(page.options.map(o => [o.key, o.name, o.display, o.values.map(v => v.label)]), [["case-size", "Case Size", "buttons", ["43 mm", "47 mm", "51 mm"]], ["color", "Color", "swatch", ["Black", "Gray"]]]);
  assert.equal(page.options[1].values[0].swatchColor, "#000000");

  const states = optionValueStates(page.options, page.variants, bySku[`DEV-${n}-51-G`]);
  assert.deepEqual(states[0].values.map(v => [v.label, v.available, v.selected]), [["43 mm", false, false], ["47 mm", false, false], ["51 mm", true, true]]);
  assert.deepEqual(states[1].values.map(v => [v.label, v.available, v.selected]), [["Black", false, false], ["Gray", true, true]]);
  // A ?sku= deep link to the sold-out default is honoured (the shopper sees it is out of stock).
  assert.equal(initialVariantId(page.variants, { defaultId: page.defaultVariantId, sku: `dev-${n}-51-b` }), bySku[`DEV-${n}-51-B`].id);
  assert.equal(chooseOptionValue(page.variants, bySku[`DEV-${n}-51-G`], "case-size", "51 mm").id, bySku[`DEV-${n}-51-G`].id);
});

test("cards: out of stock when no active variant has free stock; purchasable only when available", async () => {
  const n = nextSerial();
  const soldOut = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-out`, { stock: 0, categories: [{ key: "sensors", primary: true }] }));
  const stocked = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-in`, { stock: 3, categories: [{ key: "sensors", primary: true }] }));
  const { items } = await api.getProductsByKeys([soldOut.id, stocked.id], { market: "default", locale: "en", displayCurrency: "KZT" });
  const byKey = Object.fromEntries(items.map(card => [card.publicKey, card]));
  assert.equal(byKey[soldOut.id].availability, "out_of_stock");
  assert.equal(byKey[stocked.id].availability, "available");
  assert.equal(catalogCardView(byKey[soldOut.id]).purchasable, false);
  assert.equal(catalogCardView(byKey[stocked.id]).purchasable, true);
  // Category pages agree with the cards and offer the In stock facet.
  const sensors = await api.getCategoryPage("sensors", { pageSize: 100, explicit: true, filters: { inStock: true } });
  assert.ok(sensors.items.some(c => c.publicKey === stocked.id));
  assert.ok(!sensors.items.some(c => c.publicKey === soldOut.id));
  // Restocking through the ledger makes the card available.
  const restocked = await f.catalog.getProduct(f.admin, soldOut.id);
  await f.catalog.saveProduct(f.admin, { ...restocked, stock: 2, stockBaseline: 0 });
  assert.equal((await detail(soldOut.id)).availability, "available");
});
