import * as js from "./routing.js";
import type { Locale } from "./config";

export function isExcludedPath(pathname: string): boolean {
  return js.isExcludedPath(pathname);
}

export function stripLocale(pathname: string): { locale: Locale | null; rest: string } {
  return js.stripLocale(pathname) as { locale: Locale | null; rest: string };
}

export function negotiateLocale(input: { cookie?: string; acceptLanguage?: string }): Locale {
  return js.negotiateLocale(input) as Locale;
}

export function localizeHref(href: string, locale: Locale): string {
  return js.localizeHref(href, locale);
}
