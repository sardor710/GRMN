// Task 2.4 (owner 2026-11-19): the product page keeps the chosen variant in `?variant=<sku>` and shows that
// variant's own Specs, Overview and In the box. Pure helpers shared by the page (server) and the client context.
import type { ProductDetail } from "@/types";

/** The URL parameter that holds the selected variant's SKU on PostgreSQL product pages. */
export const VARIANT_PARAM = "variant";

interface SelectableVariant { id: string; sku: string }

/** Reads `?variant=` from a page's resolved searchParams (the first value when repeated). */
export function variantParam(searchParams: Readonly<Record<string, string | string[] | undefined>>): string | undefined {
  const raw = searchParams[VARIANT_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

/**
 * The variant to show first: the one whose SKU matches `requestedSku` (case-insensitive), else the product's
 * default. The list only holds variants on sale, so an unknown, draft or archived SKU falls back to the default.
 */
export function resolveInitialVariantId(
  variants: readonly SelectableVariant[],
  requestedSku: string | null | undefined,
  defaultId?: string,
): string {
  const wanted = requestedSku?.trim().toLowerCase();
  const match = wanted ? variants.find((v) => v.sku.trim().toLowerCase() === wanted) : undefined;
  if (match) return match.id;
  if (defaultId && variants.some((v) => v.id === defaultId)) return defaultId;
  return variants[0]?.id ?? "";
}

/** `href` with `?variant=<sku>` set; the path, other parameters and the hash are kept. */
export function withVariantParam(href: string, sku: string): string {
  const url = new URL(href);
  url.searchParams.set(VARIANT_PARAM, sku);
  return url.toString();
}

export type VariantTabContent = Pick<ProductDetail, "specs" | "specGroups" | "overviewHtml" | "inTheBox">;

/**
 * What the Specs, Overview and In the box tabs show for the selected variant. Without a PostgreSQL variant the
 * product's own blocks are shown unchanged (legacy JSON CMS). A block the variant inherited empty from an empty
 * product block keeps the page's editorial fallback; an owned empty block stays empty.
 */
export function variantTabContent(product: ProductDetail, variantId: string): VariantTabContent {
  const base: VariantTabContent = {
    specs: product.specs,
    inTheBox: product.inTheBox,
    ...(product.specGroups ? { specGroups: product.specGroups } : {}),
    ...(product.overviewHtml ? { overviewHtml: product.overviewHtml } : {}),
  };
  const commerce = product.commerce;
  const variant = commerce?.variants.find((v) => v.id === variantId);
  if (!commerce || !variant) return base;
  const { content } = variant;
  const inheritedEmpty = (own: readonly unknown[], productBlock: readonly unknown[]) => own.length === 0 && productBlock.length === 0;
  return {
    specs: inheritedEmpty(content.specs, commerce.specs) ? product.specs : content.specs,
    inTheBox: inheritedEmpty(content.inTheBox, commerce.inTheBox) ? product.inTheBox : content.inTheBox,
    ...(content.specGroups.length ? { specGroups: content.specGroups } : {}),
    ...(content.overviewHtml ? { overviewHtml: content.overviewHtml } : {}),
  };
}
