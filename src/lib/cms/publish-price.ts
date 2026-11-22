import * as js from "./publish-price.js";

/** A variant as the price-to-publish rule reads it (editor status; price in the caller's unit). */
export interface PublishPriceVariant<P> { sku: string; title?: string; status?: string; price: P; isDefault?: boolean }

export interface PublishPriceProduct<P, V extends PublishPriceVariant<P>> {
  published: boolean;
  /** The product has options and variants (otherwise it sells its own price). */
  hasVariants: boolean;
  price: P;
  variants: readonly V[];
}

/** Why publishing is refused on price. */
export type UnpricedReason<V> = { reason: "price" } | { reason: "variant"; variant: V } | { reason: "noActive" };

export const PRICE_TO_PUBLISH: string = js.PRICE_TO_PUBLISH;
export const NO_ACTIVE_VARIANT: string = js.NO_ACTIVE_VARIANT;

/** A variant's status on a published product, as the projection writes it: a missing status is active. */
export function effectiveVariantStatus(status: string | undefined): "active" | "draft" | "archived" {
  return js.effectiveVariantStatus(status) as "active" | "draft" | "archived";
}

/** True when the storefront sells a variant with this editor status (on a published product). */
export function isSellableVariantStatus(status: string | undefined): boolean {
  return js.isSellableVariantStatus(status);
}

/** The variant the storefront shows: the default while it is sold, else the first sold one. */
export function sellableVariant<V extends { status?: string; isDefault?: boolean }>(variants: readonly V[] | undefined): V | undefined {
  return js.sellableVariant(variants) as V | undefined;
}

/** True when the record sells variants (options and variants), the rule both backends use. */
export function hasSellableOptions(product: { options?: readonly unknown[]; variants?: readonly unknown[] }): boolean {
  return js.hasSellableOptions(product);
}

/** The readable refusal for a findUnpricedForPublish result. */
export function unpricedMessage(found: UnpricedReason<Pick<PublishPriceVariant<unknown>, "sku" | "title">>): string {
  return js.unpricedMessage(found);
}

/** What blocks publishing on price, or null. */
export function findUnpricedForPublish<P, V extends PublishPriceVariant<P>>(
  product: PublishPriceProduct<P, V>,
  isPositive: (price: P) => boolean,
): UnpricedReason<V> | null {
  return js.findUnpricedForPublish(product, isPositive) as UnpricedReason<V> | null;
}

/** The legacy JSON store's refusal for a product record as the store keeps it, or null. */
export function legacyPublishRefusal(product: {
  status?: string;
  price?: number | string;
  options?: readonly unknown[];
  variants?: readonly PublishPriceVariant<number | string | null>[];
}): string | null {
  return js.legacyPublishRefusal(product);
}
