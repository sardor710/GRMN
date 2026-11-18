import * as js from "./format.js";
import type { Locale } from "./config";

export type Currency = "USD" | "KZT";
export type DateStyle = "short" | "long";

/** Locale-aware price, e.g. `$1,299.99` (en) or `1 299,99 $` (ru). Currency stays USD (L9). */
export function formatMoney(
  amount: number,
  locale: Locale,
  currency: Currency = "USD",
  options: { grouping?: boolean } = {},
): string {
  return js.formatMoney(amount, locale, currency, options);
}

/** Locale-aware date for an ISO date (`2026-11-17`) or timestamp. */
export function formatDate(iso: string, locale: Locale, style: DateStyle = "long"): string {
  return js.formatDate(iso, locale, style);
}

/** Locale-aware date and time for order history; empty string when `iso` is missing. */
export function formatDateTime(iso: string | undefined, locale: Locale): string {
  return js.formatDateTime(iso, locale);
}
