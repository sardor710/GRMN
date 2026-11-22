// Owner 2026-11-22: the storefront top menu is built from Admin ▸ Categories. After the initial load it reads
// exactly like the built-in menu in every locale; renames, hiding and new categories change it; code-owned columns
// (Maps, Accessories & Plans, Discover…) stay, but their category links follow the category.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { startCatalogFixture } from "./catalog-helpers.mjs";
import { loadTaxonomy } from "../../src/server/catalog/taxonomy-load.ts";
import { buildMegaNav } from "../../src/server/catalog/mega-nav.ts";
import { megaNav, resolveMegaNav } from "../../src/lib/homepage-nav.ts";

const messages = Object.fromEntries(["en", "ru", "kk"].map(l => [l, JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url), "utf8"))]));
const translator = (locale) => (key) => key.split(".").reduce((node, part) => node?.[part], messages[locale]) ?? key;
let fx;
const q = (sql, args = []) => fx.q(sql, args);
const build = (locale) => buildMegaNav(fx.database.pool, locale, translator(locale));
const links = (items) => items.flatMap(item => (item.columns ?? []).flat().flatMap(group => group.links));
const productLinks = (items, label) => items.find(item => item.label === label).columns.flat().filter(group => group.heading === translator("en")("Header.groups.products") || group.heading === undefined).flatMap(group => group.links);

before(async () => { fx = await startCatalogFixture({ taxonomy: false }); });
after(async () => { await fx?.stop(); });

test("an empty taxonomy builds no menu, so the header keeps the built-in one", async () => {
  assert.equal(await build("en"), null);
});

test("parity: after the initial load the menu equals the built-in menu in en, ru and kk", async () => {
  const client = await fx.database.pool.connect();
  try { await loadTaxonomy(client, { assignProducts: false }); } finally { client.release(); }
  for (const locale of ["en", "ru", "kk"]) assert.deepEqual(await build(locale), resolveMegaNav(megaNav, translator(locale)), locale);
});

test("shared placement: Running sits under Smartwatches and Sports & Fitness, each at its own position", async () => {
  const items = await build("en");
  const smart = productLinks(items, "Smartwatches").map(link => link.href), sports = productLinks(items, "Sports & Fitness").map(link => link.href);
  assert.equal(smart.indexOf("/c/sports-fitness/running-smartwatches"), 6);
  assert.equal(sports.indexOf("/c/sports-fitness/running-smartwatches"), 0);
});

test("code-column links follow rename and hide", async () => {
  await q("UPDATE categories SET name='Watch Apps' WHERE key='apps'");
  await q("INSERT INTO category_translations(category_id,locale,name) SELECT id,'ru','Приложения для часов' FROM categories WHERE key='apps' ON CONFLICT (category_id,locale) DO UPDATE SET name=excluded.name");
  const en = links(await build("en")).filter(link => link.href === "/c/apps");
  assert.ok(en.length >= 4, "Apps is linked from several top items");
  assert.ok(en.every(link => link.label === "Watch Apps"));
  assert.ok(links(await build("ru")).filter(link => link.href === "/c/apps").every(link => link.label === "Приложения для часов"));
  const kkLabel = translator("kk")("Header.links.apps");
  assert.ok(links(await build("kk")).filter(link => link.href === "/c/apps").every(link => link.label === "Watch Apps" || link.label === kkLabel), "kk falls back to the English name or keeps its own");
  await q("UPDATE categories SET nav_visible=false WHERE key='apps'");
  assert.equal(links(await build("en")).filter(link => link.href === "/c/apps").length, 0);
  await q("UPDATE categories SET nav_visible=true WHERE key='apps'");
});

test("renaming a Products category renames it in every menu it is placed in; hiding removes it", async () => {
  await q("UPDATE categories SET name='Run & Race' WHERE key='sports-fitness/running-smartwatches'");
  const items = await build("en");
  for (const label of ["Smartwatches", "Sports & Fitness"]) assert.ok(productLinks(items, label).some(link => link.label === "Run & Race"), label);
  await q("UPDATE categories SET nav_visible=false WHERE key='sports-fitness/running-smartwatches'");
  assert.ok(!links(await build("en")).some(link => link.href === "/c/sports-fitness/running-smartwatches"));
});

test("a new top item with a subcategory gets one Products column; hidden top items are left out", async () => {
  const root = randomUUID(), child = randomUUID();
  await q("INSERT INTO categories(id,key,name,kind,slug,position) VALUES($1,'fitness-gear','Fitness Gear','catalog','fitness-gear',50)", [root]);
  await q("INSERT INTO categories(id,key,name,kind,slug,parent_id) VALUES($1,'fitness-gear/rollers','Rollers','catalog','fitness-gear/rollers',$2)", [child, root]);
  await q("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position) VALUES($1,$2,$3,0)", [randomUUID(), root, child]);
  const item = (await build("en")).at(-1);
  assert.equal(item.label, "Fitness Gear");
  assert.equal(item.href, "/c/fitness-gear");
  assert.deepEqual(item.columns, [[{ heading: "Products", links: [{ label: "Rollers", href: "/c/fitness-gear/rollers" }] }]]);
  await q("UPDATE categories SET nav_visible=false WHERE id=$1", [root]);
  assert.ok(!(await build("en")).some(entry => entry.label === "Fitness Gear"));
});
