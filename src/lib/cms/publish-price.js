// Price to publish, for both backends (PostgreSQL projection, legacy JSON save, the admin form, the legacy
// price mirror and the read-only data check). Plain JS so `node --test` and scripts can run it; typed wrapper in
// publish-price.ts.
//
// Only what the storefront would sell needs a price above 0, and a published product with variants must sell at
// least one. On a published product the projection keeps a draft or archived editor variant as such and makes
// every other one (a missing status included) active; the storefront and cart sell active variants only.

export const PRICE_TO_PUBLISH = "Set a price above 0 before publishing.";
export const NO_ACTIVE_VARIANT = "Make at least one variant active with a price above 0 before publishing.";

/** A variant's status on a published product, as the projection writes it: a missing status is active. */
export const effectiveVariantStatus = (status) => (status === "draft" || status === "archived" ? status : "active");

/** True when the storefront sells a variant with this editor status (on a published product). */
export const isSellableVariantStatus = (status) => effectiveVariantStatus(status) === "active";

/** The variant the storefront shows for the product: the default while it is sold, else the first sold one. */
export function sellableVariant(variants) {
  const list = Array.isArray(variants) ? variants : [];
  const def = list.find((v) => v.isDefault);
  return def && isSellableVariantStatus(def.status) ? def : list.find((v) => isSellableVariantStatus(v.status));
}

/** The readable refusal for a findUnpricedForPublish result. */
export function unpricedMessage(found) {
  if (found.reason === "noActive") return NO_ACTIVE_VARIANT;
  if (found.reason !== "variant" || !found.variant) return PRICE_TO_PUBLISH;
  const sku = String(found.variant.sku ?? "").trim();
  const title = String(found.variant.title ?? "").trim();
  return `Set a price above 0 for ${title ? `${title} (${sku})` : sku} before publishing.`;
}

/**
 * What blocks publishing on price, or null. `product`: { published, hasVariants, price, variants[] } where
 * `hasVariants` is "has options and variants" (otherwise the product sells its own price) and each variant has
 * { sku, title, status, price }. `isPositive(price)` says whether a price is above 0 (minor units as BigInt for
 * PostgreSQL, Number for the legacy store). Returns { reason: "price" } for the product's own price,
 * { reason: "variant", variant } for the first sold variant without a price, or { reason: "noActive" } when no
 * variant is sold at all.
 */
export function findUnpricedForPublish(product, isPositive) {
  if (!product.published) return null;
  if (!product.hasVariants) return isPositive(product.price) ? null : { reason: "price" };
  const sold = (product.variants ?? []).filter((v) => isSellableVariantStatus(v.status));
  const variant = sold.find((v) => !isPositive(v.price));
  if (variant) return { reason: "variant", variant };
  return sold.length ? null : { reason: "noActive" };
}

const positiveNumber = (price) => Number(price) > 0;

/** True when the record sells variants (options and variants), the rule both backends use. */
export const hasSellableOptions = (product) =>
  Array.isArray(product.options) && product.options.length > 0 && Array.isArray(product.variants) && product.variants.length > 0;

/**
 * The legacy JSON store's refusal for a product record as the store keeps it (after syncLegacyFields; a product
 * saved without a status is published), or null. Options with no variants sell the product price, like PostgreSQL.
 */
export function legacyPublishRefusal(product) {
  const found = findUnpricedForPublish({
    published: (product.status ?? "published") === "published",
    hasVariants: hasSellableOptions(product),
    price: product.price,
    variants: Array.isArray(product.variants) ? product.variants : [],
  }, positiveNumber);
  return found ? unpricedMessage(found) : null;
}
