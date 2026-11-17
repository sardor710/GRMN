import * as js from "./config.js";

export type Locale = "en" | "ru" | "kk";

export const LOCALES: readonly Locale[] = js.LOCALES as readonly Locale[];
export const DEFAULT_LOCALE: Locale = js.DEFAULT_LOCALE as Locale;
export const SWITCHER_ORDER: readonly Locale[] = js.SWITCHER_ORDER as readonly Locale[];

export const INTL_LOCALE: Record<Locale, string> = js.INTL_LOCALE as Record<Locale, string>;
export const OG_LOCALE: Record<Locale, string> = js.OG_LOCALE as Record<Locale, string>;
export const LOCALE_LABEL: Record<Locale, string> = js.LOCALE_LABEL as Record<Locale, string>;

export function isLocale(value: string): value is Locale {
  return js.isLocale(value);
}
