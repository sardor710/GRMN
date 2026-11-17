import * as js from "./translate-record.js";
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
  idPatches?: readonly { map: string; path: readonly string[]; field: string }[];
}

export const PRODUCT_SPEC: FieldSpec = js.PRODUCT_SPEC;
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

export function localizeProduct(record: CMSProduct, locale: Locale): CMSProduct {
  return localizeRecord(record, locale, PRODUCT_SPEC);
}

export function localizeBlog(record: CMSBlog, locale: Locale): CMSBlog {
  return localizeRecord(record, locale, BLOG_SPEC);
}

export function localizeBanner(record: Banner, locale: Locale): Banner {
  return localizeRecord(record, locale, BANNER_SPEC);
}

export function localizeHomepage(record: HomepageConfig, locale: Locale): HomepageConfig {
  return localizeRecord(record, locale, HOMEPAGE_SPEC);
}

export function localizeSettings(record: StoreSettings, locale: Locale): StoreSettings {
  return localizeRecord(record, locale, SETTINGS_SPEC);
}

export function translatedLocales(record: { translations?: unknown }, requiredFields: string[]): Locale[] {
  return js.translatedLocales(record, requiredFields) as Locale[];
}
