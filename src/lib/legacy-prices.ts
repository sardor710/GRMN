// Task 5a.2 fix round 1: the ONE place where legacy JSON prices become tenge.
// The seed catalogue in the JSON store predates the garmin.com importer and holds USD-scale numbers
// (Forerunner 970 = 749.99). Those records are marked explicitly with `currency: "USD"`
// (scripts/mark-legacy-usd-prices.mjs); everything else is tenge: imported products, and every product an
// admin saves (store.saveProduct stamps `currency: "KZT"`, matching the "₸ KZT" admin price fields).
// A record without a currency is therefore tenge, never multiplied by the rate (fix round 2). Legacy amounts are converted at the importer's remembered
// "KZT per 1 USD" rate (StoreSettings.importRateKztPerUsd) before any of them reaches a KztAmount.
// Without a rate the number is left as is and marked "USD" (unconverted): the storefront then prints the
// bare number with no currency sign, never a wrong tenge value.
import type { CMSProduct } from "./cms/types.ts";
import { usdMajorToKztMajor } from "./money.ts";

/** "KZT" = a tenge amount; "USD" = a legacy number that could not be converted (shown without a currency sign). */
export type StorefrontCurrency = "KZT" | "USD";

/** Only an explicit `currency: "USD"` marks USD-scale numbers; a missing currency means tenge. */
export function isLegacyUsdProduct(product: Pick<CMSProduct, "currency">): boolean {
  return product.currency === "USD";
}

/** Product prices in tenge (legacy amounts converted at `rate`), with `currency` saying which one the numbers are. */
export function withStorefrontPrices(product: CMSProduct, rate: number | undefined): CMSProduct & { currency: StorefrontCurrency } {
  if (!isLegacyUsdProduct(product)) return { ...product, currency: "KZT" };
  const price = usdMajorToKztMajor(product.price, rate);
  if (price === null) return { ...product, currency: "USD" };
  const convert = (value: number | undefined) => (value === undefined ? undefined : usdMajorToKztMajor(value, rate) ?? undefined);
  return {
    ...product,
    currency: "KZT",
    price,
    originalPrice: convert(product.originalPrice),
    ...(product.variants ? { variants: product.variants.map(variant => ({ ...variant, price: convert(variant.price ?? undefined) ?? variant.price, originalPrice: convert(variant.originalPrice) })) } : {}),
  };
}

/** Static legacy USD amounts (e.g. the fēnix 8 accessories) in tenge, or unconverted when there is no rate. */
export function legacyAmountsInKzt<T extends { price: number }>(items: T[], rate: number | undefined): (T & { currency: StorefrontCurrency })[] {
  return items.map(item => {
    const price = usdMajorToKztMajor(item.price, rate);
    return price === null ? { ...item, currency: "USD" as const } : { ...item, price, currency: "KZT" as const };
  });
}
