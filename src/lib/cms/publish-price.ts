import * as js from "./publish-price.js";

/** A variant as the price-to-publish rule reads it (editor status; price in the caller's unit). */
export interface PublishPriceVariant<P> { sku: string; title?: string; status?: string; price: P }

export interface PublishPriceProduct<P> {
  published: boolean;
  /** The product has options and variants (otherwise it sells its own price). */
  hasVariants: boolean;
  price: P;
  variants: readonly PublishPriceVariant<P>[];
}

export const PRICE_TO_PUBLISH: string = js.PRICE_TO_PUBLISH;

/** True when the storefront sells a variant with this editor status (on a published product). */
export function isSellableVariantStatus(status: string | undefined): boolean {
  return js.isSellableVariantStatus(status);
}

/** The readable refusal: the generic message for the product price, or one naming the variant. */
export function unpricedMessage(variant: Pick<PublishPriceVariant<unknown>, "sku" | "title"> | null): string {
  return js.unpricedMessage(variant);
}

/** What blocks publishing on price: `{ variant: null }` for the product price, `{ variant }` for a sellable variant. */
export function findUnpricedForPublish<P, V extends PublishPriceVariant<P>>(
  product: PublishPriceProduct<P> & { variants: readonly V[] },
  isPositive: (price: P) => boolean,
): { variant: V | null } | null {
  return js.findUnpricedForPublish(product, isPositive) as { variant: V | null } | null;
}

/** The legacy JSON store's refusal for a product record as it would be stored, or null. */
export function legacyPublishRefusal(product: {
  status?: string;
  price?: number | string;
  options?: readonly unknown[];
  variants?: readonly PublishPriceVariant<number | string>[];
}): string | null {
  return js.legacyPublishRefusal(product);
}
