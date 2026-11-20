"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ProductVariantState {
  selectedVariantId: string;
  setSelectedVariantId: (id: string) => void;
}

const ProductVariantContext = createContext<ProductVariantState | null>(null);

/**
 * Task 2.4: the product page's selected variant, shared by the buy box (ProductTop) and the tabs (ProductTabs) so
 * a size or colour switch swaps Specs, Overview and In the box at once. The server resolves the initial variant
 * from `?variant=<sku>`, so the first paint already shows it.
 */
export function ProductVariantProvider({ initialVariantId, children }: { initialVariantId: string; children: ReactNode }) {
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId);
  const value = useMemo(() => ({ selectedVariantId, setSelectedVariantId }), [selectedVariantId]);
  return <ProductVariantContext.Provider value={value}>{children}</ProductVariantContext.Provider>;
}

export function useProductVariant(): ProductVariantState {
  const state = useContext(ProductVariantContext);
  if (!state) throw new Error("useProductVariant must be used inside ProductVariantProvider");
  return state;
}
