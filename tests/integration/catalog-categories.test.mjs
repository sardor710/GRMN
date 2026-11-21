// M4.2/M4.3: taxonomy-driven category pages. Membership = products assigned to the category or any
// descendant (curated, never derived from activity presets); facets are computed from the category's
// product set with garmin.com semantics; unknown slugs are null (404) while empty categories render.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startCatalogFixture, deviceCommand, simpleCommand, nextSerial } from "./catalog-helpers.mjs";
import { createCatalogService } from "../../src/server/catalog/service.ts";

let f, api;
before(async () => { f = await startCatalogFixture(); api = createCatalogService({ pool: f.database.pool }); }, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });

const page = (slug, input = {}) => api.getCategoryPage(slug, { pageSize: 100, explicit: true, ...input });
const keysOf = (result, mine) => result.items.map(card => card.publicKey).filter(key => mine.includes(key));
const facet = (result, key) => Object.fromEntries((result.facets.find(f => f.key === key)?.options ?? []).map(o => [o.value, o.count]));

test("membership: assigned products of the category and its descendants; activity presets never add products", async () => {
  const n = nextSerial();
  const running = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-run`, { name: `Runner ${n}`, family: "Forerunner", activities: ["Running"], categories: [{ key: "sports-fitness/running-smartwatches", primary: true }] }));
  const allOnly = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-all`, { name: `All-only runner ${n}`, activities: ["Running"], categories: [{ key: "wearables-smartwatches", primary: true }] }));
  const tri = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-tri`, { name: `Triathlete ${n}`, categories: [{ key: "sports-fitness/multisport-smartwatches", primary: true }, { key: "sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights" }] }));
  const draft = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-draft`, { status: "draft", categories: [{ key: "sports-fitness/running-smartwatches", primary: true }] }));
  const mine = [running.id, allOnly.id, tri.id, draft.id];

  const runningPage = await page("sports-fitness/running-smartwatches");
  assert.deepEqual(keysOf(runningPage, mine), [running.id], "curated: a Running-activity product assigned elsewhere is not listed; drafts never are");
  assert.equal(runningPage.presetApplied, false, "the Running seed preset is not a garmin.com URL preset");
  assert.deepEqual(runningPage.selection.activities, []);
  assert.deepEqual(runningPage.category.path.map(c => c.slug), ["wearables-smartwatches", "sports-fitness/running-smartwatches"]);
  assert.equal(runningPage.category.name, "Running");

  const all = await page("wearables-smartwatches");
  assert.deepEqual(keysOf(all, mine).sort(), [running.id, allOnly.id, tri.id].sort(), "the parent lists its descendants' products");
  // A product in two categories is on both pages (A1).
  assert.deepEqual(keysOf(await page("sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights"), mine), [tri.id]);
  assert.deepEqual(keysOf(await page("sports-fitness/multisport-smartwatches"), mine), [tri.id]);
  assert.deepEqual(keysOf(await page("sports-fitness"), mine), [tri.id], "Sports & Fitness lists its own subtree (Cycling), not Running under Smartwatches");
});

test("empty categories render (200) while unknown, archived, malformed and hidden-group slugs are null (404)", async () => {
  const empty = await page("marine/sailing");
  assert.ok(empty, "an empty catalog category resolves");
  assert.deepEqual([empty.items.length, empty.total, empty.categoryTotal, empty.facets.length, empty.pageCount], [0, 0, 0, 0, 1]);
  assert.equal(empty.category.name, "Sailing");
  assert.equal(await page("no-such/category"), null);
  assert.equal(await page("../etc"), null);
  assert.equal(await page("Wearables-Smartwatches"), null, "slugs are lowercase");
  assert.equal(await page("bands/quickfit-20-mm"), null, "hidden compatibility groups have no page");
  assert.ok(await page("watch-series/fenix"), "watch-series groups are linked from the storefront and resolve");
  assert.ok(await page("bands"), "accessory categories resolve");
  await f.q("UPDATE categories SET archived=true WHERE slug='marine/cameras'");
  assert.equal(await page("marine/cameras"), null);
  await f.q("UPDATE categories SET archived=false WHERE slug='marine/cameras'");
  await assert.rejects(api.getCategoryPage("marine/sailing", { page: 0 }), e => e.status === 400);
});

test("facets: counts per option apply the other facets; case size and price are per variant; availability uses free stock", async () => {
  const n = nextSerial(), golf = "sports-fitness/golf-gps-devices-smartwatches";
  // Variants: 43 mm (4 in stock), 47 mm (2), 51 mm Black (0), 51 mm Gray (7); 349,995–399,995 KZT.
  const fenix = await f.catalog.saveProduct(f.admin, deviceCommand(n, { activities: ["Golfing", "Hiking"], level: "Premium", categories: [{ key: golf, primary: true }, { key: "watch-series/fenix" }] }));
  const band = await f.catalog.saveProduct(f.admin, simpleCommand(n, { activities: ["Golfing"], categories: [{ key: golf, primary: true }] }));
  const forerunner = await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-fr`, { name: `Forerunner ${n}`, family: "Forerunner", price: "150000", stock: 0, activities: ["Running"], level: "Entry", isFeatured: true, categories: [{ key: golf, primary: true }, { key: "watch-series/forerunner" }] }));

  const base = await page(golf);
  assert.equal(base.categoryTotal, 3);
  assert.deepEqual(base.facets.map(x => x.key), ["activities", "levels", "caseSizes", "series", "prices", "availability"]);
  assert.deepEqual(facet(base, "activities"), { golfing: 2, hiking: 1, running: 1 });
  assert.deepEqual(base.facets.find(x => x.key === "activities").options.map(o => o.label), ["Golfing", "Hiking", "Running"]);
  assert.deepEqual(facet(base, "levels"), { Entry: 1, Premium: 1 });
  assert.deepEqual(facet(base, "caseSizes"), { Small: 1, Medium: 1, Large: 1 });
  assert.deepEqual(base.facets.find(x => x.key === "caseSizes").options.map(o => o.label), ["Small (35 to 43 mm)", "Medium (44 to 49 mm)", "Large (≥ 50 mm)"]);
  assert.deepEqual(base.facets.find(x => x.key === "series").options.map(o => [o.value, o.label, o.count]), [["fenix", "fēnix", 1], ["forerunner", "Forerunner", 1], ["quickfit", "QuickFit", 1]]);
  assert.deepEqual(facet(base, "prices"), { "0-100000": 1, "100000-250000": 1, "250000-500000": 1 });
  assert.deepEqual(facet(base, "availability"), { "in-stock": 2 });
  assert.equal(base.items.find(c => c.publicKey === forerunner.id).availability, "out_of_stock");

  // Large + in stock: the 51 mm Gray variant qualifies even though 51 mm Black is sold out.
  const large = await page(golf, { filters: { caseSizes: ["Large"], inStock: true } });
  assert.deepEqual(large.items.map(c => c.publicKey), [fenix.id]);
  assert.deepEqual(facet(large, "activities"), { golfing: 1, hiking: 1 }, "other facets' counts apply the case-size and stock filters");
  assert.deepEqual(facet(large, "caseSizes"), { Small: 1, Medium: 1, Large: 1 }, "a facet's own options ignore its own selection");
  assert.equal(large.facets.find(x => x.key === "caseSizes").options.find(o => o.value === "Large").checked, true);
  // The same variant must satisfy every variant-level filter: no fēnix variant is under 100,000 KZT.
  assert.equal((await page(golf, { filters: { caseSizes: ["Large"], prices: ["0-100000"] } })).total, 0);
  // OR within a facet, AND across facets.
  assert.deepEqual((await page(golf, { filters: { series: ["fenix", "quickfit"] } })).items.map(c => c.publicKey).sort(), [fenix.id, band.id].sort());
  assert.deepEqual((await page(golf, { filters: { series: ["fenix", "quickfit"], activities: ["Hiking"] } })).items.map(c => c.publicKey), [fenix.id], "labels are accepted for activities");
  assert.deepEqual((await page(golf, { filters: { inStock: true } })).items.map(c => c.publicKey).sort(), [fenix.id, band.id].sort());

  // Sorts.
  const names = async sort => (await page(golf, { sort })).items.map(c => c.publicKey);
  assert.deepEqual(await names("price-asc"), [band.id, forerunner.id, fenix.id]);
  assert.deepEqual(await names("price-desc"), [fenix.id, forerunner.id, band.id]);
  // "Synthetic fēnix" sorts before "Synthetic QuickFit" (accent- and case-insensitive).
  assert.deepEqual(await names("name-asc"), [forerunner.id, fenix.id, band.id]);
  assert.deepEqual(await names("name-desc"), [band.id, fenix.id, forerunner.id]);
  assert.equal((await names("featured"))[0], forerunner.id, "featured products first");
  // Paging.
  const first = await page(golf, { sort: "price-asc", pageSize: 2 }), second = await page(golf, { sort: "price-asc", pageSize: 2, page: 2 });
  assert.deepEqual([first.pageCount, first.items.length, second.items.map(c => c.publicKey)], [2, 2, [fenix.id]]);
});

test("presets pre-check facets only where garmin.com's menu link does (Women), and never when the URL is explicit", async () => {
  const n = nextSerial();
  const small = await f.catalog.saveProduct(f.admin, deviceCommand(n, { categories: [{ key: "women-wearables", primary: true }] }));
  let women = await api.getCategoryPage("women-wearables", { pageSize: 100 });
  assert.equal(women.presetApplied, false, "the seed has no Women preset");
  await f.q(`UPDATE categories SET preset_filters='{"caseSizes":["Small"]}' WHERE slug='women-wearables'`);
  women = await api.getCategoryPage("women-wearables", { pageSize: 100 });
  assert.equal(women.presetApplied, true);
  assert.deepEqual(women.selection.caseSizes, ["Small"]);
  assert.deepEqual(women.items.map(c => c.publicKey), [small.id]);
  assert.equal((await api.getCategoryPage("women-wearables", { pageSize: 100, explicit: true })).presetApplied, false);
  const running = await api.getCategoryPage("sports-fitness/running-smartwatches", { pageSize: 100 });
  assert.equal(running.presetApplied, false, "Running opens unfiltered even with a stored activity preset");
  await f.q(`UPDATE categories SET preset_filters='{}' WHERE slug='women-wearables'`);
});

test("sitemap: category slugs with at least one listed product, including ancestors and linked series groups only", async () => {
  const n = nextSerial();
  await f.catalog.saveProduct(f.admin, simpleCommand(`${n}-dive`, { categories: [{ key: "sports-fitness/dive-computers-smartwatches", primary: true }, { key: "bands/quickfit-26-mm" }, { key: "watch-series/descent" }] }));
  const slugs = await api.listCategorySlugsWithProducts();
  for (const slug of ["sports-fitness/dive-computers-smartwatches", "wearables-smartwatches", "watch-series/descent", "bands"]) assert.ok(slugs.includes(slug), slug);
  for (const slug of ["marine/sailing", "bands/quickfit-26-mm", "watch-series"]) assert.ok(!slugs.includes(slug), slug);
});
