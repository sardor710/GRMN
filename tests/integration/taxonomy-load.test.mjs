// Owner 2026-11-22: production starts from today's menu. loadTaxonomy inserts the seed tree with names and RU/KK
// translations taken from the menu messages, the Products-group placements in megaNav order, and files existing
// products under their categories, series and accessory types. It is idempotent and never overwrites edits.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { startCatalogFixture } from "./catalog-helpers.mjs";
import { loadTaxonomy } from "../../src/server/catalog/taxonomy-load.ts";
import { taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";
import { megaNav } from "../../src/lib/homepage-nav.ts";

const messages = Object.fromEntries(["en", "ru", "kk"].map(l => [l, JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url), "utf8"))]));
const msg = (locale, key) => key.split(".").reduce((node, part) => node?.[part], messages[locale]);
let fx;
const q = (sql, args = []) => fx.q(sql, args);
async function product(name, family, category, subCategory) {
  const id = randomUUID();
  await q("INSERT INTO products(id,public_key,name,slug,status,family,legacy_content) VALUES($1,$2,$3,$2,'published',$4,$5)",
    [id, `p-${id.slice(0, 8)}`, name, family, JSON.stringify({ category, subCategory })]);
  return id;
}
const categoriesOf = async (id) => (await q("SELECT c.key,pc.is_primary FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=$1 ORDER BY c.key", [id])).rows;
let fenix, forerunner, band, marq;

before(async () => {
  fx = await startCatalogFixture({ taxonomy: false });
  fenix = await product("fēnix® 9 Pro", "fēnix 9", "Outdoor Recreation", "Adventure Watches");
  forerunner = await product("Forerunner® 970", "Forerunner 970", "Sports & Fitness", "Running");
  band = await product("QuickFit® 22 Watch Bands", "QuickFit 22 Watch Bands", "Bands", "Bands");
  marq = await product("MARQ® Adventurer (Gen 3)", "MARQ Adventurer (Gen 3)", "", "");
});
after(async () => { await fx?.stop(); });

test("first load inserts the whole tree, RU/KK names from the menu messages, and placements in menu order", async () => {
  const client = await fx.database.pool.connect();
  let report;
  try { await client.query("BEGIN"); report = await loadTaxonomy(client, { assignProducts: true }); await client.query("COMMIT"); } finally { client.release(); }
  assert.equal(report.inserted, taxonomySeed.length);
  assert.equal((await q("SELECT count(*)::int AS n FROM categories")).rows[0].n, taxonomySeed.length);
  const name = async (key, locale) => locale === "en"
    ? (await q("SELECT name FROM categories WHERE key=$1", [key])).rows[0]?.name
    : (await q("SELECT t.name FROM category_translations t JOIN categories c ON c.id=t.category_id WHERE c.key=$1 AND t.locale=$2", [key, locale])).rows[0]?.name;
  for (const locale of ["en", "ru", "kk"]) {
    assert.equal(await name("wearables-smartwatches", locale), msg(locale, "Header.nav.smartwatches"), `${locale} top item`);
    assert.equal(await name("sports-fitness/running-smartwatches", locale), msg(locale, "Header.links.running"), `${locale} running`);
    assert.equal(await name("aviation/helicopters", locale), msg(locale, "Header.links.helicopters"), `${locale} code-column category`);
  }
  const smart = megaNav.find(item => item.labelKey === "Header.nav.smartwatches");
  const placements = (await q(`SELECT c.key,p.position,p.href,p.label FROM category_menu_placements p JOIN categories c ON c.id=p.category_id
    JOIN categories m ON m.id=p.menu_category_id WHERE m.key='wearables-smartwatches' ORDER BY p.position`)).rows;
  assert.equal(placements.length, smart.columns[0][0].links.length);
  assert.equal(placements[0].key, "wearables-smartwatches", "All Smartwatches is the root's own placement");
  assert.equal(placements[0].label.en, msg("en", "Header.links.allSmartwatches"));
  assert.equal(placements[0].label.ru, msg("ru", "Header.links.allSmartwatches"));
  const marqRow = placements.find(row => row.key === "wearables-smartwatches/marq-luxury-watch-collection");
  assert.equal(marqRow.href, "/minisite/marq");
  const running = placements.find(row => row.key === "sports-fitness/running-smartwatches");
  assert.equal(running.href, null);
  assert.equal(running.label, null);
  const sportsRunning = (await q(`SELECT p.position FROM category_menu_placements p JOIN categories c ON c.id=p.category_id JOIN categories m ON m.id=p.menu_category_id
    WHERE m.key='sports-fitness' AND c.key='sports-fitness/running-smartwatches'`)).rows[0];
  assert.equal(sportsRunning.position, 0, "Running is also placed first under Sports & Fitness");
  assert.equal((await q("SELECT menu_href FROM categories WHERE key='sports-fitness'")).rows[0].menu_href, "/c/sports-fitness/running-smartwatches");
  assert.equal((await q("SELECT menu_href FROM categories WHERE key='aviation'")).rows[0].menu_href, null);
});

test("products are filed under a primary category, their series and their accessory type", async () => {
  const keys = async (id) => (await categoriesOf(id)).map(row => row.key);
  assert.ok((await keys(fenix)).includes("watch-series/fenix"));
  assert.ok((await keys(forerunner)).includes("watch-series/forerunner"));
  assert.ok((await keys(marq)).includes("watch-series/marq"));
  assert.ok((await keys(band)).includes("bands/quickfit-22-mm"), "the band sits in its QuickFit 22 mm type");
  for (const id of [fenix, forerunner, band, marq]) assert.equal((await categoriesOf(id)).filter(row => row.is_primary).length, 1);
});

test("a second load changes nothing and keeps owner edits", async () => {
  await q("UPDATE categories SET name='Run' WHERE key='sports-fitness/running-smartwatches'");
  await q("DELETE FROM product_categories WHERE product_id=$1 AND NOT is_primary", [fenix]);
  const before = (await categoriesOf(fenix)).length;
  const client = await fx.database.pool.connect();
  let report;
  try { report = await loadTaxonomy(client, { assignProducts: true }); } finally { client.release(); }
  assert.deepEqual(report, { inserted: 0, translations: 0, placements: 0, assigned: 0 });
  assert.equal((await q("SELECT name FROM categories WHERE key='sports-fitness/running-smartwatches'")).rows[0].name, "Run");
  assert.equal((await categoriesOf(fenix)).length, before, "a product that already has categories is left alone");
});
