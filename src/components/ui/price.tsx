import type { ReactNode } from "react";
import { formatKzt, formatUnconverted, kztSaving, type KztAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Task 5a.2: the one price on the storefront (garmin.com `g-price`, docs/research/www.garmin.com/components/Price.spec.md).
 * Always tenge in the page locale, two decimals, proportional Roboto figures. A sale is the struck-through
 * original, then the optional "Save <amount>", then the price in bold. Never red.
 *
 * - `card`   PLP / carousel card: 16/24 700; strike 16 400 `margin-right:3px`; "and up" suffix 12/24 400.
 * - `pdp`    product buy box: stacked, `margin:16px 0 4px`; line 1 strike 14/24 400 + "Save" 14/21; line 2 20/24 700.
 * - `inline` cart, checkout, account rows: inherits size and weight from the surrounding text.
 */
export type PriceSize = "card" | "pdp" | "inline";

export interface PriceProps {
  amount: KztAmount;
  /** The original price; a sale is shown only when it is higher than `amount`. */
  compareAt?: KztAmount | null;
  /** Storefront locale ("en" | "ru" | "kk") or an Intl tag ("ru-RU"); tenge is always formatted for Kazakhstan. */
  locale: string;
  size?: PriceSize;
  /** Text after the price, e.g. "and up" on a card. */
  suffix?: ReactNode;
  /** Renders the saving text (e.g. `t("save", { amount })` → "Save 50 000,00 ₸"). Omit to hide it (Garmin cards show none). */
  saveLabel?: (amount: string) => ReactNode;
  /** A legacy amount with no KZT-per-USD rate: print the bare number, no currency sign (src/lib/legacy-prices.ts). */
  unconverted?: boolean;
  className?: string;
}

export function Price({ amount, compareAt, locale, size = "inline", suffix, saveLabel, unconverted, className }: PriceProps) {
  const format = unconverted ? formatUnconverted : formatKzt;
  const price = format(amount, locale);
  const saving = compareAt ? kztSaving(compareAt, amount) : null;
  const original = saving && compareAt ? format(compareAt, locale) : null;
  const save = saving && saveLabel ? saveLabel(format(saving, locale)) : null;

  if (size === "pdp") {
    return (
      <div data-price="pdp" className={cn("mt-4 mb-1 flex flex-col text-[20px] font-bold leading-[24px] text-black", className)}>
        {original && (
          // garmin.com .g__price--strike: the line is struck; "Save" is inline-flex (so not struck) 8px after the amount.
          <p className="text-[14px] font-normal leading-[24px] line-through">
            <span data-price-original>{original}</span>
            {save && <span data-price-save className="ml-2 inline-flex text-[14px] leading-[21px]">{save}</span>}
          </p>
        )}
        <p data-price-current className="flex items-baseline">{price}</p>
      </div>
    );
  }

  if (size === "card") {
    return (
      <p data-price="card" className={cn("flex flex-wrap items-end justify-start text-[16px] font-bold leading-[24px] whitespace-pre-wrap", className)}>
        {original && <span data-price-original className="mr-[3px] inline-block font-normal line-through">{original}</span>}
        {save && <span data-price-save className="mr-[3px] inline-block font-normal">{save}</span>}
        <span data-price-current className="inline-block">{price}</span>
        {suffix && <span className="ml-1 text-[12px] font-normal leading-[24px]">{suffix}</span>}
      </p>
    );
  }

  return (
    <span data-price="inline" className={className}>
      {original && <span data-price-original className="mr-[3px] font-normal line-through">{original}</span>}
      {save && <span data-price-save className="mr-[3px] font-normal">{save}</span>}
      <span data-price-current>{price}</span>
      {suffix && <span className="ml-1">{suffix}</span>}
    </span>
  );
}
