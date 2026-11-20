import type { Metadata, MetadataRoute } from "next";
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
  | "selectLocation"
  | "minisite:fenix-8"
  | "minisite:marq"
  | "minisite:marq2"
  | "minisite:why-garmin"
  | "minisite:garmin-pay";

export const SITE_URL: string = core.SITE_URL;
export const absoluteUrl: (path: string) => string = (path) => core.absoluteUrl(path);
export const localizedUrl: (path: string, locale: Locale) => string = (path, locale) => core.localizedUrl(path, locale);

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
  openGraph: { url: string; siteName: string; locale: string; alternateLocale: string[] };
} {
  const { locale, indexedLocales, noIndex } = input;
  const { canonical, languages } = buildAlternates(input);
  const selfUrl = buildAlternates({ ...input, canonicalOverride: undefined }).canonical;
  const indexable = isIndexable(locale, indexedLocales);
  return {
    alternates: Object.keys(languages).length > 0 ? { canonical, languages } : { canonical },
    robots: noIndex
      ? { index: false, follow: false }
      : indexable
        ? { ...DEFAULT_ROBOTS }
        : { index: false, follow: true },
    openGraph: {
      url: selfUrl,
      siteName: "Garmin",
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale && indexedLocales.includes(l)).map((l) => OG_LOCALE[l]),
    },
  };
}

export interface SitemapRoute {
  /** Unprefixed path, "/" for home. */
  path: string;
  indexedLocales: readonly Locale[];
  lastModified?: Date;
  priority?: number;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
}

export function buildSitemapEntries(baseUrl: string, routes: SitemapRoute[]): MetadataRoute.Sitemap {
  return core.buildSitemapEntries(
    baseUrl,
    routes.map((r) => ({ ...r, indexedLocales: [...r.indexedLocales] })),
  ) as MetadataRoute.Sitemap;
}

/** JSON-LD script body with `<`, `>`, `&`, U+2028/2029 escaped (safe inside `<script>`). */
export function serializeJsonLd(value: unknown): string {
  return core.serializeJsonLd(value);
}
