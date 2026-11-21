"use client";

import { useState } from "react";
import type { ProductDetail } from "@/types";
import { ProductTop } from "@/components/ProductTop";
import { ProductTabs } from "@/components/ProductTabs";
import { initialVariantId } from "@/lib/variant-availability";

/**
 * Shares the buy box's selected variant with the tabs, so the Accessories tab follows variant switches.
 * `sku` is the ?sku= deep link (accessory and compatible-device links use it).
 */
export function ProductView({ product, sku }: { product: ProductDetail; sku?: string }) {
  const commerce = product.commerce;
  const [variantId, setVariantId] = useState(() => commerce ? initialVariantId(commerce.variants, { defaultId: commerce.selectedVariantId ?? commerce.defaultVariantId, sku }) : undefined);
  return (
    <>
      <ProductTop product={product} selectedVariantId={variantId} onSelectVariant={setVariantId} />
      <ProductTabs product={product} selectedVariantId={variantId} />
    </>
  );
}
