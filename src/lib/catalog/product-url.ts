// Owner 2026-11-23: product pages follow garmin.com — one product code = one page (/p/{code}) and one sub-page per
// variant (/p/{code}/{sku}). Every storefront link to a product is built here. Pure: shared by server and client.

const CODE = /^[0-9]{1,12}$/;
const PRODUCT_PATH = /^(?:\/([a-z]{2}))?\/p\/([^/]+)(?:\/([^/]+))?\/?$/;

/** A product code is 1–12 digits (products.product_code, migration 0029). */
export function isProductCode(value: string): boolean {
  return CODE.test(value);
}

/** `/p/{code}` or `/p/{code}/{sku}` (SKU kept in its stored case, path-encoded); no locale prefix. */
export function productPath(code: string, sku?: string | null): string {
  const base = `/p/${encodeURIComponent(code)}`;
  return sku ? `${base}/${encodeURIComponent(sku)}` : base;
}

/** Reads `[/{locale}]/p/{key}[/{sku}]`; `locale` is the URL segment (en, ru, kz). Null for any other path. */
export function parseProductPath(pathname: string): { locale: string | null; key: string; sku: string | null } | null {
  const match = PRODUCT_PATH.exec(pathname);
  if (!match) return null;
  try {
    return { locale: match[1] ?? null, key: decodeURIComponent(match[2]), sku: match[3] ? decodeURIComponent(match[3]) : null };
  } catch {
    return null;
  }
}

/**
 * The address after the shopper picks variant `sku` on a product page at `currentHref`: that variant's page in the
 * same language (`/{locale}/p/{code}/{sku}`), keeping the query and hash. Used with history.pushState (no reload).
 */
export function variantHref(currentHref: string, code: string, sku: string): string {
  const url = new URL(currentHref);
  const locale = parseProductPath(url.pathname)?.locale;
  return `${locale ? `/${locale}` : ""}${productPath(code, sku)}${url.search}${url.hash}`;
}
