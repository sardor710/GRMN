export const LOCALES = Object.freeze(['en', 'ru', 'kk']);
export const DEFAULT_LOCALE = 'ru';
export const SWITCHER_ORDER = Object.freeze(['kk', 'ru', 'en']);
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const INTL_LOCALE = Object.freeze({ en: 'en-US', ru: 'ru-RU', kk: 'kk-KZ' });
export const OG_LOCALE = Object.freeze({ en: 'en_US', ru: 'ru_RU', kk: 'kk_KZ' });
export const LOCALE_LABEL = Object.freeze({ en: 'English', ru: 'Русский', kk: 'Қазақша' });

// Owner 2026-11-19: Kazakh is shown as "KZ" and served under /kz/… (the internal locale stays the
// ISO 639-1 code "kk": message catalogs, stored translations, hreflang and <html lang>).
export const LOCALE_SEGMENT = Object.freeze({ en: 'en', ru: 'ru', kk: 'kz' });
export const LOCALE_CODE_LABEL = Object.freeze({ en: 'EN', ru: 'RU', kk: 'KZ' });
/** The locale for a URL segment ("kz" → "kk"), or null. */
export function localeFromSegment(segment) {
  for (const locale of LOCALES) if (LOCALE_SEGMENT[locale] === segment) return locale;
  return null;
}

export function isLocale(value) {
  return typeof value === 'string' && LOCALES.includes(value);
}
