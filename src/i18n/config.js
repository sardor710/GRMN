export const LOCALES = Object.freeze(['en', 'ru', 'kk']);
export const DEFAULT_LOCALE = 'ru';
export const SWITCHER_ORDER = Object.freeze(['kk', 'ru', 'en']);
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const INTL_LOCALE = Object.freeze({ en: 'en-US', ru: 'ru-RU', kk: 'kk-KZ' });
export const OG_LOCALE = Object.freeze({ en: 'en_US', ru: 'ru_RU', kk: 'kk_KZ' });
export const LOCALE_LABEL = Object.freeze({ en: 'English', ru: 'Русский', kk: 'Қазақша' });

export function isLocale(value) {
  return typeof value === 'string' && LOCALES.includes(value);
}
