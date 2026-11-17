import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/** The current storefront locale, narrowed to `Locale` (for `formatMoney` / `formatDate`). */
export function useAppLocale(): Locale {
  const current = useLocale();
  return isLocale(current) ? current : DEFAULT_LOCALE;
}
