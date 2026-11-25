import "server-only";

// Owner 2026-11-25: device split for Admin ▸ Traffic. Only the parsed families are stored, never the raw
// user agent. Bots and link-preview fetchers (Instagram/Telegram/WhatsApp fetch every shared link) are
// flagged so they are never counted.

export type OperatingSystem = "Windows" | "macOS" | "iOS" | "iPadOS" | "Android" | "Linux" | "Other";
export type DeviceType = "mobile" | "tablet" | "desktop";
export interface ParsedUserAgent { os: OperatingSystem; deviceType: DeviceType; browser: string | null; bot: boolean }

const BOT = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|headless|preview|lighthouse|pingdom|uptime|monitor|curl\/|wget\/|python|node-fetch|axios\/|go-http|java\/|okhttp|^$/i;
const NOT_BOT = /cubot/i; // a phone brand, not a crawler

const BROWSERS: readonly [RegExp, string][] = [
  [/Instagram/, "Instagram"],
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/YaBrowser|YaSearchBrowser/, "Yandex"],
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/CriOS|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

export function parseUserAgent(ua: string): ParsedUserAgent {
  const value = ua.slice(0, 512);
  const bot = BOT.test(value.trim()) && !NOT_BOT.test(value);
  let os: OperatingSystem = "Other", deviceType: DeviceType = "desktop";
  if (/iPad/.test(value)) { os = "iPadOS"; deviceType = "tablet"; }
  else if (/iPhone|iPod/.test(value)) { os = "iOS"; deviceType = "mobile"; }
  else if (/Android/.test(value)) { os = "Android"; deviceType = /Mobile/.test(value) ? "mobile" : "tablet"; }
  else if (/Windows NT|Windows Phone/.test(value)) { os = "Windows"; deviceType = /Windows Phone/.test(value) ? "mobile" : "desktop"; }
  else if (/Macintosh|Mac OS X/.test(value)) os = "macOS";
  else if (/X11|Linux/.test(value) && !/CrOS/.test(value)) os = "Linux";
  const browser = BROWSERS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
  return { os, deviceType, browser, bot };
}
