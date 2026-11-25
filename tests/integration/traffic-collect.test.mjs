// Owner 2026-11-25: the page-view collector behind POST /api/t. One visit (traffic_sessions row) is one
// "click" for its source; every page view is a traffic_views row. Staff, bots, admin pages, prefetches and
// malformed beacons are never stored; no IP address or raw user agent is kept.
import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startCatalogFixture } from "./catalog-helpers.mjs";
import { getSessionIdentity } from "../../src/server/auth/principal.ts";
import { createTrafficCollector, createBeaconHandler, pruneTraffic } from "../../src/server/traffic/collect.ts";

const BASE = "https://garmin.test";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IP = "203.0.113.77";
let f, collector;
const q = (sql, args = []) => f.q(sql, args);
const count = async table => (await q(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const beacon = (path, extra = {}) => JSON.stringify({ v: 1, url: BASE + path, referrer: "", ...extra });
const visitor = (ua = CHROME, more = {}) => new Headers({ "user-agent": ua, ...more });
const rejects400 = promise => assert.rejects(promise, error => { assert.equal(error.status, 400, error.message); return true; });

before(async () => {
  f = await startCatalogFixture({ taxonomy: false });
  collector = createTrafficCollector({
    pool: f.database.pool, ownHost: "garmin.test",
    isStaff: async headers => Boolean((await getSessionIdentity(f.runtime, headers))?.staff),
  });
}, { timeout: 180000 });
after(async () => { await f?.stop(); }, { timeout: 60000 });
beforeEach(async () => { await q("DELETE FROM traffic_sessions"); });

test("first beacon creates one visit and one view and hands back both cookies", async () => {
  const result = await collector.collect(visitor(IPHONE), beacon("/ru/p/abc?utm_source=ig&utm_medium=story&utm_campaign=fenix9", { locale: "ru" }), {});
  assert.equal(result.stored, true);
  assert.match(result.setCookies.vid, /^[0-9a-f-]{36}$/);
  assert.match(result.setCookies.sid, /^[0-9a-f-]{36}$/);
  const s = (await q("SELECT * FROM traffic_sessions")).rows;
  assert.equal(s.length, 1);
  assert.equal(s[0].id, result.setCookies.sid);
  assert.equal(s[0].visitor_id, result.setCookies.vid);
  assert.deepEqual([s[0].platform, s[0].medium, s[0].campaign, s[0].os, s[0].device_type, s[0].landing_path, s[0].locale],
    ["Instagram", "story", "fenix9", "iOS", "mobile", "/ru/p/abc", "ru"]);
  assert.equal(await count("traffic_views"), 1);
});

test("a second beacon with the visit cookie is a page view of the same visit", async () => {
  const productId = randomUUID();
  const first = await collector.collect(visitor(), beacon("/?utm_source=fb"), {});
  const second = await collector.collect(visitor(), beacon(`/p/${productId}`, { productId, referrer: BASE + "/" }), first.setCookies);
  assert.equal(second.setCookies.sid, first.setCookies.sid);
  assert.equal(await count("traffic_sessions"), 1);
  const views = (await q("SELECT path, product_id FROM traffic_views ORDER BY occurred_at")).rows;
  assert.deepEqual(views.map(v => v.path), ["/", `/p/${productId}`]);
  assert.equal(views[1].product_id, productId);
  assert.equal((await q("SELECT views, platform FROM traffic_sessions")).rows[0].views, 2);
  assert.equal((await q("SELECT platform FROM traffic_sessions")).rows[0].platform, "Facebook");
});

test("a visit idle for more than 30 minutes ends; the next view starts a new one for the same visitor", async () => {
  const first = await collector.collect(visitor(), beacon("/"), {});
  await q("UPDATE traffic_sessions SET last_seen_at = now() - interval '31 minutes'");
  const second = await collector.collect(visitor(), beacon("/c/x"), first.setCookies);
  assert.notEqual(second.setCookies.sid, first.setCookies.sid);
  assert.equal(second.setCookies.vid, first.setCookies.vid);
  assert.equal(await count("traffic_sessions"), 2);
});

test("new campaign params start a new visit", async () => {
  const first = await collector.collect(visitor(), beacon("/?utm_source=ig&utm_campaign=a"), {});
  const same = await collector.collect(visitor(), beacon("/?utm_source=ig&utm_campaign=a"), first.setCookies);
  assert.equal(same.setCookies.sid, first.setCookies.sid, "the same campaign again is the same visit");
  const next = await collector.collect(visitor(), beacon("/?utm_source=fb&utm_campaign=b"), first.setCookies);
  assert.notEqual(next.setCookies.sid, first.setCookies.sid);
  const rows = (await q("SELECT platform, campaign FROM traffic_sessions ORDER BY started_at")).rows;
  assert.deepEqual(rows.map(r => [r.platform, r.campaign]), [["Instagram", "a"], ["Facebook", "b"]]);
});

test("a forged or foreign visit cookie never joins another visitor's visit", async () => {
  const mine = await collector.collect(visitor(), beacon("/"), {});
  const other = await collector.collect(visitor(), beacon("/"), { vid: randomUUID(), sid: mine.setCookies.sid });
  assert.notEqual(other.setCookies.sid, mine.setCookies.sid);
  const junk = await collector.collect(visitor(), beacon("/"), { vid: "x", sid: "'; drop table" });
  assert.match(junk.setCookies.vid, /^[0-9a-f-]{36}$/);
  assert.equal(await count("traffic_sessions"), 3);
});

test("staff, bots, admin and api pages and prefetches are not stored", async () => {
  assert.equal((await collector.collect(f.admin, beacon("/"), {})).stored, false);
  assert.equal((await collector.collect(visitor("Mozilla/5.0 (compatible; Googlebot/2.1)"), beacon("/"), {})).stored, false);
  assert.equal((await collector.collect(visitor("facebookexternalhit/1.1"), beacon("/"), {})).stored, false);
  assert.equal((await collector.collect(visitor(), beacon("/admin/orders"), {})).stored, false);
  assert.equal((await collector.collect(visitor(), beacon("/api/cart"), {})).stored, false);
  assert.equal((await collector.collect(visitor(CHROME, { "sec-purpose": "prefetch" }), beacon("/"), {})).stored, false);
  assert.equal(await count("traffic_sessions"), 0);
  assert.equal(await count("traffic_views"), 0);
});

test("malformed beacons are refused with 400 and store nothing", async () => {
  await rejects400(collector.collect(visitor(), "x".repeat(5000), {}));
  await rejects400(collector.collect(visitor(), "{not json", {}));
  await rejects400(collector.collect(visitor(), beacon("/", { extra: 1 }), {}));
  await rejects400(collector.collect(visitor(), beacon("/", { productId: "not-a-uuid" }), {}));
  await rejects400(collector.collect(visitor(), beacon("/", { locale: "de" }), {}));
  await rejects400(collector.collect(visitor(), JSON.stringify({ v: 1, url: "https://evil.example/", referrer: "" }), {}));
  await rejects400(collector.collect(visitor(), JSON.stringify({ v: 1, url: "javascript:alert(1)", referrer: "" }), {}));
  assert.equal(await count("traffic_sessions"), 0);
});

test("no column holds the client address or the raw user agent", async () => {
  await collector.collect(visitor(IPHONE, { "x-grmn-client-ip": IP }), beacon("/"), {});
  const dump = JSON.stringify((await q("SELECT row_to_json(s) AS s FROM traffic_sessions s")).rows) + JSON.stringify((await q("SELECT row_to_json(v) AS v FROM traffic_views v")).rows);
  assert.equal(dump.includes(IP), false);
  assert.equal(dump.includes("AppleWebKit"), false);
});

test("the beacon route: 204 with cookies, 403 for a foreign origin, 429 past the per-address limit", async () => {
  const handler = createBeaconHandler({ collector, pool: f.database.pool, baseURL: BASE, secret: "test-secret", trustedProxy: true, limit: 3 });
  const post = (headers = {}, body = beacon("/")) => handler(new Request(BASE + "/api/t", { method: "POST", body, headers: { "content-type": "text/plain", "user-agent": CHROME, origin: BASE, "x-grmn-client-ip": IP, ...headers } }));
  const ok = await post();
  assert.equal(ok.status, 204);
  const cookies = ok.headers.getSetCookie();
  assert.ok(cookies.some(c => /^grmn_vid=[0-9a-f-]{36};/.test(c) && /Max-Age=34128000/.test(c) && /HttpOnly/.test(c) && /SameSite=Lax/.test(c) && /Secure/.test(c)));
  assert.ok(cookies.some(c => /^grmn_sid=[0-9a-f-]{36};/.test(c) && /Max-Age=1800/.test(c)));
  assert.equal((await post({ origin: "https://evil.example" })).status, 403);
  assert.equal((await post({}, "{bad")).status, 400);
  const statuses = [await post(), await post(), await post()].map(r => r.status);
  assert.ok(statuses.includes(429), statuses.join(","));
  const get = await handler(new Request(BASE + "/api/t", { method: "GET" }));
  assert.equal(get.status, 405);
});

test("prune removes visits older than 13 months with their views and keeps newer ones", async () => {
  await collector.collect(visitor(), beacon("/old"), {});
  await collector.collect(visitor(), beacon("/new"), {});
  await q("UPDATE traffic_sessions SET started_at = now() - interval '14 months' WHERE landing_path = '/old'");
  await q("UPDATE traffic_sessions SET started_at = now() - interval '12 months' WHERE landing_path = '/new'");
  const { deleted } = await pruneTraffic(f.database.pool);
  assert.equal(deleted, 1);
  assert.deepEqual((await q("SELECT path FROM traffic_views")).rows.map(r => r.path), ["/new"]);
});
