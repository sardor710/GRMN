import "server-only";

// Owner 2026-11-25: which platform a visit came from, decided once at landing (plan
// docs/plans/2026-11-25-traffic-analytics-xl.md). Precedence:
//   utm_source → click id (fbclid → Meta, gclid → Google, yclid → Yandex) → in-app browser user agent
//   → referrer host → Other referral → Direct.
// fbclid is added by Meta to outbound links in general (not only ads) and does not say Instagram or
// Facebook, so it resolves through the app's user agent or the referrer, else stays "Meta".

export interface SourceInput { url: URL; referrer: string | null; userAgent: string; ownHost: string }
export interface Source { platform: string; medium: string | null; campaign: string | null; referrerHost: string | null }

const SOURCE_ALIASES: Record<string, string> = {
  ig: "Instagram", insta: "Instagram", instagram: "Instagram",
  fb: "Facebook", facebook: "Facebook", meta: "Meta",
  google: "Google", yandex: "Yandex", ya: "Yandex",
  tg: "Telegram", telegram: "Telegram",
};
const AD_MEDIUMS = new Set(["cpc", "ppc", "paid", "ad", "ads", "paid_social", "paidsocial", "paid-social", "cpm"]);

const HOSTS: readonly [RegExp, string, "organic" | "referral"][] = [
  [/(^|\.)google\.(com?\.)?[a-z]{2,3}$/, "Google", "organic"],
  [/(^|\.)(yandex\.(com?\.)?[a-z]{2,3}|ya\.ru)$/, "Yandex", "organic"],
  [/(^|\.)instagram\.com$/, "Instagram", "referral"],
  [/(^|\.)(facebook\.com|fb\.me|fb\.com|messenger\.com)$/, "Facebook", "referral"],
  [/(^|\.)(t\.me|telegram\.me|telegram\.org)$/, "Telegram", "referral"],
];
// android-app://<package> referrers some apps send instead of a web origin
const APP_PACKAGES: readonly [RegExp, string, "organic" | "referral"][] = [
  [/^com\.instagram\./, "Instagram", "referral"],
  [/^com\.facebook\./, "Facebook", "referral"],
  [/telegram/, "Telegram", "referral"],
  [/^com\.google\.android\.googlequicksearchbox$/, "Google", "organic"],
  [/^ru\.yandex\./, "Yandex", "organic"],
];

const clean = (value: string | null, max: number): string | null => {
  const text = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max).trim();
  return text ? text : null;
};
const appFromUserAgent = (ua: string): string | null => /Instagram/.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : null;

function referrerSource(referrer: string | null, ownHost: string): { platform: string; medium: "organic" | "referral"; host: string } | null {
  if (!referrer) return null;
  let parsed: URL;
  try { parsed = new URL(referrer); } catch { return null; }
  if (parsed.protocol === "android-app:") {
    const pkg = parsed.hostname.toLowerCase();
    const hit = APP_PACKAGES.find(([pattern]) => pattern.test(pkg));
    return hit ? { platform: hit[1], medium: hit[2], host: pkg.slice(0, 253) } : { platform: "Other referral", medium: "referral", host: pkg.slice(0, 253) };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === ownHost.toLowerCase() || host === `www.${ownHost.toLowerCase()}`) return null;
  const hit = HOSTS.find(([pattern]) => pattern.test(host));
  return hit ? { platform: hit[1], medium: hit[2], host } : { platform: "Other referral", medium: "referral", host: host.slice(0, 253) };
}

export function normaliseMedium(raw: string | null): string | null {
  const medium = clean(raw, 80)?.toLowerCase() ?? null;
  return medium && AD_MEDIUMS.has(medium) ? "ad" : medium;
}

/** The platform a utm_source value counts under: known aliases, else the value with a capital first letter. */
export function platformFromUtm(value: string): string {
  const text = value.trim().slice(0, 40);
  return SOURCE_ALIASES[text.toLowerCase()] ?? text[0].toUpperCase() + text.slice(1);
}

export function classifySource({ url, referrer, userAgent, ownHost }: SourceInput): Source {
  const params = url.searchParams;
  const fromReferrer = referrerSource(referrer, ownHost);
  const referrerHost = fromReferrer?.host ?? null;

  const utmSource = clean(params.get("utm_source"), 40);
  if (utmSource) {
    const platform = platformFromUtm(utmSource);
    const medium = normaliseMedium(params.get("utm_medium")) ?? (platform === "Google" || platform === "Yandex" ? "organic" : "referral");
    return { platform, medium, campaign: clean(params.get("utm_campaign"), 80)?.toLowerCase() ?? null, referrerHost };
  }
  if (clean(params.get("gclid"), 200)) return { platform: "Google", medium: "ad", campaign: null, referrerHost };
  if (clean(params.get("yclid"), 200)) return { platform: "Yandex", medium: "ad", campaign: null, referrerHost };
  const app = appFromUserAgent(userAgent);
  if (clean(params.get("fbclid"), 400)) {
    const metaFromReferrer = fromReferrer && (fromReferrer.platform === "Instagram" || fromReferrer.platform === "Facebook") ? fromReferrer.platform : null;
    return { platform: app ?? metaFromReferrer ?? "Meta", medium: "referral", campaign: null, referrerHost };
  }
  if (app) return { platform: app, medium: "referral", campaign: null, referrerHost };
  if (fromReferrer) return { platform: fromReferrer.platform, medium: fromReferrer.medium, campaign: null, referrerHost };
  return { platform: "Direct", medium: null, campaign: null, referrerHost: null };
}
