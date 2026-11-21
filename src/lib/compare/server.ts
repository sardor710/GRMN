// Task C-a (plan 2026-11-21 §3): the compare page's server read. Each column goes through the product page's
// own detail read (getProductDetail: PostgreSQL or the legacy JSON store), so prices, images and the chosen
// variant's localized content match the product page exactly.
import "server-only";
import { cache } from "react";
import { getProductDetail } from "@/lib/products";
import type { Locale } from "@/i18n/config";
import { collectCompareResult, type CompareResult } from "./resolve";
import type { CompareItemRef } from "./compare-items";

export type { CompareItem, CompareResult, CompareVariantOption } from "./resolve";

/**
 * Memoised per request by product and locale. Only the page calls getCompareItems (generateMetadata reads no
 * product), so the COMPARE_READ_CONCURRENCY limit inside collectCompareResult bounds the whole request; if
 * another caller in the same render ever calls getCompareItems, wrap it in cache() too so the limit holds.
 * collectCompareResult also reads each product once per call (several sizes of one product share it).
 */
const readCompareDetail = cache((productId: string, locale: Locale) => getProductDetail(productId, locale));

/**
 * The compare columns for `items` (from `parseCompareItems`), in order, at most five. An unknown SKU shows the
 * default variant; an unknown or unpublished product is dropped. A product whose read fails is dropped too and
 * listed in `unavailable`, so the client keeps it in the stored selection. Never throws.
 */
export async function getCompareItems(items: readonly CompareItemRef[], locale: Locale): Promise<CompareResult> {
  return collectCompareResult(items, locale, readCompareDetail, (error, ref) => {
    console.error("[compare] product read failed", { productId: ref.productId, error: error instanceof Error ? error.message : String(error) });
  });
}
