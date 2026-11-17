import { LOCALES } from './config.js';

const ALL = Object.freeze([...LOCALES]);
const EN_ONLY = Object.freeze(['en']);

/**
 * Locales in which each route's main content is translated (and therefore indexed + listed in hreflang).
 * Minisites and /garmin-pay keep English marketing copy, so they are English-only.
 * Product and blog-post entries are the upper bound; per-record values replace them in Task 8.
 */
export const ROUTE_LOCALES = Object.freeze({
  home: ALL,
  category: ALL,
  product: ALL,
  blogIndex: ALL,
  blogPost: ALL,
  compare: ALL,
  cart: ALL,
  account: ALL,
  newsletter: ALL,
  garminPay: EN_ONLY,
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

/** Absolute, locale-prefixed URL of a page ("/p/x" + "kk" -> https://host/kk/p/x). */
export function localizedUrl(path, locale, siteUrl = SITE_URL) {
  return absoluteUrl(prefixed(locale, path), siteUrl);
}

function prefixed(locale, path) {
  return path === '/' || path === '' ? `/${locale}` : `/${locale}${path}`;
}

/** True when `locale` is one of the locales the page is translated into (the page may be indexed). */
export function isIndexable(locale, indexedLocales) {
  return indexedLocales.includes(locale);
}

/**
 * hreflang + canonical for one page. `path` is unprefixed ("/p/x", "/" for home).
 * `canonicalOverride` (a CMS field) applies to English only.
 */
/**
 * @param {{ path: string, locale: string, indexedLocales: string[], canonicalOverride?: string }} input
 * @returns {{ canonical: string, languages: Record<string, string> }}
 */
export function buildAlternates({ path, locale, indexedLocales, canonicalOverride }) {
  /** @type {Record<string, string>} */
  const languages = {};
  for (const l of LOCALES) {
    if (indexedLocales.includes(l)) languages[l] = prefixed(l, path);
  }
  languages['x-default'] = path || '/';
  const canonical = locale === 'en' && canonicalOverride ? canonicalOverride : prefixed(locale, path);
  return { canonical, languages };
}
