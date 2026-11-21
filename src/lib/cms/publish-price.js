// Price to publish, for both backends (PostgreSQL projection, legacy JSON save, the admin form and the
// read-only data check). Plain JS so `node --test` and scripts can run it; typed wrapper in publish-price.ts.
//
// Only what the storefront would sell needs a price above 0: a published product sells its active variants
// (PostgreSQL projects a draft editor variant as a draft row; the storefront and cart read v.status='active',
// and the legacy storefront filters status === "active"). A product without options sells its own price.

export const PRICE_TO_PUBLISH = "Set a price above 0 before publishing.";

/** True when the storefront sells a variant with this editor status (on a published product). */
export const isSellableVariantStatus = (status) => status === "active";

/** The readable refusal: the generic message for the product price, or one naming the variant. */
export function unpricedMessage(variant) {
  if (!variant) return PRICE_TO_PUBLISH;
  const sku = String(variant.sku ?? "").trim();
  const title = String(variant.title ?? "").trim();
  return `Set a price above 0 for ${title ? `${title} (${sku})` : sku} before publishing.`;
}

/**
 * What blocks publishing on price, or null. `product`: { published, hasVariants, price, variants[] } where
 * each variant has { sku, title, status, price }. `isPositive(price)` says whether a price is above 0 (minor
 * units as BigInt for PostgreSQL, Number for the legacy store). Returns { variant: null } when the product's
 * own price is missing, or { variant } for the first sellable variant without a price.
 */
export function findUnpricedForPublish(product, isPositive) {
  if (!product.published) return null;
  if (!product.hasVariants) return isPositive(product.price) ? null : { variant: null };
  const variant = (product.variants ?? []).find((v) => isSellableVariantStatus(v.status) && !isPositive(v.price));
  return variant ? { variant } : null;
}

const positiveNumber = (price) => Number(price) > 0;

/**
 * The legacy JSON store's refusal for a product record as it would be stored (the store publishes a product
 * saved without a status), or null. Options with no variants sell the product price, like PostgreSQL.
 */
export function legacyPublishRefusal(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const hasVariants = Array.isArray(product.options) && product.options.length > 0 && variants.length > 0;
  const found = findUnpricedForPublish({ published: (product.status ?? "published") === "published", hasVariants, price: product.price, variants }, positiveNumber);
  return found ? unpricedMessage(found.variant) : null;
}
