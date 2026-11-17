import * as js from "./product-variants.js";
import type { CMSProduct, ProductOption, ProductVariant } from "./types";

export const MAX_VARIANTS: number = js.MAX_VARIANTS;
export const WARN_VARIANTS: number = js.WARN_VARIANTS;

export interface GenerateVariantsResult {
  variants: ProductVariant[];
  /** Existing variants that no longer fit (includes merged). */
  removed: number;
  /** Existing variants that collapsed onto one combination after an option was removed. */
  merged: number;
  /** New combinations created (drafts when existing variants cover only part of the matrix). */
  added: number;
  warning?: string;
}

/** Throws RangeError above MAX_VARIANTS combinations. */
export function generateVariants(
  options: ProductOption[],
  existing: ProductVariant[],
  base: { sku: string; price: number; stock: number },
): GenerateVariantsResult {
  return js.generateVariants(options, existing, base) as GenerateVariantsResult;
}

export function selectionSignature(selections: Record<string, string>, options: ProductOption[]): string {
  return js.selectionSignature(selections, options);
}

export function ensureSingleDefault(variants: ProductVariant[]): ProductVariant[] {
  return js.ensureSingleDefault(variants) as ProductVariant[];
}

export function resolveVariant(variants: ProductVariant[], selections: Record<string, string>): ProductVariant | undefined {
  return js.resolveVariant(variants, selections) as ProductVariant | undefined;
}

export function availableValueIds(
  variants: ProductVariant[],
  selections: Record<string, string>,
  optionId: string,
): Set<string> {
  return js.availableValueIds(variants, selections, optionId) as Set<string>;
}

export function sizeBucketFromLabel(label: string): CMSProduct["caseSize"] | undefined {
  return js.sizeBucketFromLabel(label) as CMSProduct["caseSize"] | undefined;
}

export function syncLegacyFields<T extends Partial<CMSProduct>>(product: T): T {
  return js.syncLegacyFields(product) as T;
}

export function findSkuConflicts(
  product: Pick<CMSProduct, "id" | "sku" | "variants">,
  allProducts: Pick<CMSProduct, "id" | "sku" | "variants">[],
): string[] {
  return js.findSkuConflicts(product, allProducts);
}

export function selectValue(
  variants: ProductVariant[],
  selections: Record<string, string>,
  optionId: string,
  valueId: string,
): ProductVariant | undefined {
  return js.selectValue(variants, selections, optionId, valueId) as ProductVariant | undefined;
}

export function isPurchasable(variant: Pick<ProductVariant, "status" | "stock"> | undefined): boolean {
  return js.isPurchasable(variant);
}

export function usesCmsDetail(product: Pick<CMSProduct, "variants" | "overviewHtml">): boolean {
  return js.usesCmsDetail(product);
}
