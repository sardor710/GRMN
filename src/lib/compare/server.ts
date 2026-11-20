// Task C-a (plan 2026-11-21 §3): the compare page's server read. Each column goes through the product page's
// own detail read (getProductDetail: PostgreSQL or the legacy JSON store), so prices, images and the chosen
// variant's localized content match the product page exactly.
import "server-only";
import { getProductDetail } from "@/lib/products";
import type { Locale } from "@/i18n/config";
import { collectCompareItems, type CompareItem } from "./resolve";
import type { CompareItemRef } from "./compare-items";

export type { CompareItem, CompareVariantOption } from "./resolve";

/**
 * The compare columns for `items` (from `parseCompareItems`), in order, at most five. An unknown SKU shows the
 * default variant; an unknown, unpublished or unreadable product is dropped. Never throws.
 */
export async function getCompareItems(items: readonly CompareItemRef[], locale: Locale): Promise<CompareItem[]> {
  return collectCompareItems(items, locale, getProductDetail, (error, ref) => {
    console.error("[compare] product read failed", { productId: ref.productId, error: error instanceof Error ? error.message : String(error) });
  });
}
