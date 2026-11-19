import * as js from "./routing.js";
import type { Locale } from "./config";

export function isExcludedPath(pathname: string): boolean {
  return js.isExcludedPath(pathname);
}

export function stripLocale(pathname: string): { locale: Locale | null; rest: string } {
  return js.stripLocale(pathname) as { locale: Locale | null; rest: string };
}

export function localeSegment(locale: Locale): string {
  return js.localeSegment(locale);
}

export function legacySegmentRedirect(pathname: string, search: string): string | null {
  return js.legacySegmentRedirect(pathname, search);
}

export function internalLocalePath(pathname: string): string | null {
  return js.internalLocalePath(pathname);
}

export function negotiateLocale(input: { cookie?: string; acceptLanguage?: string }): Locale {
  return js.negotiateLocale(input) as Locale;
}

export function localizeHref(href: string, locale: Locale): string {
  return js.localizeHref(href, locale);
}

export function decideLocaleRedirect(
  pathname: string,
  search: string,
  cookie?: string,
  acceptLanguage?: string,
): string | null {
  return js.decideLocaleRedirect(pathname, search, cookie, acceptLanguage);
}

export const LOCALE_REDIRECT_HEADERS: Readonly<Record<"Vary" | "Cache-Control", string>> =
  js.LOCALE_REDIRECT_HEADERS;

export function cmsRedirectLookupPaths(pathname: string): string[] {
  return js.cmsRedirectLookupPaths(pathname);
}

export function localizeCmsRedirectTarget(target: string, requestPath: string): string {
  return js.localizeCmsRedirectTarget(target, requestPath);
}
