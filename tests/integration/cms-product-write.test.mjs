// M2: the PostgreSQL CMS product writer saves the whole catalog shape in one transaction
// (product row, legacy_content, options/variants/prices/media/stock via the ledger, categories,
// relations) with optimistic versions and case-insensitive SKU uniqueness.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { parseGarminProduct } from "../../src/lib/import/garmin-parse.js";
import { reconcileStock } from "../../src/server/inventory/service.ts";

let f;
before(async () => { f = await startCatalogFixture(); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const rows = async (sql, args = []) => (await f.q(sql, args)).rows;
const internal = async key => (await rows("SELECT id FROM products WHERE public_key=$1", [key]))[0].id;
const balances = async productId => Object.fromEntries((await rows("SELECT v.sku,b.on_hand FROM product_variants v JOIN inventory_balances b ON b.variant_id=v.id WHERE v.product_id=$1 ORDER BY v.sku", [productId])).map(r => [r.sku, r.on_hand]));
const movements = async productId => rows("SELECT m.reason,m.delta_on_hand,m.source_reference,m.actor_user_id,v.sku FROM stock_movements m JOIN product_variants v ON v.id=m.variant_id WHERE v.product_id=$1 ORDER BY m.created_at,m.id", [productId]);

test("creates a simple product with categories, relations, typed in-the-box items and opening stock via the ledger", async () => {
  const n = nextSerial();
  const target = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-target`));
  const saved = await f.catalog.saveProduct(f.admin, simpleCommand(n, {
    categories: [{ key: "bands" }, { key: "bands/quickfit-22-mm", primary: true }],
    relations: { related: [target.id], upsell: [] },
    inTheBox: ["Band", { label: "Pins", image: "/uploads/pins.jpg" }],
    overviewHtml: '<p class="ov-lead">Hello</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
  }));
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.categories, [{ key: "bands/quickfit-22-mm", primary: true }, { key: "bands", primary: false }]);
  assert.deepEqual(saved.primaryCategory, { key: "bands/quickfit-22-mm", name: "QuickFit 22 mm" });
  assert.deepEqual(saved.relations, { related: [target.id], upsell: [] });
  assert.deepEqual(saved.inTheBox, ["Band", { label: "Pins", image: "/uploads/pins.jpg" }]);
  assert.ok(!saved.overviewHtml.includes("<script") && !saved.overviewHtml.includes("onerror"), saved.overviewHtml);
  assert.deepEqual([saved.options, saved.variants], [[], []], "a simple product reads back as the legacy simple shape");
  assert.deepEqual([saved.sku, saved.price, saved.stock, saved.stockBaseline, saved.stockAvailable], [`BAND-${n}`, 24995, 10, 10, 10]);
  const id = await internal(saved.id);
  assert.deepEqual(await rows("SELECT sku,is_default,status FROM product_variants WHERE product_id=$1", [id]), [{ sku: `BAND-${n}`, is_default: true, status: "active" }]);
  assert.deepEqual(await rows("SELECT pr.amount_minor::text AS a FROM prices pr JOIN product_variants v ON v.id=pr.variant_id WHERE v.product_id=$1", [id]), [{ a: "2499500" }]);
  const moves = await movements(id);
  assert.equal(moves.length, 1);
  assert.deepEqual([moves[0].reason, moves[0].delta_on_hand, moves[0].actor_user_id], ["opening", 10, f.adminId]);
  assert.match(moves[0].source_reference, new RegExp(`^admin:${saved.id}#`));
  // legacy_content stays populated for back-compat readers (legacy list DTO, cart image fallback).
  const legacy = (await rows("SELECT legacy_content FROM products WHERE id=$1", [id]))[0].legacy_content;
  assert.equal(legacy.name, saved.name);
  assert.equal(legacy.sku, `BAND-${n}`);
  assert.ok(!("categories" in legacy) && !("stock" in legacy));
  const dto = await f.cms.get("products", f.admin, saved.id);
  assert.deepEqual([dto.price, dto.stock, dto.sku], [24995, 10, `BAND-${n}`]);
});

test("creates a variant product (display + swatches) and an unchanged round trip writes nothing", async () => {
  const n = nextSerial();
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(n, { categories: [{ key: "sports-fitness/running-smartwatches", primary: true }] }));
  assert.equal(saved.variants.length, 4);
  assert.deepEqual(saved.options.map(o => [o.key, o.display, o.values.map(v => v.swatchColor ?? null)]), [["case-size", "buttons", [null, null, null]], ["color", "swatch", ["#000000", "#888888"]]]);
  const v51b = saved.variants.find(v => v.sku === `DEV-${n}-51-B`);
  assert.deepEqual([v51b.price, v51b.originalPrice, v51b.stock, v51b.stockTracked], [399995, 449995, 0, true]);
  assert.equal(saved.variants.find(v => v.isDefault).sku, `DEV-${n}-43-B`);
  assert.equal(saved.price, 349995, "product-level price mirrors the default variant");
  const id = await internal(saved.id);
  assert.deepEqual(await balances(id), { [`DEV-${n}-43-B`]: 4, [`DEV-${n}-47-B`]: 2, [`DEV-${n}-51-B`]: 0, [`DEV-${n}-51-G`]: 7 });
  const before = (await movements(id)).length;
  // Echo exactly what the read API returned: stored ids, display-only fields, compatibility views.
  const again = await f.catalog.saveProduct(f.admin, saved);
  assert.equal(again.version, 2);
  assert.equal((await movements(id)).length, before, "no stock movement for unchanged stock");
  assert.deepEqual(again.variants.map(v => [v.id, v.sku]), saved.variants.map(v => [v.id, v.sku]), "stored ids are stable");
  assert.deepEqual(again.options.map(o => o.values.map(v => v.id)), saved.options.map(o => o.values.map(v => v.id)));
  assert.equal((await rows("SELECT display FROM product_options WHERE product_id=$1 AND key='color'", [id]))[0].display, "swatch");
});

test("an update replaces the category set and keeps exactly one primary; omitted categories stay", async () => {
  const n = nextSerial();
  let p = await f.catalog.saveProduct(f.admin, simpleCommand(n, { categories: [{ key: "bands", primary: true }, { key: "bands/quickfit-20-mm" }] }));
  p = await f.catalog.saveProduct(f.admin, { ...p, categories: [{ key: "bands/quickfit-26-mm", primary: true }, { key: "sensors" }] });
  const id = await internal(p.id);
  assert.deepEqual(await rows("SELECT c.key,pc.is_primary FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=$1 ORDER BY c.key", [id]), [{ key: "bands/quickfit-26-mm", is_primary: true }, { key: "sensors", is_primary: false }]);
  const { categories, ...withoutCategories } = p; void categories;
  p = await f.catalog.saveProduct(f.admin, withoutCategories);
  assert.equal((await rows("SELECT count(*)::int AS n FROM product_categories WHERE product_id=$1 AND is_primary", [id]))[0].n, 1);
  assert.equal((await rows("SELECT count(*)::int AS n FROM product_categories WHERE product_id=$1", [id]))[0].n, 2);
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...p, categories: [{ key: "no-such-category", primary: true }] }), e => e.status === 400 && /Unknown category/.test(e.message));
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...p, categories: [{ key: "bands", primary: true }, { key: "sensors", primary: true }] }), e => e.status === 400);
  await f.q("UPDATE categories SET archived=true WHERE key='bands/lily-bands'");
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...p, categories: [{ key: "bands/lily-bands", primary: true }] }), e => e.status === 400 && /Archived/.test(e.message));
  p = await f.catalog.saveProduct(f.admin, { ...p, categories: [] });
  assert.equal((await rows("SELECT count(*)::int AS n FROM product_categories WHERE product_id=$1", [id]))[0].n, 0);
});

test("SKU uniqueness is case-insensitive across products and within the command (409 with the SKUs)", async () => {
  const n = nextSerial();
  const first = await f.catalog.saveProduct(f.admin, simpleCommand(n));
  await assert.rejects(f.catalog.saveProduct(f.admin, simpleCommand(`${n}-b`, { sku: `band-${n}` })), e => e.status === 409 && e.code === "SKU_CONFLICT" && e.conflicts.includes(first.sku));
  const device = deviceCommand(`${n}-dup`);
  device.variants[1].sku = device.variants[0].sku.toLowerCase();
  await assert.rejects(f.catalog.saveProduct(f.admin, device), e => e.status === 409 && e.conflicts.length === 1);
  const clash = deviceCommand(`${n}-c`);
  clash.variants[2].sku = first.sku;
  await assert.rejects(f.catalog.saveProduct(f.admin, clash), e => e.status === 409 && e.conflicts[0] === first.sku);
  assert.equal((await rows("SELECT count(*)::int AS n FROM products WHERE name=$1", [clash.name]))[0].n, 0, "nothing was written");
});

test("a stale version is a 409 and two concurrent writers cannot both win", async () => {
  const p = await f.catalog.saveProduct(f.admin, simpleCommand(nextSerial()));
  await f.catalog.saveProduct(f.admin, { ...p, name: "Changed once" });
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...p, name: "Stale" }), e => e.status === 409 && e.code === "VERSION_CONFLICT");
  const current = await f.catalog.getProduct(f.admin, p.id);
  const results = await Promise.allSettled(["A", "B"].map(name => f.catalog.saveProduct(f.admin, { ...current, name })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...simpleCommand(nextSerial()), id: "missing-product-key", version: 1 }), e => e.status === 404);
});

test("stock edits are ledger movements with balances equal to the requested levels; permissions and baselines apply", async () => {
  const n = nextSerial();
  const saved = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const id = await internal(saved.id);
  const edit = { ...saved, variants: saved.variants.map(v => v.sku === `DEV-${n}-43-B` ? { ...v, stock: 9 } : v.sku === `DEV-${n}-51-G` ? { ...v, stock: 0 } : v) };
  const changed = await f.catalog.saveProduct(f.admin, edit);
  assert.deepEqual(await balances(id), { [`DEV-${n}-43-B`]: 9, [`DEV-${n}-47-B`]: 2, [`DEV-${n}-51-B`]: 0, [`DEV-${n}-51-G`]: 0 });
  const adjust = (await movements(id)).filter(m => m.reason === "adjust");
  assert.deepEqual(adjust.map(m => [m.sku, m.delta_on_hand]).sort(), [[`DEV-${n}-43-B`, 5], [`DEV-${n}-51-G`, -7]]);
  assert.ok(adjust.every(m => m.actor_user_id === f.adminId && m.source_reference.startsWith(`admin:${saved.id}#`)));
  assert.deepEqual((await reconcileStock(f.database.pool)).drift, []);
  // A catalog editor without inventory:write may save content but not stock.
  const content = await f.catalog.saveProduct(f.catalogEditor.headers, { ...changed, name: "Renamed by editor" });
  assert.equal(content.name, "Renamed by editor");
  await assert.rejects(f.catalog.saveProduct(f.catalogEditor.headers, { ...content, variants: content.variants.map(v => ({ ...v, stock: v.stock + 1 })) }), e => e.status === 403);
  await assert.rejects(f.catalog.saveProduct(f.catalogEditor.headers, simpleCommand(`${n}-new`)), e => e.status === 403, "creating stock rows needs inventory:write");
  await assert.rejects(f.catalog.saveProduct(f.reader.headers, { ...content, name: "x" }), e => e.status === 403);
  // A baseline that no longer matches the ledger is a conflict, never an overwrite.
  const loaded = await f.catalog.getProduct(f.admin, saved.id);
  const v47 = loaded.variants.find(v => v.sku === `DEV-${n}-47-B`);
  await f.inventory.adjust(f.admin, { variantId: v47.id, delta: 3, reason: "receive", note: "Delivery", idempotencyKey: `delivery-${n}-47` });
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...loaded, variants: loaded.variants.map(v => v.id === v47.id ? { ...v, stock: 1 } : v) }), e => e.status === 409 && e.code === "STOCK_CONFLICT");
  // ...while an unchanged level (equal to its baseline) leaves the newer ledger value alone.
  const kept = await f.catalog.saveProduct(f.admin, { ...loaded, name: "Still five" });
  assert.equal(kept.variants.find(v => v.id === v47.id).stock, 5);
});

test("removed variants are archived when the ledger references them and deleted otherwise; a re-added SKU revives its row", async () => {
  const n = nextSerial();
  const command = deviceCommand(n);
  // A draft variant with no stock value has no balance row and nothing else references it.
  command.variants.push({ id: "tmp", sku: `DEV-${n}-TMP`, title: "Untracked draft", selections: { size: "s43", color: "gray" }, price: "1", status: "draft" });
  const saved = await f.catalog.saveProduct(f.admin, command);
  const id = await internal(saved.id);
  const v47 = saved.variants.find(v => v.sku === `DEV-${n}-47-B`), tmp = saved.variants.find(v => v.sku === `DEV-${n}-TMP`);
  assert.equal(tmp.stockTracked, false);
  const trimmed = await f.catalog.saveProduct(f.admin, { ...saved, variants: saved.variants.filter(v => v.id !== v47.id && v.id !== tmp.id) });
  assert.equal(trimmed.variants.length, 3);
  assert.equal((await rows("SELECT status FROM product_variants WHERE id=$1", [v47.id]))[0].status, "archived", "v47 has ledger history");
  assert.equal((await rows("SELECT count(*)::int AS n FROM product_variants WHERE id=$1", [tmp.id]))[0].n, 0, "an unreferenced variant is deleted");
  assert.ok(!trimmed.variants.some(v => v.id === v47.id), "archived variants are not editable");
  assert.equal((await f.catalog.listSkus(f.admin, { search: `DEV-${n}-47-B` })).total, 0, "archived variants leave the SKU list");
  // Re-adding the same SKU revives the archived row (same id, same ledger history).
  const readded = await f.catalog.saveProduct(f.admin, { ...trimmed, variants: [...trimmed.variants, { id: "again", sku: `DEV-${n}-47-B`, title: "47 mm Black", selections: { [trimmed.options[0].id]: trimmed.options[0].values[1].id, [trimmed.options[1].id]: trimmed.options[1].values[0].id }, price: 1, stock: 2, status: "active" }] });
  assert.equal(readded.variants.length, 4);
  assert.equal(readded.variants.find(v => v.sku === `DEV-${n}-47-B`).id, v47.id);
  assert.equal((await rows("SELECT count(*)::int AS n FROM product_variants WHERE product_id=$1 AND status<>'archived'", [id]))[0].n, 4);
});

test("older payloads without variants patch only the default variant; variants:[] makes a product simple", async () => {
  const n = nextSerial();
  const device = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  // PostgresProductsScreen-style payload: no options/variants, price as a decimal string, no stock.
  const dto = await f.cms.save("products", f.admin, { id: device.id, version: device.version, name: device.name, sku: device.sku, price: "355000", description: "Edited" });
  assert.equal(dto.price, 355000);
  const read = await f.catalog.getProduct(f.admin, device.id);
  assert.equal(read.variants.length, 4, "the configuration is kept");
  assert.equal(read.variants.find(v => v.isDefault).price, 355000);
  assert.equal(read.variants.find(v => v.sku === `DEV-${n}-51-G`).stock, 7, "stock untouched");
  const simple = await f.catalog.saveProduct(f.admin, { ...read, options: [], variants: [], sku: `SIMPLE-${n}`, price: 1000, stock: 3 });
  assert.deepEqual([simple.options.length, simple.variants.length, simple.sku, simple.stock], [0, 0, `SIMPLE-${n}`, 3]);
});

test("the legacy HTTP adapter accepts the full command, keeps the SKU-conflict shape and SEO patches never touch stock", async () => {
  const { createCMSHTTP } = await import("../../src/server/cms/http.ts");
  const { config } = await import("./catalog-helpers.mjs");
  const http = createCMSHTTP({ cms: f.cms, authorize: f.authorize, baseURL: config.baseURL, dimensionSpecs: {}, defaults: () => ({}) });
  const request = (method, body) => new Request(config.baseURL + "/api/admin/products", { method, headers: new Headers([...f.admin, ["origin", config.baseURL], ["content-type", "application/json"]]), body: JSON.stringify(body) });
  const n = nextSerial();
  const created = await http.handle("products", request("POST", deviceCommand(n)));
  assert.equal(created.status, 200);
  const product = (await created.json()).product;
  const conflict = await http.handle("products", request("POST", simpleCommand(`${n}-x`, { sku: `dev-${n}-43-b` })));
  assert.equal(conflict.status, 409);
  const body = await conflict.json();
  assert.equal(body.code, "SKU_CONFLICT");
  assert.deepEqual(body.conflicts, [`DEV-${n}-43-B`]);
  const id = await internal(product.id), before = (await movements(id)).length;
  const patched = await http.handle("products", new Request(config.baseURL + "/api/admin/products", { method: "PATCH", headers: new Headers([...f.admin, ["origin", config.baseURL], ["content-type", "application/json"]]), body: JSON.stringify({ id: product.id, version: product.version, seoTitle: "SEO only" }) }));
  assert.equal(patched.status, 200);
  assert.equal((await movements(id)).length, before);
  assert.equal((await f.catalog.getProduct(f.admin, product.id)).seoTitle, "SEO only");
});

test("a garmin.com import draft (fēnix 9 fixture) saves as a draft product with its variants", async () => {
  const html = readFileSync(new URL("../fixtures/garmin/fenix9.html", import.meta.url), "utf8");
  const { product } = parseGarminProduct(html, { sourceUrl: "https://www.garmin.com/en-US/p/1953453", rateKztPerUsd: 500, now: "2026-11-21T00:00:00.000Z" });
  const saved = await f.catalog.saveProduct(f.admin, product);
  assert.equal(saved.status, "draft");
  assert.equal(saved.variants.length, product.variants.length);
  assert.equal(saved.images.length, product.images.length, "remote images stay in the editor list");
  assert.equal((await rows("SELECT count(*)::int AS n FROM product_media WHERE product_id=$1", [await internal(saved.id)]))[0].n, 0, "remote images never become ready media");
  assert.deepEqual(saved.inTheBox, product.inTheBox);
  assert.equal(saved.specGroups.length, product.specGroups.length);
  assert.deepEqual(saved.source, product.source);
  const v = saved.variants.find(x => x.sku === product.variants[0].sku);
  assert.deepEqual(v.imageIds, product.variants[0].imageIds);
  assert.equal(v.sourcePartNumber, product.variants[0].sourcePartNumber);
});

// M9.3 review finding 4: a missing price is carried as null (read → editor → write); a resave never
// invents a 0 KZT price row, and an ACTIVE variant without a price is a clear 400.
test("a variant without an active price stays unpriced on resave; an active one without a price is refused", async () => {
  const n = nextSerial();
  const device = await f.catalog.saveProduct(f.admin, deviceCommand(n));
  const productId = await internal(device.id);
  const sku = `DEV-${n}-47-B`;
  const priceRows = async () => rows("SELECT v.sku,p.amount_minor::text AS amount FROM prices p JOIN product_variants v ON v.id=p.variant_id WHERE v.product_id=$1 AND p.is_active ORDER BY v.sku", [productId]);
  await f.q("UPDATE product_variants SET status='draft' WHERE sku=$1", [sku]);
  await f.q("DELETE FROM prices WHERE variant_id=(SELECT id FROM product_variants WHERE sku=$1)", [sku]);
  const before = await priceRows();
  let read = await f.catalog.getProduct(f.admin, device.id);
  assert.equal(read.variants.find(v => v.sku === sku).price, null, "the read carries null, not 0");
  // Full editor echo, quick edit of another variant, and an older payload without variants: no 0 KZT row appears.
  read = await f.catalog.saveProduct(f.admin, { ...read, name: `${read.name} (resaved)` });
  assert.deepEqual(await priceRows(), before);
  assert.equal(read.variants.find(v => v.sku === sku).price, null);
  const other = read.variants.find(v => v.sku === `DEV-${n}-43-B`);
  const quick = await f.catalog.quickEditVariant(f.admin, other.id, { version: read.version, stock: 9, stockBaseline: other.stockBaseline });
  assert.deepEqual(await priceRows(), before);
  await f.cms.save("products", f.admin, { id: device.id, version: quick.product.version, name: read.name, description: "Older screen" });
  assert.deepEqual(await priceRows(), before, "the variants-omitted path keeps the unpriced variant unpriced");
  // Publishing that variant without giving it a price is refused with a clear message; with a price it saves.
  read = await f.catalog.getProduct(f.admin, device.id);
  const activate = price => ({ ...read, variants: read.variants.map(v => v.sku === sku ? { ...v, status: "active", price } : v) });
  await assert.rejects(f.catalog.saveProduct(f.admin, activate(null)), e => e.status === 400 && e.message.includes(`Active variant ${sku} needs a price`));
  await f.catalog.saveProduct(f.admin, activate(3799.95));
  assert.equal((await priceRows()).find(r => r.sku === sku).amount, "379995");
});

test("a draft simple product may be created without a price; publishing it needs one", async () => {
  const n = nextSerial();
  const draft = await f.catalog.saveProduct(f.admin, simpleCommand(n, { status: "draft", price: null }));
  assert.equal(draft.price, null);
  assert.deepEqual(await rows("SELECT p.id FROM prices p JOIN product_variants v ON v.id=p.variant_id WHERE v.product_id=$1", [await internal(draft.id)]), []);
  await assert.rejects(f.catalog.saveProduct(f.admin, { ...draft, status: "published" }), e => e.status === 400 && /needs a price/.test(e.message));
  const published = await f.catalog.saveProduct(f.admin, { ...draft, status: "published", price: 2499.5 });
  assert.equal(published.price, 2499.5);
});
