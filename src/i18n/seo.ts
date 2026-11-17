import type { Metadata } from "next";
import { LOCALES, OG_LOCALE, type Locale } from "./config";
import * as core from "./seo-core.js";

export type RouteKey =
  | "home"
  | "category"
  | "product"
  | "blogIndex"
  | "blogPost"
  | "compare"
  | "cart"
  | "account"
  | "newsletter"
  | "garminPay"
  | "minisite:fenix-8"
  | "minisite:marq"
  | "minisite:marq2"
  | "minisite:why-garmin"
  | "minisite:garmin-pay";

export const ROUTE_LOCALES = core.ROUTE_LOCALES as Record<RouteKey, readonly Locale[]>;

export interface AlternatesInput {
  path: string;
  locale: Locale;
  indexedLocales: readonly Locale[];
  canonicalOverride?: string;
}

export function buildAlternates(input: AlternatesInput): { canonical: string; languages: Record<string, string> } {
  return core.buildAlternates({ ...input, indexedLocales: [...input.indexedLocales] });
}

export function isIndexable(locale: Locale, indexedLocales: readonly Locale[]): boolean {
  return core.isIndexable(locale, [...indexedLocales]);
}

const DEFAULT_ROBOTS = { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } as const;

interface LocalizedSeoInput {
  /** Unprefixed path, "/" for home. */
  path: string;
  locale: Locale;
  /** Locales the page content is translated into. Defaults are in `ROUTE_LOCALES`. */
  indexedLocales: readonly Locale[];
  canonicalOverride?: string;
  /** Per-record noindex wins over everything. */
  noIndex?: boolean;
}

/** `alternates`, `robots` and the OG locale fields shared by every localized page. */
export function localizedSeo(input: LocalizedSeoInput): Pick<Metadata, "alternates" | "robots"> & {
  openGraph: { url: string; locale: string; alternateLocale: string[] };
} {
  const { locale, indexedLocales, noIndex } = input;
  const { canonical, languages } = buildAlternates(input);
  const selfUrl = buildAlternates({ ...input, canonicalOverride: undefined }).canonical;
  const indexable = isIndexable(locale, indexedLocales);
  return {
    alternates: { canonical, languages },
    robots: noIndex
      ? { index: false, follow: false }
      : indexable
        ? { ...DEFAULT_ROBOTS }
        : { index: false, follow: true },
    openGraph: {
      url: selfUrl,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale && indexedLocales.includes(l)).map((l) => OG_LOCALE[l]),
    },
  };
}
