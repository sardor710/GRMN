// Owner 2026-11-22: Admin ▸ Categories. Menu categories (top items + placements), accessory categories and types,
// and series: create, rename in EN/RU/KK, hide, reorder, place under other top items, delete only when nothing is
// attached. Every write carries the taxonomy epoch it was read with; a stale one is refused.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startCatalogFixture, config, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { loadTaxonomy } from "../../src/server/catalog/taxonomy-load.ts";
import { createCatalogHTTP } from "../../src/server/cms/catalog-http.ts";

let f;
const q = (sql, args = []) => f.q(sql, args);
const tree = () => f.catalog.categories(f.admin);
const epoch = async () => (await tree()).epoch;
const rejectsWith = (promise, status, code) => assert.rejects(promise, error => { assert.equal(error.status, status, error.message); if (code) assert.equal(error.code, code); return true; });
const top = (t, key) => t.menu.find(item => item.key === key);

before(async () => {
  f = await startCatalogFixture({ taxonomy: false });
  const client = await f.database.pool.connect();
  try { await loadTaxonomy(client, { assignProducts: false }); } finally { client.release(); }
}, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

test("read: menu top items with placements and other links, accessories with types, series; viewers without catalog access are refused", async () => {
  const t = await tree();
  assert.match(t.epoch, /^\d+$/);
  assert.deepEqual(t.menu.map(item => item.key), ["wearables-smartwatches", "sports-fitness", "outdoor-recreation", "auto-home", "marine", "aviation", "promotions"]);
  const smart = top(t, "wearables-smartwatches");
  assert.equal(smart.placements[0].key, "wearables-smartwatches");
  assert.equal(smart.placements[0].label.en, "All Smartwatches");
  assert.ok(smart.others.some(node => node.key === "wearables-mapping"), "code-column categories are listed as other links");
  assert.equal(top(t, "sports-fitness").menuHref, "/c/sports-fitness/running-smartwatches");
  assert.equal(smart.name.ru.length > 0, true);
  const bands = t.accessories.find(node => node.key === "bands");
  assert.ok(bands.children.some(node => node.key === "bands/quickfit-22-mm"));
  assert.ok(t.accessories.some(node => node.key === "cables-chargers"));
  assert.ok(t.series.some(node => node.key === "watch-series/fenix"));
  await rejectsWith(f.catalog.categories(f.reader.headers), 403);
});

test("create rename hide reorder: a menu subcategory appears at the end of its top item and keeps key and slug on rename", async () => {
  let t = await f.catalog.createCategory(f.admin, await epoch(), { section: "menu-child", parentKey: "wearables-smartwatches", name: { en: "Trail Running", ru: "Трейлраннинг" } });
  const created = top(t, "wearables-smartwatches").placements.at(-1);
  assert.equal(created.key, "wearables-smartwatches/trail-running");
  assert.equal(created.name.en, "Trail Running");
  assert.equal(created.name.ru, "Трейлраннинг");
  t = await f.catalog.updateCategory(f.admin, t.epoch, "wearables-smartwatches/trail-running", { name: { en: "Trail", kk: "Трейл" }, navVisible: false });
  const renamed = top(t, "wearables-smartwatches").placements.at(-1);
  assert.deepEqual([renamed.key, renamed.slug, renamed.name.en, renamed.name.ru, renamed.name.kk, renamed.navVisible], ["wearables-smartwatches/trail-running", "wearables-smartwatches/trail-running", "Trail", "Трейлраннинг", "Трейл", false]);
  t = await f.catalog.updateCategory(f.admin, t.epoch, "wearables-smartwatches/trail-running", { name: { ru: "" } });
  assert.equal(top(t, "wearables-smartwatches").placements.at(-1).name.ru, null, "an empty RU name removes the translation");
  const order = t.menu.map(item => item.key);
  t = await f.catalog.orderCategories(f.admin, t.epoch, { parentKey: null, keys: [order[1], order[0], ...order.slice(2)] });
  assert.deepEqual(t.menu.slice(0, 2).map(item => item.key), [order[1], order[0]]);
  await f.catalog.orderCategories(f.admin, t.epoch, { parentKey: null, keys: order });
});

test("renaming a category clears its menu label override in that language", async () => {
  let t = await tree();
  assert.equal(top(t, "wearables-smartwatches").placements[0].label.en, "All Smartwatches");
  t = await f.catalog.updateCategory(f.admin, t.epoch, "wearables-smartwatches", { name: { en: "Watches" } });
  const own = top(t, "wearables-smartwatches").placements[0];
  assert.equal(own.label?.en, undefined);
  assert.ok(own.label?.ru, "other languages keep their override");
  await f.catalog.updateCategory(f.admin, t.epoch, "wearables-smartwatches", { name: { en: "Smartwatches" } });
});

test("placements set and shared: a subcategory can be added under another top item and ordered there", async () => {
  let t = await tree();
  const aviation = top(t, "aviation").placements.map(p => p.key);
  t = await f.catalog.setPlacements(f.admin, t.epoch, "aviation", { keys: ["sports-fitness/running-smartwatches", ...aviation] });
  assert.equal(top(t, "aviation").placements[0].key, "sports-fitness/running-smartwatches");
  assert.ok(top(t, "wearables-smartwatches").placements.some(p => p.key === "sports-fitness/running-smartwatches"), "still under Smartwatches");
  t = await f.catalog.setPlacements(f.admin, t.epoch, "aviation", { keys: aviation });
  assert.deepEqual(top(t, "aviation").placements.map(p => p.key), aviation);
  await rejectsWith(f.catalog.setPlacements(f.admin, t.epoch, "aviation", { keys: ["bands"] }), 400);
  await rejectsWith(f.catalog.setPlacements(f.admin, t.epoch, "sports-fitness/running-smartwatches", { keys: [] }), 400);
});

test("create series and accessory type", async () => {
  let t = await f.catalog.createCategory(f.admin, await epoch(), { section: "series", name: { en: "Fenix Pro" } });
  const series = t.series.find(node => node.key === "watch-series/fenix-pro");
  assert.ok(series);
  assert.equal(series.navVisible, false);
  t = await f.catalog.createCategory(f.admin, t.epoch, { section: "accessory-type", parentKey: "cables-chargers", name: { en: "Charging Clip (USB-C)" } });
  assert.ok(t.accessories.find(node => node.key === "cables-chargers").children.some(node => node.key === "cables-chargers/charging-clip-usb-c"));
  t = await f.catalog.createCategory(f.admin, t.epoch, { section: "accessory", name: { en: "Mounts" } });
  assert.ok(t.accessories.some(node => node.key === "mounts" && node.kind === "accessory"));
  t = await f.catalog.createCategory(f.admin, t.epoch, { section: "series", name: { en: "Fenix Pro" } });
  assert.ok(t.series.some(node => node.key === "watch-series/fenix-pro-2"), "a clashing slug gets a suffix");
  await rejectsWith(f.catalog.createCategory(f.admin, t.epoch, { section: "accessory-type", parentKey: "wearables-smartwatches", name: { en: "X" } }), 400);
  await rejectsWith(f.catalog.createCategory(f.admin, t.epoch, { section: "menu", name: { en: "   " } }), 400);
});

test("delete blocked with counts: products, children, type links, promotions", async () => {
  const n = nextSerial();
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { categories: [{ key: "bands/quickfit-22-mm", primary: true }] }));
  await f.catalog.saveProduct(f.admin, deviceCommand(n, { compatibility: { types: [{ categoryKey: "cables-chargers/charging-clip-usb-c", optionValueKeys: [] }] } }));
  const promotion = randomUUID();
  await q("INSERT INTO promotions(id,code,name,kind,percentage_bps,currency,status,scope) VALUES($1,$2,'Synthetic promo','percentage',1000,'KZT','draft','categories')", [promotion, `promo-${n}`]);
  await q("INSERT INTO promotion_categories(promotion_id,category_id) SELECT $1,id FROM categories WHERE key='heart-rate-monitors'", [promotion]);
  const e = await epoch();
  const blocked = async (key, field) => {
    await assert.rejects(f.catalog.deleteCategory(f.admin, e, key), error => { assert.equal(error.status, 409); assert.equal(error.code, "IN_USE"); assert.ok(error.counts[field] > 0, `${key}: ${JSON.stringify(error.counts)}`); return true; });
  };
  await blocked("bands/quickfit-22-mm", "products");
  await blocked("bands", "children");
  await blocked("cables-chargers/charging-clip-usb-c", "typeLinks");
  await blocked("heart-rate-monitors", "promotions");
  void band;
});

test("delete blocked by preset reference: the MARQ collection preset names series marq", async () => {
  await assert.rejects(f.catalog.deleteCategory(f.admin, await epoch(), "watch-series/marq"), error => error.status === 409 && error.counts.presets > 0);
});

test("delete succeeds when empty: the category, its translations and placements go", async () => {
  let t = await f.catalog.createCategory(f.admin, await epoch(), { section: "menu-child", parentKey: "aviation", name: { en: "Drones", ru: "Дроны" } });
  t = await f.catalog.deleteCategory(f.admin, t.epoch, "aviation/drones");
  assert.ok(!top(t, "aviation").placements.some(p => p.key === "aviation/drones"));
  assert.equal((await q("SELECT count(*)::int AS n FROM categories WHERE key='aviation/drones'")).rows[0].n, 0);
});

test("stale epoch is refused", async () => {
  const stale = await epoch();
  const fresh = await f.catalog.updateCategory(f.admin, stale, "aviation/helicopters", { name: { en: "Helicopters (rotor)" } });
  await rejectsWith(f.catalog.updateCategory(f.admin, stale, "aviation/helicopters", { name: { en: "Rotorcraft" } }), 409, "VERSION_CONFLICT");
  await f.catalog.updateCategory(f.admin, fresh.epoch, "aviation/helicopters", { name: { en: "Helicopters" } });
});

test("ru/kk names round-trip and catalog editors without write are refused", async () => {
  let t = await f.catalog.updateCategory(f.admin, await epoch(), "aviation/helicopters", { name: { ru: "Вертолёты", kk: "Тікұшақтар" } });
  const node = top(t, "aviation").others.find(n => n.key === "aviation/helicopters");
  assert.deepEqual(node.name, { en: "Helicopters", ru: "Вертолёты", kk: "Тікұшақтар" });
  await rejectsWith(f.catalog.updateCategory(f.reader.headers, t.epoch, "aviation/helicopters", { name: { en: "X" } }), 403);
});

test("HTTP: GET carries an ETag; writes need If-Match and send the key as a query parameter", async () => {
  const http = createCatalogHTTP({ service: f.catalog, baseURL: config.baseURL });
  const cookie = f.admin.get("cookie");
  const get = await http(new Request(`${config.baseURL}/api/admin/catalog/categories`, { headers: { cookie } }));
  assert.equal(get.status, 200);
  const body = await get.json();
  assert.equal(get.headers.get("etag"), `W/"taxonomy-${body.epoch}"`);
  const write = (ifMatch, en) => http(new Request(`${config.baseURL}/api/admin/catalog/categories?key=${encodeURIComponent("aviation/helicopters")}`, {
    method: "PATCH", headers: { cookie, origin: config.baseURL, "content-type": "application/json", ...(ifMatch ? { "if-match": ifMatch } : {}) }, body: JSON.stringify({ name: { en } }) }));
  assert.equal((await write(null, "Helicopters HTTP")).status, 428);
  const ok = await write(`W/"taxonomy-${body.epoch}"`, "Helicopters HTTP");
  assert.equal(ok.status, 200);
  assert.equal((await write(`W/"taxonomy-${body.epoch}"`, "Helicopters")).status, 409);
});

// Final review (2026-11-22): saving the edit dialog without changing a name keeps the menu's own wording; the
// series delete guard follows the preset's matching (seriesValue of the families entry), not the current name.
test("saving unchanged names keeps the menu label override (All Smartwatches)", async () => {
  let t = await tree();
  const root = top(t, "wearables-smartwatches"), before = root.placements[0].label;
  assert.ok(before?.ru, "the RU override exists (an earlier test renamed EN and cleared only that one)");
  t = await f.catalog.updateCategory(f.admin, t.epoch, root.key, { name: { en: root.name.en, ru: root.name.ru ?? "", kk: root.name.kk ?? "" }, navVisible: true });
  assert.deepEqual(top(t, "wearables-smartwatches").placements[0].label, before, "an unchanged save keeps every override");
});

test("series delete guard survives a rename: MARQ renamed is still blocked by the collection preset", async () => {
  let t = await f.catalog.updateCategory(f.admin, await epoch(), "watch-series/marq", { name: { en: "MARQ Collection" } });
  await assert.rejects(f.catalog.deleteCategory(f.admin, t.epoch, "watch-series/marq"), error => error.status === 409 && error.counts.presets > 0);
  t = await tree();
  await f.catalog.updateCategory(f.admin, t.epoch, "watch-series/marq", { name: { en: "MARQ" } });
});

// Owner 2026-11-24: the columns of each top item (headings + links) are a layout the admin edits whole.
test("menu layout: built-in columns are shown until the first save; add/delete/restore; bad links refused; reader refused", async () => {
  await q("INSERT INTO store_settings(id,maintenance_mode) VALUES(1,false) ON CONFLICT (id) DO NOTHING");
  let t = await tree();
  let smart = top(t, "wearables-smartwatches");
  assert.equal(smart.customized, false);
  assert.deepEqual(smart.layout.groups.map(group => group.id), ["products", "maps", "accessoriesPlans", "discover"]);
  assert.ok(smart.groups.find(group => group.id === "maps").links.some(link => link.external && /golf-courses/.test(link.href)));
  assert.ok(t.targets.some(target => target.key === "apps" && target.kind === "accessory"), "accessory categories can be link targets");
  const layout = structuredClone(smart.layout);
  layout.groups = layout.groups.filter(group => group.id !== "maps");
  layout.groups.push({ id: "it-h", column: 2, heading: { en: "IT picks" }, links: [{ id: "it-u", href: "/minisite/fenix-8", label: { en: "fēnix" } }, { id: "it-c", category: "sports-fitness/running-smartwatches" }] });
  t = await f.catalog.setMenuLayout(f.admin, t.epoch, "wearables-smartwatches", { layout });
  smart = top(t, "wearables-smartwatches");
  assert.equal(smart.customized, true);
  assert.equal(smart.groups.find(group => group.id === "it-h").links[1].label.en, "Running", "a category link without text is named after the category");
  assert.ok(!smart.groups.some(group => group.id === "maps"));
  assert.ok(smart.others.some(node => node.key === "wearables-mapping"), "a category keeps its own row when its link is deleted");
  for (const [bad, why] of [
    [{ ...layout, groups: layout.groups.filter(group => !group.products) }, "products heading kept"],
    [{ groups: [...layout.groups, { id: "x", column: 0, heading: { en: "X" }, links: [{ id: "x1", href: "//evil.example", label: { en: "x" } }] }] }, "protocol-relative"],
    [{ groups: [...layout.groups, { id: "x", column: 0, heading: { en: "X" }, links: [{ id: "x1", href: "/\\evil.example", label: { en: "x" } }] }] }, "backslash"],
    [{ groups: [...layout.groups, { id: "x", column: 0, heading: { en: "X" }, links: [{ id: "x1", href: "javascript:alert(1)", label: { en: "x" } }] }] }, "javascript"],
    [{ groups: [...layout.groups, { id: "x", column: 0, heading: { en: "X" }, links: [{ id: "x1", category: "no-such-category" }] }] }, "unknown category"],
    [{ groups: [...layout.groups, { id: "x", column: 3, heading: { en: "X" }, links: [] }] }, "column out of range"],
  ]) await rejectsWith(f.catalog.setMenuLayout(f.admin, t.epoch, "wearables-smartwatches", { layout: bad }), 400, "INVALID_INPUT").catch(error => { throw Error(`${why}: ${error.message}`); });
  await rejectsWith(f.catalog.setMenuLayout(f.reader.headers, t.epoch, "wearables-smartwatches", { layout }), 403);
  await rejectsWith(f.catalog.setMenuLayout(f.admin, "1", "wearables-smartwatches", { layout }), 409, "VERSION_CONFLICT");
  t = await f.catalog.setMenuLayout(f.admin, t.epoch, "wearables-smartwatches", { layout: null });
  assert.equal(top(t, "wearables-smartwatches").customized, false);
  assert.deepEqual((await q("SELECT presentation_config FROM store_settings WHERE id=1")).rows[0].presentation_config, {});
});

test("menu layout: deleting a top item drops its stored layout, so a new item with the same key starts fresh", async () => {
  let t = await f.catalog.createCategory(f.admin, await epoch(), { section: "menu", name: { en: "IT Layout Item" } });
  const item = t.menu.find(entry => entry.name.en === "IT Layout Item");
  assert.deepEqual(item.layout.groups.map(group => group.id), ["products"]);
  t = await f.catalog.setMenuLayout(f.admin, t.epoch, item.key, { layout: { groups: [...item.layout.groups, { id: "h1", column: 1, heading: { en: "Extra" }, links: [{ id: "l1", href: "https://example.com/", label: { en: "Example" } }] }] } });
  assert.ok((await q("SELECT presentation_config->'megaMenu'->'items' ? $1 AS has FROM store_settings WHERE id=1", [item.key])).rows[0].has);
  t = await f.catalog.deleteCategory(f.admin, t.epoch, item.key);
  assert.equal((await q("SELECT coalesce(presentation_config->'megaMenu'->'items' ? $1,false) AS has FROM store_settings WHERE id=1", [item.key])).rows[0].has, false);
  t = await f.catalog.createCategory(f.admin, t.epoch, { section: "menu", name: { en: "IT Layout Item" } });
  const again = t.menu.find(entry => entry.name.en === "IT Layout Item");
  assert.equal(again.key, item.key);
  assert.equal(again.customized, false);
  await f.catalog.deleteCategory(f.admin, t.epoch, again.key);
});
