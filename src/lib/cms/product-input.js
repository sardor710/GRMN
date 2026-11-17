// Validate/normalize product payloads from the admin before they are stored (and later rendered on the storefront).
import { sanitizeOverviewHtml } from '../import/garmin-parse.js';

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

/** Same-site absolute paths (/uploads/…, /marq/…) or Garmin's image CDN over https. */
export function isAllowedImageSrc(src) {
  const s = String(src || '').trim();
  if (!s) return false;
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\')) return true;
  return /^https:\/\/res\.garmin\.com\//.test(s);
}

const brief = (s) => (String(s).length > 80 ? `${String(s).slice(0, 77)}…` : String(s));

/** @returns {{ ok: true, product: object } | { ok: false, error: string }} */
export function sanitizeProductInput(body) {
  const product = { ...(body || {}) };
  if ('overviewHtml' in product) {
    product.overviewHtml = typeof product.overviewHtml === 'string' ? sanitizeOverviewHtml(product.overviewHtml) : '';
  }
  if (product.image !== undefined && product.image !== '' && !isAllowedImageSrc(product.image)) {
    return { ok: false, error: `Image not allowed: ${brief(product.image)} (upload it, or use a garmin.com image)` };
  }
  if (product.images !== undefined) {
    if (!Array.isArray(product.images)) return { ok: false, error: 'images must be a list' };
    for (const img of product.images) {
      if (!img || !isAllowedImageSrc(img.src)) {
        return { ok: false, error: `Image not allowed: ${brief(img && img.src)} (upload it, or use a garmin.com image)` };
      }
    }
  }
  if (product.options !== undefined) {
    if (!Array.isArray(product.options)) return { ok: false, error: 'options must be a list' };
    for (const option of product.options) {
      for (const value of (option && option.values) || []) {
        if (value.swatchColor !== undefined && value.swatchColor !== '' && !HEX_COLOR.test(String(value.swatchColor))) {
          return { ok: false, error: `Swatch color must be a hex color like #1a2b3c: ${brief(value.swatchColor)}` };
        }
        if (value.swatchImage !== undefined && value.swatchImage !== '' && !isAllowedImageSrc(value.swatchImage)) {
          return { ok: false, error: `Swatch image not allowed: ${brief(value.swatchImage)}` };
        }
      }
    }
  }
  return { ok: true, product };
}
