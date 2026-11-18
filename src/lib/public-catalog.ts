import type { DisplayCurrency, PriceDTO, ProductCardDTO } from "../contracts/commerce.ts";

export function minorToMajor(amount: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(amount)) throw new RangeError("Invalid minor amount");
  return (BigInt(amount) / BigInt(100)).toString() + "." + (BigInt(amount) % BigInt(100)).toString().padStart(2, "0");
}

export function formatMinorMoney(amount: string, currency: DisplayCurrency, locale = "en-US"): string {
  const [whole, cents] = minorToMajor(amount).split(".");
  const parts = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(BigInt(whole));
  return parts.map(part => part.type === "fraction" ? cents : part.value).join("") + " " + currency;
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
    currency: "KZT" as const, purchasable: false, availability: card.availability,
    family: card.family ?? "", activities: card.activities ?? [], level: card.level ?? "Unknown", caseSize: card.caseSize ?? "Unknown",
    priceSuffix: card.priceSuffix,
  };
}
