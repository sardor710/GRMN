import { DEFAULT_LOCALE, isLocale } from './config.js';

const EXCLUDED_PREFIXES = [
  '/admin',
  '/api',
  '/uploads',
  '/_next',
  '/robots.txt',
  '/sitemap.xml',
  '/seo',
  '/homepage',
  '/images',
  '/videos',
  // Backend-served files (Task 18A media uploads) and self-hosted fonts.
  '/media',
  '/fonts',
];

/** True for paths that are never locale-prefixed or redirected (matched on segment boundaries). */
export function isExcludedPath(pathname) {
  for (const prefix of EXCLUDED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  const last = pathname.split('/').pop() ?? '';
  return /\.[^./]+$/.test(last);
}

/** Splits a leading locale segment off a pathname. `rest` always starts with "/". */
export function stripLocale(pathname) {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (match && isLocale(match[1])) {
    return { locale: match[1], rest: match[2] || '/' };
  }
  return { locale: null, rest: pathname };
}

function parseAcceptLanguage(header) {
  const entries = [];
  header.split(',').forEach((part, index) => {
    const [tag, ...params] = part.split(';').map((s) => s.trim());
    if (!tag || tag === '*') return;
    let q = 1;
    for (const param of params) {
      const m = /^q=(\d*\.?\d+)$/i.exec(param);
      if (m) q = Number(m[1]);
    }
    if (!(q > 0)) return;
    entries.push({ primary: tag.toLowerCase().split('-')[0], q, index });
  });
  entries.sort((a, b) => b.q - a.q || a.index - b.index);
  return entries;
}

/** Cookie wins, then Accept-Language (q-weighted, primary subtag), then DEFAULT_LOCALE. */
export function negotiateLocale({ cookie, acceptLanguage } = {}) {
  if (cookie && isLocale(cookie)) return cookie;
  if (acceptLanguage) {
    for (const { primary } of parseAcceptLanguage(acceptLanguage)) {
      if (isLocale(primary)) return primary;
    }
  }
  return DEFAULT_LOCALE;
}

/** Adds (or swaps) the locale prefix on an internal path; leaves external/excluded hrefs untouched. */
export function localizeHref(href, locale) {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const match = /^([^?#]*)(.*)$/.exec(href);
  const path = match[1];
  const suffix = match[2];
  const { locale: existing, rest } = stripLocale(path);
  if (existing === null && isExcludedPath(path)) return href;
  const base = existing === null ? path : rest;
  return `/${locale}${base === '/' ? '' : base}${suffix}`;
}

/**
 * Pure core of the proxy: where an incoming request should be redirected, or null to pass it on.
 * Excluded paths and paths that already carry a locale prefix are never redirected (the prefix wins
 * over the cookie). Everything else gets the negotiated locale prepended, keeping the query string.
 */
export function decideLocaleRedirect(pathname, search, cookie, acceptLanguage) {
  if (isExcludedPath(pathname)) return null;
  if (stripLocale(pathname).locale !== null) return null;
  const locale = negotiateLocale({ cookie, acceptLanguage });
  return `/${locale}${pathname === '/' ? '' : pathname}${search || ''}`;
}

/**
 * Headers for the locale redirect: its target depends on the cookie and Accept-Language, so
 * shared caches must not reuse it across users.
 */
export const LOCALE_REDIRECT_HEADERS = Object.freeze({
  Vary: 'Cookie, Accept-Language',
  'Cache-Control': 'private, no-store',
});

/** Paths whose CMS redirect lookup is skipped (private account pages, beta's original matcher exclusion). */
function isAccountPath(rest) {
  return rest === '/account' || rest.startsWith('/account/');
}

/**
 * Source paths to look up in the CMS redirect table for a (decoded) request path, in order.
 * CMS rules are authored without a locale prefix, so a prefixed request is looked up first with the
 * prefix stripped, then as-is. Excluded paths and account pages are never looked up.
 */
export function cmsRedirectLookupPaths(pathname) {
  if (isExcludedPath(pathname)) return [];
  const { rest } = stripLocale(pathname);
  if (isAccountPath(rest)) return [];
  return rest === pathname ? [pathname] : [rest, pathname];
}

/**
 * Where a CMS redirect should send a request. A request that carries a locale prefix keeps it on an
 * internal target, unless the target already names a locale, is excluded (admin, api, media, files)
 * or is external. An unprefixed request gets the target as authored; the locale redirect then runs
 * on the next request, so a permanent CMS redirect is never cached with one visitor's language.
 */
export function localizeCmsRedirectTarget(target, requestPath) {
  const { locale } = stripLocale(requestPath);
  if (!locale) return target;
  if (!target.startsWith('/') || target.startsWith('//')) return target;
  const path = /^([^?#]*)/.exec(target)[1];
  if (stripLocale(path).locale !== null) return target;
  return localizeHref(target, locale);
}
