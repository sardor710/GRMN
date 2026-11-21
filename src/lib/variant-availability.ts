// Pure, browser-safe variant selection for the Postgres product page (M4.5).
// A variant is sellable only when its availability is "available" (free stock = on hand − reserved > 0).
import type { Availability } from "../contracts/commerce.ts";
import type { ProductOptionDTO } from "../contracts/catalog-browse.ts";

export interface SelectableVariant {
  id: string;
  sku: string;
  options: Readonly<Record<string, string>>;
  availability: Availability;
}

export const isAvailable = (variant: Pick<SelectableVariant, "availability"> | undefined) => variant?.availability === "available";

/**
 * The variant the page opens with: a `?sku=` deep link wins (even when out of stock, so the shopper sees why);
 * otherwise the default variant when it is in stock, else the first in-stock variant, else the default.
 */
export function initialVariantId<T extends SelectableVariant>(variants: readonly T[], { defaultId, sku }: { defaultId?: string | null; sku?: string | null } = {}): string | undefined {
  if (sku) {
    const linked = variants.find(v => v.sku.toLowerCase() === sku.toLowerCase());
    if (linked) return linked.id;
  }
  const fallback = variants.find(v => v.id === defaultId) ?? variants[0];
  if (isAvailable(fallback)) return fallback?.id;
  return variants.find(isAvailable)?.id ?? fallback?.id;
}

export interface OptionValueState {
  label: string;
  selected: boolean;
  /** Some variant carrying this value is in stock. Out-of-stock values stay visible but disabled. */
  available: boolean;
}

/** Per option, every value with its selected / in-stock state for the current variant. */
export function optionValueStates(options: readonly ProductOptionDTO[], variants: readonly SelectableVariant[], current: SelectableVariant | undefined): { option: ProductOptionDTO; values: OptionValueState[] }[] {
  return options.map(option => ({
    option,
    // Variants identify values by label, so two stored values with the same label are one choice.
    values: option.values
      .filter((value, index) => option.values.findIndex(other => other.label === value.label) === index)
      .filter(value => variants.some(v => v.options[option.key] === value.label))
      .map(value => ({
        label: value.label,
        selected: current?.options[option.key] === value.label,
        available: variants.some(v => v.options[option.key] === value.label && isAvailable(v)),
      })),
  }));
}

/** The variant reached by picking `label` for `optionKey`: in stock first, then the closest match to the current selection. */
export function chooseOptionValue<T extends SelectableVariant>(variants: readonly T[], current: SelectableVariant | undefined, optionKey: string, label: string): T | undefined {
  let best: T | undefined, bestScore = -1;
  for (const variant of variants) {
    if (variant.options[optionKey] !== label) continue;
    const matches = Object.entries(variant.options).filter(([key, value]) => key !== optionKey && current?.options[key] === value).length;
    const score = (isAvailable(variant) ? 1000 : 0) + matches;
    if (score > bestScore) { best = variant; bestScore = score; }
  }
  return best;
}

export function stockStateText(availability: Availability | undefined): string {
  if (availability === "available") return "In stock";
  if (availability === "out_of_stock") return "Out of stock";
  return "Currently unavailable";
}
