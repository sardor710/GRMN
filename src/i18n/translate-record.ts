import * as js from "./translate-record.js";
import { badgeCode } from "../lib/cms/carousel-badges.ts";
import type { Locale } from "./config";
import type {
  Banner,
  CMSBlog,
  CMSProduct,
  HomepageConfig,
  StoreSettings,
} from "../lib/cms/types";

export interface FieldSpec {
  scalars?: readonly string[];
  stringLists?: readonly string[];
  lists?: Readonly<Record<string, FieldSpec>>;
  keyed?: Readonly<Record<string, FieldSpec>>;
  objects?: Readonly<Record<string, FieldSpec>>;
  idPatches?: readonly { map: string; path: readonly string[]; field: string }[];
}

export const PRODUCT_SPEC: FieldSpec = js.PRODUCT_SPEC;
export const VARIANT_CONTENT_SPEC: FieldSpec = js.VARIANT_CONTENT_SPEC;
export const BLOG_SPEC: FieldSpec = js.BLOG_SPEC;
export const BANNER_SPEC: FieldSpec = js.BANNER_SPEC;
export const SETTINGS_SPEC: FieldSpec = js.SETTINGS_SPEC;
export const HOMEPAGE_SPEC: FieldSpec = js.HOMEPAGE_SPEC;

export function localizeRecord<T extends { translations?: unknown }>(
  record: T,
  locale: Locale,
  spec: FieldSpec,
): T {
  return js.localizeRecord(record, locale, spec) as T;
}

export function localizeList<T>(records: T[], locale: Locale, fn: (r: T, l: Locale) => T): T[] {
  return js.localizeList(records, locale, fn) as T[];
}

export function isRecordTranslated(
  record: { translations?: unknown },
  locale: Locale,
  requiredFields: string[],
): boolean {
  return js.isRecordTranslated(record, locale, requiredFields);
}

/** Generic so partial product shapes (e.g. the admin preview of unsaved form state) localize too. */
export function localizeProduct<T extends Partial<CMSProduct> = CMSProduct>(record: T, locale: Locale): T {
  return localizeRecord(record, locale, PRODUCT_SPEC);
}

export function localizeBlog(record: CMSBlog, locale: Locale): CMSBlog {
  return localizeRecord(record, locale, BLOG_SPEC);
}

export function localizeBanner(record: Banner, locale: Locale): Banner {
  return localizeRecord(record, locale, BANNER_SPEC);
}

export function localizeHomepage(record: HomepageConfig, locale: Locale): HomepageConfig {
  const localized = localizeRecord(record, locale, HOMEPAGE_SPEC);
  // Owner 2026-11-23: a badge code picked in admin (NEW, SALE, SOON…) is localized by the storefront itself, so a
  // stale translated badge text (e.g. an old "Экономия 50 000 KZT") must not replace it.
  const source = new Map(record.carousels.flatMap((carousel) => carousel.items.map((item) => [`${carousel.id}\u0000${item.id}`, (item as { badge?: string }).badge] as const)));
  return {
    ...localized,
    carousels: localized.carousels.map((carousel) => ({
      ...carousel,
      items: carousel.items.map((item) => {
        const badge = source.get(`${carousel.id}\u0000${item.id}`);
        return badge && badgeCode(badge) && (item as { badge?: string }).badge !== badge ? { ...item, badge } : item;
      }),
    })),
  };
}

export function localizeSettings(record: StoreSettings, locale: Locale): StoreSettings {
  return localizeRecord(record, locale, SETTINGS_SPEC);
}

export function translatedLocales(record: { translations?: unknown }, requiredFields: string[]): Locale[] {
  return js.translatedLocales(record, requiredFields) as Locale[];
}

export function resolveSeoText(
  raw: { translations?: unknown } | undefined,
  locale: Locale,
  fields: [string, ...string[]],
): string | undefined {
  return js.resolveSeoText(raw, locale, fields) as string | undefined;
}

/** R18: hero + carousel titles translated for `locale` (en always true). */
export function isHomepageTranslated(config: HomepageConfig | undefined, locale: Locale): boolean {
  return js.isHomepageTranslated(config, locale);
}

/** Locales the homepage is indexed in: en plus each locale passing `isHomepageTranslated`. */
export function homepageLocales(config: HomepageConfig): Locale[] {
  return js.homepageLocales(config) as Locale[];
}
