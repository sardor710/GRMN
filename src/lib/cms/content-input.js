// Validate/normalize blog, banner, settings and homepage payloads from the admin (pure; used by the
// API routes and tests). Base values and their ru/kk translations share field limits and sanitizers.
import sanitizeHtml from 'sanitize-html';
import { BLOG_SPEC, BANNER_SPEC, SETTINGS_SPEC, HOMEPAGE_SPEC } from '../../i18n/translate-record.js';
import { findBaseLimitViolation, mergeTranslationsSafely } from './translation-input.js';
import { validateHomepageConfig } from './homepage-schema.js';

const ENTITIES = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#0*39;|&#x0*27;/gi, "'"],
  [/&amp;/g, '&'],
];

/**
 * Blog bodies are plain text/markdown rendered as React text (never as HTML). Strip every tag (script
 * and style contents included) and turn the parser's entity escapes back into characters, so
 * "Tom & Jerry" stays readable. Used for the base `content` and every translated `content`.
 */
export function sanitizeBlogContent(text) {
  const stripped = sanitizeHtml(String(text ?? ''), { allowedTags: [], allowedAttributes: {} });
  return ENTITIES.reduce((s, [re, ch]) => s.replace(re, ch), stripped);
}

export const BLOG_HTML_FIELDS = Object.freeze({ content: sanitizeBlogContent });

function withTranslations(record, existing, spec, html) {
  if (!('translations' in record)) return { ok: true };
  const merged = mergeTranslationsSafely(existing, record.translations, spec, html);
  if (!merged.ok) return merged;
  record.translations = merged.translations;
  return { ok: true };
}

/** @returns {{ ok: true, blog: object } | { ok: false, error: string }} */
export function sanitizeBlogInput(body, existing) {
  const blog = { ...(body || {}) };
  const tooLong = findBaseLimitViolation(blog, BLOG_SPEC);
  if (tooLong) return { ok: false, error: tooLong };
  if ('content' in blog) blog.content = typeof blog.content === 'string' ? sanitizeBlogContent(blog.content) : '';
  const t = withTranslations(blog, existing, BLOG_SPEC, BLOG_HTML_FIELDS);
  if (!t.ok) return t;
  return { ok: true, blog };
}

/** @returns {{ ok: true, banner: object } | { ok: false, error: string }} */
export function sanitizeBannerInput(body, existing) {
  const banner = { ...(body || {}) };
  const tooLong = findBaseLimitViolation(banner, BANNER_SPEC);
  if (tooLong) return { ok: false, error: tooLong };
  const t = withTranslations(banner, existing, BANNER_SPEC);
  if (!t.ok) return t;
  return { ok: true, banner };
}

/** @returns {{ ok: true, settings: object } | { ok: false, error: string }} */
export function sanitizeSettingsInput(body, existing) {
  const settings = { ...(body || {}) };
  const tooLong = findBaseLimitViolation(settings, SETTINGS_SPEC);
  if (tooLong) return { ok: false, error: tooLong };
  const t = withTranslations(settings, existing, SETTINGS_SPEC);
  if (!t.ok) return t;
  return { ok: true, settings };
}

/**
 * The homepage is saved whole, so a body without `translations` keeps the stored root overlay.
 * @returns {{ ok: true, config: object } | { ok: false, error: string, details?: string[] }}
 */
export function sanitizeHomepageInput(body, existing) {
  const validation = validateHomepageConfig(body);
  if (!validation.isValid) {
    return { ok: false, error: 'Invalid homepage configuration', details: validation.errors };
  }
  const config = { ...body };
  const tooLong = findBaseLimitViolation(config, HOMEPAGE_SPEC);
  if (tooLong) return { ok: false, error: tooLong };
  if ('translations' in config) {
    const t = withTranslations(config, existing, HOMEPAGE_SPEC);
    if (!t.ok) return t;
  } else if (existing && existing.translations) {
    config.translations = existing.translations;
  }
  return { ok: true, config };
}
