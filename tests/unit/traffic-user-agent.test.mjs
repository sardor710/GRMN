// Owner 2026-11-25: device split (Windows, macOS, iOS, iPadOS, Android, Linux) and bot filtering.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUserAgent } from "../../src/server/traffic/user-agent.ts";

const cases = [
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Windows", "desktop", "Chrome"],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0", "Windows", "desktop", "Edge"],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", "macOS", "desktop", "Safari"],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "iOS", "mobile", "Safari"],
  ["Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1", "iPadOS", "tablet", "Safari"],
  ["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", "Android", "mobile", "Chrome"],
  ["Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Android", "tablet", "Chrome"],
  ["Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", "Linux", "desktop", "Firefox"],
  ["Mozilla/5.0 (Linux; Android 14; 23078PND5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 YaBrowser/24.12.0.0 Mobile Safari/537.36", "Android", "mobile", "Yandex"],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.32.112", "iOS", "mobile", "Instagram"],
  ["Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/490.0.0.40.108;]", "Android", "mobile", "Facebook"],
];

test("os, device type and browser family", () => {
  for (const [ua, os, deviceType, browser] of cases) {
    assert.deepEqual(parseUserAgent(ua), { os, deviceType, browser, bot: false }, ua);
  }
});

test("bots and link-preview fetchers are flagged", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    "WhatsApp/2.23.20.0",
    "curl/8.5.0",
    "",
  ]) assert.equal(parseUserAgent(ua).bot, true, ua);
});

test("unknown but real-looking agent is Other/desktop, not a bot", () => {
  assert.deepEqual(parseUserAgent("Mozilla/5.0 (Nintendo Switch; WifiWebAuthApplet) AppleWebKit/606.4 (KHTML, like Gecko) NF/6.0.1.15.4 NintendoBrowser/5.1.0.20393"),
    { os: "Other", deviceType: "desktop", browser: null, bot: false });
});
