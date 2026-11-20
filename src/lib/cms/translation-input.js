// Validate/normalize `translations` overlays sent by the admin (pure; shared by the API routes and tests).
// Allowed fields come from the storefront FieldSpecs in src/i18n/translate-record.js, so the admin can
// only store what the storefront resolver will read. Every translated field has the same length limit
// as its base field (FIELD_LIMITS, keyed by base field name), and the validators enforce the same
// limits on the English base values.

import { LOCALES } from '../../i18n/config.js';

/** Locales that carry an overlay (English is the base record). */
export const TRANSLATION_LOCALES = Object.freeze(LOCALES.filter((l) => l !== 'en'));

/** Max characters per field, by base field name. Shared by base values and their translations. */
export const FIELD_LIMITS = Object.freeze({
  name: 300,
  title: 300,
  label: 300,
  value: 2000,
  alt: 500,
  imageAlt: 500,
  description: 5000,
  subtitle: 1000,
  excerpt: 1000,
  disclaimer: 2000,
  body: 5000,
  category: 120,
  readingTime: 60,
  priceSuffix: 60,
  ctaLabel: 120,
  ctaText: 120,
  cta: 120,
  badge: 120,
  seoTitle: 300,
  seoDescription: 1000,
  inTheBox: 500,
  overviewHtml: 300000,
  content: 100000,
});
const DEFAULT_LIMIT = 2000;

/** Overlay-only id maps patch a base field; they use that field's limit. */
const MAP_BASE_FIELD = Object.freeze({ optionNames: 'name', valueLabels: 'label', variantTitles: 'title', imageAlts: 'alt' });

/** Max rows in a list overlay and max ids in a keyed/id-map overlay. */
export const MAX_ROWS = 2000;

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function fieldLimit(field) {
  const base = MAP_BASE_FIELD[field] ?? field;
  return FIELD_LIMITS[base] ?? DEFAULT_LIMIT;
}

export class TranslationInputError extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function isUsableId(key) {
  return ID_PATTERN.test(key) && !FORBIDDEN_KEYS.has(key);
}

function toSpec(allowed) {
  if (Array.isArray(allowed)) return { scalars: allowed };
  return allowed || {};
}

/** Trim, enforce the limit, run the field's HTML sanitizer; '' means "missing". */
function cleanString(raw, field, path, html) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const limit = fieldLimit(field);
  if (trimmed.length > limit) {
    throw new TranslationInputError(`${path} is longer than ${limit} characters`);
  }
  if (!trimmed) return '';
  const sanitize = html?.[field];
  return sanitize ? String(sanitize(trimmed)).trim() : trimmed;
}

function dropTrailingEmpty(rows, isEmpty) {
  let end = rows.length;
  while (end > 0 && isEmpty(rows[end - 1])) end -= 1;
  return rows.slice(0, end);
}

const isEmptyObject = (o) => isPlainObject(o) && Object.keys(o).length === 0;

/** Normalize one overlay object against a spec. Returns {} when nothing usable remains. */
function normalizeOverlay(input, spec, path, html) {
  const out = {};
  if (!isPlainObject(input)) return out;

  for (const key of spec.scalars ?? []) {
    const value = cleanString(input[key], key, `${path}.${key}`, html);
    if (value) out[key] = value;
  }

  for (const key of spec.stringLists ?? []) {
    const rows = input[key];
    if (!Array.isArray(rows)) continue;
    if (rows.length > MAX_ROWS) throw new TranslationInputError(`${path}.${key} has more than ${MAX_ROWS} rows`);
    const cleaned = dropTrailingEmpty(
      rows.map((row, i) => cleanString(row, key, `${path}.${key}[${i}]`, html)),
      (v) => v === '',
    );
    if (cleaned.length) out[key] = cleaned;
  }

  for (const [key, nested] of Object.entries(spec.lists ?? {})) {
    const rows = input[key];
    if (!Array.isArray(rows)) continue;
    if (rows.length > MAX_ROWS) throw new TranslationInputError(`${path}.${key} has more than ${MAX_ROWS} rows`);
    const cleaned = dropTrailingEmpty(
      rows.map((row, i) => normalizeOverlay(row, nested, `${path}.${key}[${i}]`, html)),
      isEmptyObject,
    );
    if (cleaned.length) out[key] = cleaned;
  }

  for (const [key, nested] of Object.entries(spec.objects ?? {})) {
    const item = normalizeOverlay(input[key], nested, `${path}.${key}`, html);
    if (!isEmptyObject(item)) out[key] = item;
  }

  for (const [key, nested] of Object.entries(spec.keyed ?? {})) {
    const byId = input[key];
    if (!isPlainObject(byId)) continue;
    const entries = Object.keys(byId);
    if (entries.length > MAX_ROWS) throw new TranslationInputError(`${path}.${key} has more than ${MAX_ROWS} entries`);
    const cleaned = {};
    for (const id of entries) {
      if (!isUsableId(id)) continue;
      const item = normalizeOverlay(byId[id], nested, `${path}.${key}.${id}`, html);
      if (!isEmptyObject(item)) cleaned[id] = item;
    }
    if (Object.keys(cleaned).length) out[key] = cleaned;
  }

  for (const patch of spec.idPatches ?? []) {
    const map = input[patch.map];
    if (!isPlainObject(map)) continue;
    const entries = Object.keys(map);
    if (entries.length > MAX_ROWS) throw new TranslationInputError(`${path}.${patch.map} has more than ${MAX_ROWS} entries`);
    const cleaned = {};
    for (const id of entries) {
      if (!isUsableId(id)) continue;
      const value = cleanString(map[id], patch.map, `${path}.${patch.map}.${id}`, html);
      if (value) cleaned[id] = value;
    }
    if (Object.keys(cleaned).length) out[patch.map] = cleaned;
  }

  return out;
}

/**
 * Keep only ru/kk overlays and the fields `allowed` permits (a FieldSpec, or a list of scalar field names).
 * Strings are trimmed; blank strings are dropped so the storefront falls back to English.
 * `options.html` maps field name → sanitizer (the same function the base field uses).
 * Throws TranslationInputError when a value exceeds its field limit.
 */
export function normalizeTranslations(input, allowed, options = {}) {
  const out = {};
  if (!isPlainObject(input)) return out;
  const spec = toSpec(allowed);
  for (const locale of TRANSLATION_LOCALES) {
    if (!Object.hasOwn(input, locale)) continue;
    const overlay = normalizeOverlay(input[locale], spec, `translations.${locale}`, options.html);
    if (!isEmptyObject(overlay)) out[locale] = overlay;
  }
  return out;
}

/**
 * Per-locale merge for saving: a locale present in `incoming` replaces the stored overlay (an empty one
 * clears it); a locale absent from `incoming` keeps what was stored.
 */
export function mergeTranslations(existing, incoming, allowed, options = {}) {
  const normalized = normalizeTranslations(incoming, allowed, options);
  const stored = isPlainObject(existing) ? existing : {};
  const out = {};
  for (const locale of TRANSLATION_LOCALES) {
    const sent = isPlainObject(incoming) && Object.hasOwn(incoming, locale);
    const value = sent ? normalized[locale] : stored[locale];
    if (isPlainObject(value) && !isEmptyObject(value)) out[locale] = value;
  }
  return out;
}

/**
 * For the CMS validators: shape check, then the per-locale merge with `existingRecord.translations`.
 * Limit errors come back as `{ ok: false, error }`.
 */
export function mergeTranslationsSafely(existingRecord, incoming, allowed, html) {
  if (!isPlainObject(incoming)) return { ok: false, error: 'translations must be an object' };
  try {
    return { ok: true, translations: mergeTranslations(existingRecord?.translations, incoming, allowed, { html }) };
  } catch (err) {
    if (err instanceof TranslationInputError) return { ok: false, error: err.message };
    throw err;
  }
}

/** First base value over its limit, walking the record with the same spec, as an error message. */
export function findBaseLimitViolation(record, allowed) {
  const spec = toSpec(allowed);
  const check = (value, field, path) => {
    if (typeof value === 'string' && value.trim().length > fieldLimit(field)) {
      return `${path} is longer than ${fieldLimit(field)} characters`;
    }
    return null;
  };
  const walk = (node, s, path) => {
    if (!isPlainObject(node)) return null;
    for (const key of s.scalars ?? []) {
      const err = check(node[key], key, `${path}${key}`);
      if (err) return err;
    }
    for (const key of s.stringLists ?? []) {
      if (!Array.isArray(node[key])) continue;
      for (const [i, row] of node[key].entries()) {
        const err = check(row, key, `${path}${key}[${i}]`);
        if (err) return err;
      }
    }
    for (const [key, nested] of Object.entries(s.objects ?? {})) {
      const err = walk(node[key], nested, `${path}${key}.`);
      if (err) return err;
    }
    for (const [key, nested] of [...Object.entries(s.lists ?? {}), ...Object.entries(s.keyed ?? {})]) {
      if (!Array.isArray(node[key])) continue;
      for (const [i, item] of node[key].entries()) {
        const err = walk(item, nested, `${path}${key}[${i}].`);
        if (err) return err;
      }
    }
    for (const patch of s.idPatches ?? []) {
      for (const item of collect(node, patch.path)) {
        const err = check(item[patch.field], patch.map, `${path}${patch.path.join('.')}.${patch.field}`);
        if (err) return err;
      }
    }
    return null;
  };
  return walk(record, spec, '');
}

function collect(node, path) {
  if (path.length === 0) return isPlainObject(node) ? [node] : [];
  const [head, ...rest] = path;
  const list = isPlainObject(node) ? node[head] : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((child) => collect(child, rest));
}

/** Count translatable base strings and how many have a non-blank overlay value. */
function countProgress(base, overlay, spec) {
  let total = 0;
  let done = 0;
  const ov = isPlainObject(overlay) ? overlay : {};
  for (const key of spec.scalars ?? []) {
    if (isBlank(base?.[key])) continue;
    total += 1;
    if (!isBlank(ov[key])) done += 1;
  }
  for (const key of spec.stringLists ?? []) {
    if (!Array.isArray(base?.[key])) continue;
    base[key].forEach((row, i) => {
      if (isBlank(row)) return;
      total += 1;
      if (Array.isArray(ov[key]) && !isBlank(ov[key][i])) done += 1;
    });
  }
  for (const [key, nested] of Object.entries(spec.lists ?? {})) {
    if (!Array.isArray(base?.[key])) continue;
    base[key].forEach((item, i) => {
      const r = countProgress(item, Array.isArray(ov[key]) ? ov[key][i] : undefined, nested);
      total += r.total;
      done += r.done;
    });
  }
  for (const [key, nested] of Object.entries(spec.objects ?? {})) {
    if (!isPlainObject(base?.[key])) continue;
    const r = countProgress(base[key], ov[key], nested);
    total += r.total;
    done += r.done;
  }
  for (const [key, nested] of Object.entries(spec.keyed ?? {})) {
    if (!Array.isArray(base?.[key])) continue;
    for (const item of base[key]) {
      const id = isPlainObject(item) && typeof item.id === 'string' ? item.id : undefined;
      const sub = id && isPlainObject(ov[key]) && Object.hasOwn(ov[key], id) ? ov[key][id] : undefined;
      const r = countProgress(item, sub, nested);
      total += r.total;
      done += r.done;
    }
  }
  for (const patch of spec.idPatches ?? []) {
    const map = isPlainObject(ov[patch.map]) ? ov[patch.map] : {};
    for (const item of collect(base, patch.path)) {
      if (isBlank(item[patch.field])) continue;
      total += 1;
      if (typeof item.id === 'string' && Object.hasOwn(map, item.id) && !isBlank(map[item.id])) done += 1;
    }
  }
  return { total, done };
}

function hasContent(value) {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(hasContent);
  if (isPlainObject(value)) return Object.values(value).some(hasContent);
  return false;
}

/**
 * Completeness of one locale's overlay.
 * With `requiredFields`: complete when all are translated, partial when anything is, else empty.
 * Without: complete when every present (non-blank) base field is translated.
 */
export function translationStatus(record, locale, allowed, requiredFields) {
  const overlay = record?.translations?.[locale];
  if (requiredFields && requiredFields.length) {
    const complete = isPlainObject(overlay) && requiredFields.every((f) => hasContent(overlay[f]));
    if (complete) return 'complete';
    return hasContent(overlay) ? 'partial' : 'empty';
  }
  const { total, done } = countProgress(record, overlay, toSpec(allowed));
  if (done === 0) return 'empty';
  return done >= total ? 'complete' : 'partial';
}
