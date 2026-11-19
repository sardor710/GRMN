// Pure CMS translation overlay resolver. A record keeps its English fields as the
// source of truth and may carry `translations: { ru?: Partial<...>, kk?: Partial<...> }`.
//
// FieldSpec (declarative, recursive):
//   scalars:     string fields replaced by the overlay when it is a non-blank string
//   stringLists: string[] fields merged by index (blank entries fall back, extra rows ignored)
//   lists:       arrays of objects merged by index, each item resolved with the nested spec
//   keyed:       arrays of objects whose overlay is a Record<itemId, Partial<item>>, nested spec
//   idPatches:   overlay maps Record<id, string> patching `field` on items found by walking
//                `path` (array fields) of the base record, e.g. valueLabels -> options.values.label

import { LOCALES } from './config.js';

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function applyIdPatch(node, path, field, map) {
  if (path.length === 0) {
    if (isPlainObject(node) && typeof node.id === 'string' && Object.hasOwn(map, node.id)) {
      const next = map[node.id];
      if (!isBlank(next)) node[field] = next;
    }
    return;
  }
  const [head, ...rest] = path;
  const list = isPlainObject(node) ? node[head] : undefined;
  if (!Array.isArray(list)) return;
  for (const child of list) applyIdPatch(child, rest, field, map);
}

function mergeInto(target, overlay, spec) {
  if (!isPlainObject(overlay)) return;

  for (const key of spec.scalars ?? []) {
    if (!isBlank(overlay[key])) target[key] = overlay[key];
  }

  for (const key of spec.stringLists ?? []) {
    const rows = overlay[key];
    if (!Array.isArray(rows) || !Array.isArray(target[key])) continue;
    target[key] = target[key].map((base, i) => (isBlank(rows[i]) ? base : rows[i]));
  }

  for (const [key, nested] of Object.entries(spec.lists ?? {})) {
    const rows = overlay[key];
    if (!Array.isArray(rows) || !Array.isArray(target[key])) continue;
    target[key].forEach((item, i) => mergeInto(item, rows[i], nested));
  }

  for (const [key, nested] of Object.entries(spec.keyed ?? {})) {
    const byId = overlay[key];
    if (!isPlainObject(byId) || !Array.isArray(target[key])) continue;
    for (const item of target[key]) {
      if (isPlainObject(item) && typeof item.id === 'string' && Object.hasOwn(byId, item.id)) {
        mergeInto(item, byId[item.id], nested);
      }
    }
  }

  for (const patch of spec.idPatches ?? []) {
    const map = overlay[patch.map];
    if (!isPlainObject(map)) continue;
    applyIdPatch(target, patch.path, patch.field, map);
  }
}

export function localizeRecord(record, locale, spec) {
  const out = clone(record);
  const overlay = locale === 'en' ? undefined : record?.translations?.[locale];
  delete out.translations;
  if (overlay) mergeInto(out, overlay, spec);
  return out;
}

export function localizeList(records, locale, fn) {
  return records.map((record) => fn(record, locale));
}

export function isRecordTranslated(record, locale, requiredFields) {
  if (locale === 'en') return true;
  const overlay = record?.translations?.[locale];
  if (!isPlainObject(overlay)) return false;
  return requiredFields.every((field) => {
    const value = overlay[field];
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return false;
  });
}

export const PRODUCT_SPEC = Object.freeze({
  scalars: ['name', 'description', 'overviewHtml', 'seoTitle', 'seoDescription', 'priceSuffix'],
  stringLists: ['inTheBox'],
  lists: {
    specs: { scalars: ['label', 'value'] },
    features: { scalars: ['title', 'body'] },
    specGroups: { scalars: ['title'], lists: { items: { scalars: ['label', 'value'] } } },
  },
  idPatches: [
    { map: 'optionNames', path: ['options'], field: 'name' },
    { map: 'valueLabels', path: ['options', 'values'], field: 'label' },
    { map: 'variantTitles', path: ['variants'], field: 'title' },
    { map: 'imageAlts', path: ['images'], field: 'alt' },
  ],
});

export const BLOG_SPEC = Object.freeze({
  scalars: ['title', 'excerpt', 'content', 'category', 'readingTime', 'seoTitle', 'seoDescription'],
});

export const BANNER_SPEC = Object.freeze({ scalars: ['title', 'subtitle', 'ctaLabel'] });

export const SETTINGS_SPEC = Object.freeze({ scalars: ['seoTitle', 'seoDescription'] });

export const HOMEPAGE_SPEC = Object.freeze({
  keyed: {
    heroBanners: { scalars: ['title', 'subtitle', 'disclaimer'] },
    carousels: {
      scalars: ['title', 'subtitle'],
      keyed: { items: { scalars: ['title', 'description', 'badge', 'ctaText', 'imageAlt'] } },
    },
    promoTiles: { scalars: ['title', 'cta'] },
    storyTiles: { scalars: ['title', 'cta'] },
    categoryTiles: { scalars: ['title', 'cta'] },
  },
});

export const localizeProduct = (record, locale) => localizeRecord(record, locale, PRODUCT_SPEC);
export const localizeBlog = (record, locale) => localizeRecord(record, locale, BLOG_SPEC);
export const localizeBanner = (record, locale) => localizeRecord(record, locale, BANNER_SPEC);
export const localizeHomepage = (record, locale) => localizeRecord(record, locale, HOMEPAGE_SPEC);
export const localizeSettings = (record, locale) => localizeRecord(record, locale, SETTINGS_SPEC);

/** Locales a record is translated into for indexing: `en` always, plus each locale whose required fields are present. */
export function translatedLocales(record, requiredFields) {
  return LOCALES.filter((locale) => isRecordTranslated(record, locale, requiredFields));
}

/**
 * SEO text for a raw (un-localized) record. `fields` is ordered by priority, e.g. ['seoTitle','name'].
 * ru/kk: translated overlay fields in that order, then the base value of the first (SEO) field.
 * en: the base value of the first (SEO) field only, so English output is unchanged.
 * Returns undefined when nothing applies; the caller then uses its own template/fallback.
 */
export function resolveSeoText(raw, locale, fields) {
  const usable = (v) => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
  if (locale !== 'en') {
    const overlay = raw?.translations?.[locale];
    for (const field of fields) {
      const v = usable(overlay?.[field]);
      if (v) return v;
    }
  }
  return usable(raw?.[fields[0]]);
}

/**
 * R18: whether the homepage's main CMS copy is translated for `locale` (en always is).
 * Required: a non-blank overlay title for every rendered hero banner (active, non-blank English
 * title) and every rendered carousel block (active, with items, non-blank English title).
 * With nothing CMS-rendered the page falls back to static English slides, so that is untranslated.
 */
export function isHomepageTranslated(config, locale) {
  if (locale === 'en') return true;
  const overlay = config?.translations?.[locale];
  if (!isPlainObject(overlay)) return false;
  const hero = (Array.isArray(config.heroBanners) ? config.heroBanners : []).filter(
    (b) => b && b.active !== false && !isBlank(b.title),
  );
  const carousels = (Array.isArray(config.carousels) ? config.carousels : []).filter(
    (c) => c && c.active !== false && Array.isArray(c.items) && c.items.length > 0 && !isBlank(c.title),
  );
  if (hero.length === 0 && carousels.length === 0) return false;
  const titled = (map, id) => isPlainObject(map) && isPlainObject(map[id]) && !isBlank(map[id].title);
  return (
    hero.every((b) => titled(overlay.heroBanners, b.id)) &&
    carousels.every((c) => titled(overlay.carousels, c.id))
  );
}

/** Locales the homepage may be indexed in (en always, ru/kk per `isHomepageTranslated`). */
export function homepageLocales(config) {
  return LOCALES.filter((locale) => isHomepageTranslated(config, locale));
}
