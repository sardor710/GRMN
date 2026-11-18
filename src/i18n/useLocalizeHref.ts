import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, isLocale } from "./config";
import { localizeHref } from "./routing";

/** Returns a function that prefixes internal hrefs (e.g. from data) with the current locale. */
export function useLocalizeHref(): (href: string) => string {
  const current = useLocale();
  const locale = isLocale(current) ? current : DEFAULT_LOCALE;
  return (href: string) => localizeHref(href, locale);
}
