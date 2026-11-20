import type { DisplayCurrency, PriceDTO, ProductCardDTO } from "../contracts/commerce.ts";

import { groupMinor, minorToMajor } from "./money.ts";

export { minorToMajor };

/** Legacy `"1,350,000.00 KZT"` label (admin, the USD estimate). Storefront prices use `formatKzt` / `<Price>` (Task 5a.2). */
export function formatMinorMoney(amount: string, currency: DisplayCurrency, locale = "en-US"): string {
  return groupMinor(amount, locale) + " " + currency;
}

export function catalogPriceLabel(price: PriceDTO, requested: DisplayCurrency, locale = "en-US"): string {
  return requested === "USD" && price.usdEquivalent
    ? formatMinorMoney(price.usdEquivalent.amountMinor, "USD", locale) + " (estimate)"
    : formatMinorMoney(price.selling.amountMinor, "KZT", locale);
}

export function catalogCardView(card: ProductCardDTO, currency: DisplayCurrency = "KZT", locale = "en-US"): import("../types").Product {
  return {
    id: card.publicKey, name: card.name, description: card.description,
    image: card.image?.url ?? "", badge: card.badge ?? undefined,
    price: minorToMajor(card.price.selling.amountMinor), priceLabel: catalogPriceLabel(card.price, currency, locale),
    // Task 5a.2: keep the sale (PriceDTO.compareAt) so the card can show the struck original.
    ...(card.price.compareAt ? { compareAt: minorToMajor(card.price.compareAt.amountMinor) } : {}),
    currency: "KZT" as const, purchasable: false, availability: card.availability,
    family: card.family ?? "", activities: card.activities ?? [], level: card.level ?? "Unknown", caseSize: card.caseSize ?? "Unknown",
    priceSuffix: card.priceSuffix,
  };
}
