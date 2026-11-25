// Owner 2026-11-25: Admin ▸ Traffic reports and Admin ▸ Campaign links. A "click" is a visit (its landing);
// campaigns add up to their format and platform. Days, hours and weekdays are Asia/Almaty (UTC+5).
import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startCatalogFixture } from "./catalog-helpers.mjs";
import { createTrafficReports } from "../../src/server/traffic/reports.ts";
import { createTrafficLinks } from "../../src/server/traffic/links.ts";

let f, reports, links;
const q = (sql, args = []) => f.q(sql, args);
const RANGE = { from: "2026-11-01", to: "2026-11-30" };
const rejectsWith = (promise, status) => assert.rejects(promise, error => { assert.equal(error.status, status, error.message); return true; });

/** Inserts n visits (one landing view each) at `at` for a source; returns the visit ids. */
async function seed(n, { platform = "Direct", medium = null, campaign = null, at = "2026-11-10T10:00:00Z", os = "Windows", deviceType = "desktop", visitor } = {}) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    await q(`INSERT INTO traffic_sessions(id,visitor_id,started_at,last_seen_at,platform,medium,campaign,landing_path,os,device_type)
             VALUES($1,$2,$3,$3,$4,$5,$6,'/',$7,$8)`, [id, visitor ?? randomUUID(), at, platform, medium, campaign, os, deviceType]);
    await q("INSERT INTO traffic_views(id,session_id,occurred_at,path) VALUES($1,$2,$3,'/')", [randomUUID(), id, at]);
    ids.push(id);
  }
  return ids;
}

before(async () => {
  f = await startCatalogFixture({ taxonomy: false });
  reports = createTrafficReports({ pool: f.database.pool, authorize: f.authorize });
  links = createTrafficLinks({ pool: f.database.pool, authorize: f.authorize, origin: "https://garmin.test" });
}, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });
beforeEach(async () => { await q("DELETE FROM traffic_sessions"); await q("DELETE FROM traffic_links"); });

test("campaigns add up to their format and platform; untagged clicks stay under the platform", async () => {
  await seed(200, { platform: "Instagram", medium: "story", campaign: "a" });
  await seed(300, { platform: "Instagram", medium: "post", campaign: "b" });
  await seed(50, { platform: "Instagram", medium: "referral" });
  await seed(20, { platform: "Google", medium: "organic" });
  const { platforms } = await reports.sources(f.admin, RANGE);
  assert.deepEqual(platforms.map(p => [p.platform, p.clicks]), [["Instagram", 550], ["Google", 20]]);
  const ig = platforms[0];
  assert.equal(ig.clicks, ig.mediums.reduce((sum, m) => sum + m.clicks, 0));
  for (const m of ig.mediums) assert.equal(m.clicks, m.campaigns.reduce((sum, c) => sum + c.clicks, 0));
  assert.deepEqual(ig.mediums.map(m => [m.medium, m.clicks]), [["post", 300], ["story", 200], ["referral", 50]]);
  assert.deepEqual(ig.mediums[2].campaigns, [{ campaign: null, clicks: 50 }]);
  assert.equal(ig.visitors, 550);
});

test("summary counts clicks, unique visitors and page views in the range only", async () => {
  const v = randomUUID();
  const [first] = await seed(2, { visitor: v });
  await q("INSERT INTO traffic_views(id,session_id,occurred_at,path) VALUES($1,$2,'2026-11-10T10:05:00Z','/c/x')", [randomUUID(), first]);
  await seed(1, { at: "2026-10-15T10:00:00Z" }); // outside
  assert.deepEqual(await reports.summary(f.admin, RANGE), { clicks: 2, visitors: 1, pageViews: 3 });
});

test("buckets in Asia/Almaty: 23:30 UTC is 04:30 the next day", async () => {
  await seed(1, { at: "2026-11-24T23:30:00Z" });
  const { days } = await reports.timeline(f.admin, { from: "2026-11-24", to: "2026-11-26" });
  assert.deepEqual(days, [{ date: "2026-11-24", clicks: 0, pageViews: 0 }, { date: "2026-11-25", clicks: 1, pageViews: 1 }, { date: "2026-11-26", clicks: 0, pageViews: 0 }]);
  const { cells } = await reports.heatmap(f.admin, RANGE);
  assert.deepEqual(cells, [{ weekday: 3, hour: 4, pageViews: 1 }]);
  // a visit at 20:00 UTC on Nov 30 is Dec 1 in Almaty and falls outside a range ending Nov 30
  await seed(1, { at: "2026-11-30T20:00:00Z" });
  assert.equal((await reports.summary(f.admin, RANGE)).clicks, 1);
});

test("product views merge across locales and keep deleted products by id", async () => {
  const product = (await q("INSERT INTO products(id,public_key,name) VALUES($1,$2,'fēnix 9 Pro') RETURNING id", [randomUUID(), "pk-" + randomUUID()])).rows[0].id;
  const gone = randomUUID();
  const [visit] = await seed(1);
  for (const path of [`/p/${product}`, `/ru/p/${product}`, `/kk/p/${product}`]) await q("INSERT INTO traffic_views(id,session_id,occurred_at,path,product_id) VALUES($1,$2,'2026-11-10T10:00:00Z',$3,$4)", [randomUUID(), visit, path, product]);
  await q("INSERT INTO traffic_views(id,session_id,occurred_at,path,product_id) VALUES($1,$2,'2026-11-10T10:00:00Z','/p/x',$3)", [randomUUID(), visit, gone]);
  const { products } = await reports.products(f.admin, RANGE);
  assert.deepEqual(products, [{ productId: product, name: "fēnix 9 Pro", views: 3, visitors: 1 }, { productId: gone, name: null, views: 1, visitors: 1 }]);
});

test("devices split clicks by OS and device type", async () => {
  await seed(3, { os: "iOS", deviceType: "mobile" });
  await seed(2, { os: "Android", deviceType: "mobile" });
  await seed(1, { os: "Windows", deviceType: "desktop" });
  const result = await reports.devices(f.admin, RANGE);
  assert.deepEqual(result.os, [{ os: "iOS", clicks: 3 }, { os: "Android", clicks: 2 }, { os: "Windows", clicks: 1 }]);
  assert.deepEqual(result.deviceTypes, [{ deviceType: "mobile", clicks: 5 }, { deviceType: "desktop", clicks: 1 }]);
});

test("ranges are validated and reports need orders:read", async () => {
  await rejectsWith(reports.summary(f.admin, { from: "2026-11-30", to: "2026-11-01" }), 400);
  await rejectsWith(reports.summary(f.admin, { from: "2025-01-01", to: "2026-11-30" }), 400);
  await rejectsWith(reports.summary(f.admin, { from: "2026-02-30", to: "2026-03-01" }), 400);
  await rejectsWith(reports.summary(f.admin, { ...RANGE, extra: "1" }), 400);
  await rejectsWith(reports.summary(f.catalogEditor.headers, RANGE), 403);
  await rejectsWith(reports.summary(new Headers(), RANGE), 401);
});

test("campaign links: built URL, clicks only for their own source, format and campaign", async () => {
  const link = await links.create(f.admin, { platform: "Instagram", medium: "story", campaign: "Fenix 9 December!", targetPath: "/p/abc" });
  assert.equal(link.campaign, "fenix-9-december");
  assert.equal(link.url, "https://garmin.test/p/abc?utm_source=instagram&utm_medium=story&utm_campaign=fenix-9-december");
  const other = await links.create(f.admin, { platform: "VK group", medium: "post", campaign: "x", targetPath: "/" });
  assert.equal(other.platform, "Vk-group");
  assert.match(other.url, /utm_source=vk-group&/);
  await seed(4, { platform: "Instagram", medium: "story", campaign: "fenix-9-december" });
  await seed(2, { platform: "Instagram", medium: "post", campaign: "fenix-9-december" });
  await seed(1, { platform: "Vk-group", medium: "post", campaign: "x" });
  const listed = (await links.list(f.admin, RANGE)).links;
  assert.deepEqual(listed.map(l => [l.campaign, l.clicks]).sort(), [["fenix-9-december", 4], ["x", 1]]);
  // creating the same link again returns it instead of failing
  assert.equal((await links.create(f.admin, { platform: "instagram", medium: "story", campaign: "fenix-9-december", targetPath: "/p/abc" })).id, link.id);
  await links.archive(f.admin, { id: link.id });
  assert.deepEqual((await links.list(f.admin, RANGE)).links.map(l => l.id), [other.id]);
});

test("campaign links refuse unsafe targets and need content:write to change", async () => {
  for (const targetPath of ["//evil.com", "https://evil.com/", "/admin/orders", "/api/t", "/\\evil", "p/abc", "/" + "x".repeat(600)]) {
    await rejectsWith(links.create(f.admin, { platform: "Instagram", medium: "story", campaign: "a", targetPath }), 400);
  }
  await rejectsWith(links.create(f.admin, { platform: "Instagram", medium: "story", campaign: "!!!", targetPath: "/" }), 400);
  await rejectsWith(links.create(f.admin, { platform: "Instagram", medium: "story", campaign: "a", targetPath: "/", extra: 1 }), 400);
  await rejectsWith(links.create(f.reader.headers, { platform: "Instagram", medium: "story", campaign: "a", targetPath: "/" }), 403);
  await rejectsWith(links.list(f.catalogEditor.headers, RANGE), 403);
});
