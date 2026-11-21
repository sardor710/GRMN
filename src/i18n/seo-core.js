import { LOCALES, LOCALE_SEGMENT } from './config.js';

const ALL = Object.freeze([...LOCALES]);
const EN_ONLY = Object.freeze(['en']);
/** Private pages (cart, account): never indexed and no hreflang at all. */
const NONE = Object.freeze([]);

/**
 * Locales in which each route's main content is translated (and therefore indexed + listed in hreflang).
 * Minisites and /garmin-pay keep English marketing copy, so they are English-only.
 * Product and blog-post entries are the upper bound; per-record values replace them in Task 8.
 * `home` is the upper bound too: ru/kk are indexed only while the CMS hero and carousel titles
 * are translated (`isHomepageTranslated`, R18).
 */
export const ROUTE_LOCALES = Object.freeze({
  home: ALL,
  category: ALL,
  product: ALL,
  blogIndex: ALL,
  blogPost: ALL,
  compare: ALL,
  cart: NONE,
  account: NONE,
  newsletter: ALL,
  garminPay: EN_ONLY,
  selectLocation: ALL,
  'minisite:fenix-8': EN_ONLY,
  'minisite:marq': EN_ONLY,
  'minisite:marq2': EN_ONLY,
  'minisite:why-garmin': EN_ONLY,
  'minisite:garmin-pay': EN_ONLY,
});

/** Public origin (no trailing slash). Same env and fallback as sitemap/robots. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.garmin.com').replace(/\/+$/, '');

/** Absolute URL for a site path ("/p/x") or a path that is already absolute (returned unchanged). */
export function absoluteUrl(path, siteUrl = SITE_URL) {
  if (/^https?:\/\//i.test(path)) return path;
  return path === '/' || path === '' ? siteUrl : `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Absolute, locale-prefixed URL of a page ("/p/x" + "kk" -> https://host/kz/p/x). */
export function localizedUrl(path, locale, siteUrl = SITE_URL) {
  return absoluteUrl(prefixed(locale, path), siteUrl);
}

function prefixed(locale, path) {
  // Public URL segment: Kazakh is /kz (hreflang keys stay the language code "kk").
  const segment = LOCALE_SEGMENT[locale] ?? locale;
  return path === '/' || path === '' ? `/${segment}` : `/${segment}${path}`;
}

/** True when `locale` is one of the locales the page is translated into (the page may be indexed). */
export function isIndexable(locale, indexedLocales) {
  return indexedLocales.includes(locale);
}

/**
 * hreflang + canonical for one page. `path` is unprefixed ("/p/x", "/" for home).
 * `canonicalOverride` (a CMS field) applies to English only. When it points anywhere other than
 * the page's own /en URL, the /en URL is not canonical, so `en` is left out of hreflang
 * (x-default stays).
 */
/**
 * @param {{ path: string, locale: string, indexedLocales: string[], canonicalOverride?: string }} input
 * @returns {{ canonical: string, languages: Record<string, string> }}
 */
export function buildAlternates({ path, locale, indexedLocales, canonicalOverride }) {
  /** @type {Record<string, string>} */
  const languages = {};
  const enPath = prefixed('en', path);
  const enIsCanonical = !canonicalOverride || canonicalOverride === enPath || canonicalOverride === absoluteUrl(enPath);
  for (const l of LOCALES) {
    if (l === 'en' && !enIsCanonical) continue;
    if (indexedLocales.includes(l)) languages[l] = prefixed(l, path);
  }
  if (indexedLocales.length > 0) languages['x-default'] = path || '/';
  const canonical = locale === 'en' && canonicalOverride ? canonicalOverride : prefixed(locale, path);
  return { canonical, languages };
}

const JSON_LD_ESCAPES = Object.freeze({
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
});

/**
 * JSON for a `<script type="application/ld+json">` body. `<`, `>`, `&`, U+2028 and U+2029 become
 * JSON unicode escapes, so a CMS string cannot close the script; JSON.parse gives the same value.
 */
export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (ch) => JSON_LD_ESCAPES[ch]);
}

/**
 * One sitemap entry per indexed locale of each route; every entry lists the full alternate set
 * (absolute URLs) plus x-default.
 * @param {string} baseUrl
 * @param {{ path: string, indexedLocales: string[], lastModified?: Date, priority?: number, changeFrequency?: string }[]} routes
 */
export function buildSitemapEntries(baseUrl, routes) {
  const entries = [];
  for (const { path, indexedLocales, lastModified, priority, changeFrequency } of routes) {
    const locales = LOCALES.filter((l) => indexedLocales.includes(l));
    if (locales.length === 0) continue;
    /** @type {Record<string, string>} */
    const languages = {};
    for (const l of locales) languages[l] = localizedUrl(path, l, baseUrl);
    languages['x-default'] = absoluteUrl(path, baseUrl);
    for (const l of locales) {
      entries.push({
        url: languages[l],
        lastModified,
        changeFrequency,
        priority,
        alternates: { languages },
      });
    }
  }
  return entries;
}
