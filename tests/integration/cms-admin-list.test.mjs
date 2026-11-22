// M2 admin read API: slim grouped/SKU lists with filters, totals and keyset paging; expand, taxonomy,
// picker and the /api/admin/catalog HTTP adapter.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, config } from "./catalog-helpers.mjs";
import { createCatalogHTTP } from "../../src/server/cms/catalog-http.ts";

let f, http;
const tag = "Listfix";
const keys = {};
before(async () => {
  f = await startCatalogFixture();
  http = createCatalogHTTP({ service: f.catalog, baseURL: config.baseURL });
  // 3 watches (variants) + 12 bands; mixed status, family, categories and stock.
  for (let i = 0; i < 3; i++) keys[`watch${i}`] = (await f.catalog.saveProduct(f.admin, deviceCommand(`L${i}`, { name: `${tag} watch ${i}`, categories: [{ key: i === 2 ? "sports-fitness/running-smartwatches" : "outdoor-recreation/adventure-smartwatches", primary: true }], overviewHtml: `<p>${"Heavy overview ".repeat(2000)}</p>`, specs: Array.from({ length: 150 }, (_, s) => ({ label: `Spec ${s}`, value: "Yes" })) }))).id;
  for (let i = 0; i < 12; i++) keys[`band${i}`] = (await f.catalog.saveProduct(f.admin, simpleCommand(`L${i}`, { name: `${tag} band ${i}`, family: i % 2 ? "QuickFit" : "Lily", status: i === 11 ? "archived" : i % 3 === 0 ? "draft" : "published", stock: i % 4 === 0 ? 0 : i % 4 === 1 ? 3 : 40, categories: [{ key: i % 2 ? "bands/quickfit-22-mm" : "bands/lily-bands", primary: true }] }))).id;
}, { timeout: 240000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const all = async (fn, query, limit = 4) => {
  const items = [];
  let cursor;
  do { const page = await fn(f.admin, { ...query, limit, ...(cursor ? { cursor } : {}) }); items.push(...page.items); cursor = page.nextCursor; } while (cursor);
  return items;
};

test("grouped list rows are slim: aggregates and one thumbnail, never overview/specs/galleries/variants", async () => {
  const page = await f.catalog.listProducts(f.admin, { search: tag, limit: 50 });
  assert.equal(page.total, 14, "archived products are hidden unless asked for");
  const watch = page.items.find(item => item.id === keys.watch0);
  assert.deepEqual([watch.variantCount, watch.stock, watch.price, watch.primaryCategory?.key], [4, { onHand: 13, available: 13 }, { min: 349995, max: 399995 }, "outdoor-recreation/adventure-smartwatches"]);
  assert.deepEqual(Object.keys(watch).sort(), ["family", "id", "name", "price", "primaryCategory", "status", "stock", "thumbnail", "updatedAt", "variantCount", "version"]);
  const json = JSON.stringify(page);
  assert.ok(!/overview|specs|images|variants"|Heavy overview/.test(json), "no heavy fields");
  assert.ok(Buffer.byteLength(json) < 20000, `payload ${Buffer.byteLength(json)} bytes`);
  // Most recently updated first.
  const stamps = page.items.map(item => item.updatedAt);
  assert.deepEqual(stamps, [...stamps].sort().reverse());
});

test("filters: search (name, SKU, family), status, family, category with descendants and stock state, each with a total", async () => {
  assert.equal((await f.catalog.listProducts(f.admin, { search: "DEV-L1-51-G" })).items[0].id, keys.watch1, "search by variant SKU");
  assert.equal((await f.catalog.listProducts(f.admin, { search: "quickfit", status: "all" })).total, 6, "family matches, archived included with status=all");
  assert.equal((await f.catalog.listProducts(f.admin, { search: tag, status: "draft" })).total, 4);
  assert.equal((await f.catalog.listProducts(f.admin, { search: tag, status: "archived" })).total, 1);
  assert.equal((await f.catalog.listProducts(f.admin, { family: "Lily" })).total, 6);
  // "bands" includes its quickfit/lily children; "wearables-smartwatches" includes running/adventure leaves.
  assert.equal((await f.catalog.listProducts(f.admin, { category: "bands" })).total, 11);
  assert.equal((await f.catalog.listProducts(f.admin, { category: "bands/lily-bands" })).total, 6);
  assert.equal((await f.catalog.listProducts(f.admin, { category: "wearables-smartwatches" })).total, 3);
  await assert.rejects(f.catalog.listProducts(f.admin, { category: "no-such" }), e => e.status === 400);
  // Stock state is computed from available = on_hand - reserved across non-archived variants.
  const out = await f.catalog.listProducts(f.admin, { search: `${tag} band`, stock: "out" });
  const low = await f.catalog.listProducts(f.admin, { search: `${tag} band`, stock: "low" });
  const inStock = await f.catalog.listProducts(f.admin, { search: `${tag} band`, stock: "in" });
  assert.deepEqual([out.total, low.total, inStock.total], [3, 3, 8]);
  assert.ok(out.items.every(item => item.stock.available <= 0) && low.items.every(item => item.stock.available > 0 && item.stock.available <= 5));
  await assert.rejects(f.catalog.listProducts(f.admin, { stock: "plenty" }), e => e.status === 400);
  await assert.rejects(f.catalog.listProducts(f.admin, { limit: 101 }), e => e.status === 400);
  assert.equal((await f.catalog.listProducts(f.admin, {})).limit, 50, "default page size");
});

test("keyset paging is stable and complete, and cursors are bound to their filters", async () => {
  const pages = await all((h, q) => f.catalog.listProducts(h, q), { search: tag, status: "all" }, 4);
  assert.equal(pages.length, 15);
  assert.equal(new Set(pages.map(item => item.id)).size, 15);
  const first = await f.catalog.listProducts(f.admin, { search: tag, limit: 4 });
  // An update between pages moves that product to the top but never duplicates rows on later pages.
  const moved = first.items[3];
  const current = await f.catalog.getProduct(f.admin, moved.id);
  await f.catalog.saveProduct(f.admin, { ...current, description: "Touched while paging" });
  const second = await f.catalog.listProducts(f.admin, { search: tag, limit: 4, cursor: first.nextCursor });
  assert.ok(!second.items.some(item => first.items.some(seen => seen.id === item.id)));
  await assert.rejects(f.catalog.listProducts(f.admin, { search: "other", limit: 4, cursor: first.nextCursor }), e => e.status === 400 && e.code === "INVALID_CURSOR");
  await assert.rejects(f.catalog.listSkus(f.admin, { search: tag, limit: 4, cursor: first.nextCursor }), e => e.status === 400);
  await assert.rejects(f.catalog.listProducts(f.admin, { cursor: "garbage" }), e => e.status === 400);
});

test("SKU list: one row per non-archived variant with options, price, stock and thumbnail; same filters; stable paging", async () => {
  const page = await f.catalog.listSkus(f.admin, { search: "DEV-L0", limit: 50 });
  assert.equal(page.total, 4);
  const row = page.items.find(item => item.sku === "DEV-L0-51-B");
  assert.deepEqual([row.productId, row.title, row.options, row.price, row.compareAt, row.stock, row.status], [keys.watch0, "51 mm Black", [{ option: "Case Size", value: "51 mm" }, { option: "Color", value: "Black" }], 399995, 449995, { onHand: 0, reserved: 0, available: 0, tracked: true }, "active"]);
  assert.equal(typeof row.productVersion, "number");
  assert.equal((await f.catalog.listSkus(f.admin, { category: "wearables-smartwatches" })).total, 12);
  assert.equal((await f.catalog.listSkus(f.admin, { search: "DEV-L", stock: "out" })).total, 3, "the three 51 mm Black variants");
  const skus = await all((h, q) => f.catalog.listSkus(h, q), { search: tag }, 5);
  assert.equal(skus.length, 12 + 11);
  assert.equal(new Set(skus.map(s => s.variantId)).size, skus.length);
  // Variants of one product stay together, SKU ascending.
  const watchRows = skus.filter(s => s.productId === keys.watch2).map(s => s.sku);
  assert.deepEqual(watchRows, [...watchRows].sort());
});

test("expand, taxonomy and picker", async () => {
  const variants = await f.catalog.productVariants(f.admin, keys.watch1);
  assert.deepEqual(variants.map(v => v.sku), ["DEV-L1-43-B", "DEV-L1-47-B", "DEV-L1-51-B", "DEV-L1-51-G"]);
  const tree = await f.catalog.taxonomy(f.admin);
  assert.ok(tree.categories.length >= 100);
  const quickfit = tree.categories.find(c => c.key === "bands/quickfit-22-mm");
  assert.deepEqual([quickfit.parentKey, quickfit.kind], ["bands", "group"]);
  assert.ok(tree.categories.findIndex(c => c.key === "bands") < tree.categories.findIndex(c => c.key === "bands/quickfit-22-mm"), "parents first");
  const picked = await f.catalog.picker(f.admin, { search: "band", category: "bands/quickfit-22-mm", exclude: keys.band1 });
  assert.ok(picked.items.length > 0 && picked.items.every(item => item.id !== keys.band1 && item.primaryCategory.key === "bands/quickfit-22-mm"));
  assert.ok(!("total" in picked));
  await assert.rejects(f.catalog.listProducts(f.reader.headers, {}), e => e.status === 403);
});

const request = (method, path, body, headers = f.admin) => new Request(config.baseURL + "/api/admin/catalog/" + path, { method, headers: new Headers([...headers, ["origin", config.baseURL], ["content-type", "application/json"]]), body: body === undefined ? undefined : JSON.stringify(body) });

test("HTTP adapter: list, product read/create/update, SKU conflict shape, origin and query guards, taxonomy ETag", async () => {
  let response = await http(request("GET", `products?search=${tag}&limit=2`));
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.deepEqual([body.items.length, body.total, typeof body.nextCursor], [2, 14, "string"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await http(request("GET", "products?unknown=1"))).status, 400);
  assert.equal((await http(request("GET", "products?limit=1&limit=2"))).status, 400);
  assert.equal((await http(request("GET", "products", undefined, new Headers()))).status, 401);
  response = await http(request("GET", `products/${encodeURIComponent(keys.watch0)}`));
  body = await response.json();
  assert.deepEqual([body.product.id, body.product.variants.length], [keys.watch0, 4]);
  response = await http(request("POST", "products", simpleCommand("HTTP1", { name: `${tag} http band` })));
  assert.equal(response.status, 201);
  const created = (await response.json()).product;
  assert.equal((await http(request("POST", "products", { ...simpleCommand("HTTP2"), id: "chosen-id" }))).status, 400);
  response = await http(request("PUT", `products/${encodeURIComponent(created.id)}`, { ...created, name: `${tag} http band renamed` }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).product.version, 2);
  assert.equal((await http(request("PUT", `products/${encodeURIComponent(created.id)}`, { ...created, name: "stale" }))).status, 409);
  response = await http(request("POST", "products", simpleCommand("HTTP3", { sku: created.sku.toLowerCase() })));
  body = await response.json();
  assert.deepEqual([response.status, body.code, body.conflicts], [409, "SKU_CONFLICT", [created.sku]]);
  const foreign = new Request(config.baseURL + "/api/admin/catalog/products", { method: "POST", headers: new Headers([...f.admin, ["origin", "https://evil.example"], ["content-type", "application/json"]]), body: "{}" });
  assert.equal((await http(foreign)).status, 403);
  assert.equal((await http(request("DELETE", "products"))).status, 405);
  assert.equal((await http(request("GET", "nothing-here"))).status, 404);
  response = await http(request("GET", `products/${encodeURIComponent(keys.watch0)}/variants`));
  assert.equal((await response.json()).variants.length, 4);
  response = await http(request("GET", "taxonomy"));
  const etag = response.headers.get("etag");
  assert.ok(etag && /private/.test(response.headers.get("cache-control")));
  assert.equal((await http(new Request(config.baseURL + "/api/admin/catalog/taxonomy", { headers: new Headers([...f.admin, ["if-none-match", etag]]) }))).status, 304);
  response = await http(request("GET", `skus?search=DEV-L2&stock=in`));
  assert.equal((await response.json()).total, 3);
  response = await http(request("GET", `picker?search=${tag}&limit=3`));
  assert.equal((await response.json()).items.length, 3);
});

test("quick edit: price, compare-at, stock (ledger), status and photos with a product version check", async () => {
  const product = await f.catalog.getProduct(f.admin, keys.watch2);
  const target = product.variants.find(v => v.sku === "DEV-L2-47-B");
  let response = await http(request("PATCH", `variants/${target.id}`, { version: product.version, price: "355000.50", originalPrice: "400000", stock: 6, status: "draft" }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual([body.product.version, body.variant.price, body.variant.compareAt, body.variant.stock.onHand, body.variant.status], [product.version + 1, 355000.5, 400000, 6, "draft"]);
  const moves = (await f.q("SELECT reason,delta_on_hand,actor_user_id FROM stock_movements WHERE variant_id=$1 ORDER BY created_at,id", [target.id])).rows;
  assert.deepEqual(moves.map(m => [m.reason, m.delta_on_hand]), [["opening", 2], ["adjust", 4]]);
  assert.equal(moves.at(-1).actor_user_id, f.adminId);
  assert.equal((await http(request("PATCH", `variants/${target.id}`, { version: product.version, price: "1" }))).status, 409, "stale product version");
  assert.equal((await http(request("PATCH", `variants/${target.id}`, { version: body.product.version, stock: 1 }, f.catalogEditor.headers))).status, 403, "stock needs inventory:write");
  assert.equal((await http(request("PATCH", `variants/${target.id}`, { version: body.product.version }))).status, 400, "nothing to change");
  assert.equal((await http(request("PATCH", `variants/${target.id}`, { version: body.product.version, price: "1.234" }))).status, 400);
  // Simple product: the SKU row edits the product-level fields.
  const band = await f.catalog.getProduct(f.admin, keys.band2);
  const bandSku = (await f.catalog.productVariants(f.admin, keys.band2))[0];
  response = await http(request("PATCH", `variants/${bandSku.variantId}`, { version: band.version, price: "19990", stock: 41, status: "draft" }));
  assert.equal(response.status, 200);
  const after = await f.catalog.getProduct(f.admin, keys.band2);
  assert.deepEqual([after.price, after.stock, after.status], [19990, 41, "draft"]);
});
