// Owner 2026-11-25: where a visit came from. Precedence: utm_source → click id (fbclid/gclid/yclid) →
// in-app browser user agent → referrer host → Other referral → Direct.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySource } from "../../src/server/traffic/classify.ts";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.32.112 (iPhone15,2; iOS 18_1; ru_RU; ru; scale=3.00; 1179x2556; 563578345)";
const FB = "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.81 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/490.0.0.40.108;]";
const OWN = "garmin.2well.cloud";
const run = (path, { referrer = null, userAgent = CHROME } = {}) =>
  classifySource({ url: new URL(path, `https://${OWN}`), referrer, userAgent, ownHost: OWN });

test("utm tags win and are normalised", () => {
  assert.deepEqual(run("/p/x?utm_source=ig&utm_medium=Story&utm_campaign=fenix9-december"),
    { platform: "Instagram", medium: "story", campaign: "fenix9-december", referrerHost: null });
  assert.equal(run("/?utm_source=insta").platform, "Instagram");
  assert.equal(run("/?utm_source=FB").platform, "Facebook");
  assert.equal(run("/?utm_source=tg").platform, "Telegram");
  assert.equal(run("/?utm_source=ya").platform, "Yandex");
  assert.equal(run("/?utm_source=Newsletter").platform, "Newsletter");
  assert.equal(run("/?utm_source=google&utm_medium=cpc").medium, "ad");
  assert.equal(run("/?utm_source=instagram&utm_medium=paid").medium, "ad");
  // utm tags beat a referrer from somewhere else
  assert.equal(run("/?utm_source=instagram", { referrer: "https://www.google.com/" }).platform, "Instagram");
});

test("click ids: fbclid is Meta unless the app or referrer says which", () => {
  assert.equal(run("/?fbclid=abc", { userAgent: IG }).platform, "Instagram");
  assert.equal(run("/?fbclid=abc", { userAgent: FB }).platform, "Facebook");
  assert.equal(run("/?fbclid=abc").platform, "Meta");
  assert.equal(run("/?fbclid=abc", { referrer: "https://l.facebook.com/" }).platform, "Facebook");
  assert.equal(run("/?gclid=abc").platform, "Google");
  assert.equal(run("/?gclid=abc").medium, "ad");
  assert.equal(run("/?yclid=abc").platform, "Yandex");
});

test("in-app UA wins over empty referrer", () => {
  assert.deepEqual(run("/", { userAgent: IG }), { platform: "Instagram", medium: "referral", campaign: null, referrerHost: null });
  assert.equal(run("/", { userAgent: FB }).platform, "Facebook");
});

test("referrer hosts", () => {
  assert.equal(run("/", { referrer: "https://l.instagram.com/?u=x" }).platform, "Instagram");
  assert.equal(run("/", { referrer: "https://www.instagram.com/" }).platform, "Instagram");
  assert.equal(run("/", { referrer: "https://m.facebook.com/" }).platform, "Facebook");
  assert.equal(run("/", { referrer: "https://fb.me/x" }).platform, "Facebook");
  assert.deepEqual(run("/", { referrer: "https://www.google.kz/" }), { platform: "Google", medium: "organic", campaign: null, referrerHost: "www.google.kz" });
  assert.equal(run("/", { referrer: "https://yandex.kz/search/?text=garmin" }).platform, "Yandex");
  assert.equal(run("/", { referrer: "https://ya.ru/" }).platform, "Yandex");
  assert.equal(run("/", { referrer: "https://t.me/garminkz" }).platform, "Telegram");
  assert.deepEqual(run("/", { referrer: "https://example.org/a" }), { platform: "Other referral", medium: "referral", campaign: null, referrerHost: "example.org" });
});

test("own host, empty or broken referrer is Direct", () => {
  assert.deepEqual(run("/", { referrer: `https://${OWN}/c/x` }), { platform: "Direct", medium: null, campaign: null, referrerHost: null });
  assert.equal(run("/", { referrer: "" }).platform, "Direct");
  assert.equal(run("/", { referrer: "not a url" }).platform, "Direct");
  // a look-alike host is not Google
  assert.equal(run("/", { referrer: "https://google.evil.example/" }).platform, "Other referral");
});

test("long or odd tag values are capped", () => {
  const r = run(`/?utm_source=${"x".repeat(100)}&utm_medium=${"m".repeat(200)}&utm_campaign=${"c".repeat(200)}`);
  assert.ok(r.platform.length <= 40 && r.medium.length <= 80 && r.campaign.length <= 80);
  assert.equal(run("/?utm_source=%20%20").platform, "Direct");
});

// Final review 2026-11-25: one spelling per platform, and a tagged link without utm_medium is "link", not "referral".
test("platform spelling is stable and tagged links without a medium say link", () => {
  assert.equal(run("/?utm_source=TikTok").platform, "TikTok");
  assert.equal(run("/?utm_source=tiktok").platform, "TikTok");
  assert.equal(run("/?utm_source=WHATSAPP").platform, "WhatsApp");
  assert.equal(run("/?utm_source=vk").platform, "VK");
  assert.equal(run("/?utm_source=NEWSLETTER").platform, "Newsletter");
  assert.equal(run("/?utm_source=instagram").medium, "link");
  assert.equal(run("/?utm_source=google").medium, "organic");
});
