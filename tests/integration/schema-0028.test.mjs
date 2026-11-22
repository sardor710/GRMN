// Migration 0028 (owner 2026-11-22, category manager): RU/KK category names, ordered menu placements (one
// category under several top menu items), a fixed top-item link, and live device → accessory-type links.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startCatalogFixture } from "./catalog-helpers.mjs";

let fx;
const q = (sql, args = []) => fx.q(sql, args);
const id = async (key) => (await q("SELECT id FROM categories WHERE key=$1", [key])).rows[0].id;
const epoch = async () => BigInt((await q("SELECT epoch FROM catalog_taxonomy_guard WHERE id=1")).rows[0].epoch);
async function rejects(sql, args, code) {
  await assert.rejects(q(sql, args), (error) => { assert.equal(error.code, code, error.message); return true; });
}
async function product(name) {
  const pid = randomUUID();
  await q("INSERT INTO products(id,public_key,name,slug,status) VALUES($1,$2,$3,$2,'draft')", [pid, `p-${pid.slice(0, 8)}`, name]);
  return pid;
}

before(async () => { fx = await startCatalogFixture(); });
after(async () => { await fx?.stop(); });

test("category_translations: ru/kk only, non-blank, one per locale, cascade with the category, bumps the epoch", async () => {
  const running = await id("sports-fitness/running-smartwatches");
  const start = await epoch();
  await q("INSERT INTO category_translations(category_id,locale,name) VALUES($1,'ru','Бег'),($1,'kk','Жүгіру')", [running]);
  assert.ok(await epoch() > start, "translations bump the taxonomy epoch");
  await rejects("INSERT INTO category_translations(category_id,locale,name) VALUES($1,'en','Running')", [running], "23514");
  await rejects("INSERT INTO category_translations(category_id,locale,name) VALUES($1,'de','Laufen')", [running], "23514");
  await rejects("UPDATE category_translations SET name='  ' WHERE category_id=$1 AND locale='ru'", [running], "23514");
  await rejects("INSERT INTO category_translations(category_id,locale,name) VALUES($1,'ru','Бег 2')", [running], "23505");
  const temp = randomUUID();
  await q("INSERT INTO categories(id,key,name,kind,slug) VALUES($1,'temp-translated','Temp','catalog','temp-translated')", [temp]);
  await q("INSERT INTO category_translations(category_id,locale,name) VALUES($1,'ru','Врем')", [temp]);
  await q("DELETE FROM categories WHERE id=$1", [temp]);
  assert.equal((await q("SELECT count(*)::int AS n FROM category_translations WHERE category_id=$1", [temp])).rows[0].n, 0);
});

test("category_menu_placements: one row per (menu, category), own position, optional href and en/ru/kk label, epoch bump", async () => {
  const smart = await id("wearables-smartwatches"), sports = await id("sports-fitness"), running = await id("sports-fitness/running-smartwatches");
  const start = await epoch();
  await q("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position) VALUES($1,$2,$3,6),($4,$5,$3,0)", [randomUUID(), smart, running, randomUUID(), sports]);
  assert.ok(await epoch() > start, "placements bump the taxonomy epoch");
  const rows = (await q("SELECT menu_category_id,position FROM category_menu_placements WHERE category_id=$1 ORDER BY position", [running])).rows;
  assert.deepEqual(rows.map(r => r.position), [0, 6], "the same category sits under two menus at its own position");
  await rejects("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position) VALUES($1,$2,$3,1)", [randomUUID(), smart, running], "23505");
  await rejects("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position) VALUES($1,$2,$3,-1)", [randomUUID(), smart, await id("sports-fitness/golf-gps-devices-smartwatches")], "23514");
  await rejects("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position,label) VALUES($1,$2,$2,0,'{\"de\":\"x\"}')", [randomUUID(), smart], "23514");
  await rejects("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position,label) VALUES($1,$2,$2,0,'\"x\"')", [randomUUID(), smart], "23514");
  await q("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position,label,href) VALUES($1,$2,$2,0,'{\"en\":\"All Smartwatches\"}',NULL)", [randomUUID(), smart]);
});

test("categories.menu_href is an optional fixed link for a top menu item", async () => {
  await q("UPDATE categories SET menu_href='/c/sports-fitness/running-smartwatches' WHERE key='sports-fitness'");
  assert.equal((await q("SELECT menu_href FROM categories WHERE key='sports-fitness'")).rows[0].menu_href, "/c/sports-fitness/running-smartwatches");
  assert.equal((await q("SELECT menu_href FROM categories WHERE key='aviation'")).rows[0]?.menu_href ?? null, null);
});

test("product_compatibility_types: device → accessory category or accessory type; unique per scope; restrict deletes", async () => {
  const device = await product("Synthetic fēnix");
  const qf22 = await id("bands/quickfit-22-mm"), chargers = await id("cables-chargers");
  await q("INSERT INTO product_compatibility_types(id,device_product_id,category_id,position) VALUES($1,$2,$3,0),($4,$2,$5,1)", [randomUUID(), device, qf22, randomUUID(), chargers]);
  await rejects("INSERT INTO product_compatibility_types(id,device_product_id,category_id,position) VALUES($1,$2,$3,2)", [randomUUID(), device, qf22], "23505");
  await rejects("INSERT INTO product_compatibility_types(id,device_product_id,category_id,position) VALUES($1,$2,$3,0)", [randomUUID(), device, await id("wearables-smartwatches")], "23514");
  await rejects("INSERT INTO product_compatibility_types(id,device_product_id,category_id,position) VALUES($1,$2,$3,0)", [randomUUID(), device, await id("watch-series/fenix")], "23514");
  await rejects("DELETE FROM categories WHERE id=$1", [qf22], "23001"); // ON DELETE RESTRICT
  await rejects("INSERT INTO product_compatibility_types(id,device_product_id,category_id,device_option_value_id,position) VALUES($1,$2,$3,$4,0)", [randomUUID(), device, chargers, randomUUID()], "23503");
});
