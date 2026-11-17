import { INTL_LOCALE } from './config.js';

/**
 * Formats a price. The currency stays what the store charges today (USD, L9); only digit
 * grouping, decimal separator and symbol placement follow the locale.
 */
export function formatMoney(amount, locale, currency = 'USD') {
  return new Intl.NumberFormat(INTL_LOCALE[locale] ?? INTL_LOCALE.en, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const DATE_STYLES = {
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  short: { month: 'short', day: 'numeric', year: 'numeric' },
};

/**
 * Formats an ISO date or timestamp. Date-only strings (`2026-11-17`) are calendar dates and are
 * formatted in UTC so they never shift a day; full timestamps use the runtime time zone.
 */
export function formatDate(iso, locale, style = 'long') {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = new Date(dateOnly ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? INTL_LOCALE.en, {
    ...(DATE_STYLES[style] ?? DATE_STYLES.long),
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  }).format(date);
}
