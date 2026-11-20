// Task 5a.2: the one money formatter. garmin.com prints every price in the locale's native currency
// format with two decimals (docs/research/www.garmin.com/components/Price.spec.md). The store sells in
// tenge only, so the currency is fixed to KZT: there is no parameter that can print USD.
//
// Amounts are exact: minor units (tiyn) may be strings or bigints above 2^53, and major amounts may be
// decimal strings ("1350000.00") or numbers from the legacy JSON store. No float arithmetic touches a
// minor-unit string.

/** A tenge amount, either in minor units (1 ₸ = 100) or in major units (tenge). */
export type KztAmount = { minor: string | number | bigint } | { major: string | number };

const MINOR = /^-?(0|[1-9][0-9]*)$/;
const MAJOR = /^-?[0-9]+(\.[0-9]{1,2})?$/;
/** Every space-like separator ICU may print (space, U+00A0, U+2007, U+2009, U+202F) becomes U+00A0. */
const SPACE_LIKE = /[\s\u00a0\u2007\u2009\u202f]/g;
const NBSP = "\u00a0";

/** "135000000" minor units to "1350000.00". BigInt-safe; throws on anything but a non-negative integer string. */
export function minorToMajor(amount: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(amount)) throw new RangeError("Invalid minor amount");
  return (BigInt(amount) / BigInt(100)).toString() + "." + (BigInt(amount) % BigInt(100)).toString().padStart(2, "0");
}

/**
 * Locale-aware grouping of a minor-unit amount with its exact two decimals and no currency, e.g.
 * "1,350,000.00" (en-US). Shared by the storefront `"… KZT"` labels (`formatMinorMoney`) and non-KZT admin `formatMinor` amounts.
 */
export function groupMinor(minor: string, intlLocale: string): string {
  const [whole, cents] = minorToMajor(minor).split(".");
  const parts = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(BigInt(whole));
  return parts.map(part => (part.type === "fraction" ? cents : part.value.replace(SPACE_LIKE, NBSP))).join("");
}

/** The Intl locale for tenge in a storefront language: ru → ru-KZ, kk → kk-KZ, en (and anything else) → en-KZ. Accepts "ru" or "ru-RU". */
export function kztIntlLocale(locale: string): string {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  return language === "ru" ? "ru-KZ" : language === "kk" || language === "kz" ? "kk-KZ" : "en-KZ";
}

/** Normalise any `KztAmount` to a signed minor-unit integer string, or null when it is not a valid amount. */
export function toMinor(amount: KztAmount): string | null {
  if ("minor" in amount) {
    const value = amount.minor;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") return Number.isSafeInteger(value) ? String(value) : null;
    return MINOR.test(value) ? value : null;
  }
  const value = amount.major;
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2) : "") : value.trim();
  if (!MAJOR.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const minor = (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0") || "0")).toString();
  return negative && minor !== "0" ? "-" + minor : minor;
}

/**
 * Garmin's price rule for KZT: the locale's number format with two decimals and a currency token pinned per
 * locale (never ICU's), joined with U+00A0 (see formatAmount).
 * ru → "1 350 000,00 ₸", kk → "1 350 000,00 ₸", en → "KZT 1,350,000.00". An invalid amount returns "—".
 */
export function formatKzt(amount: KztAmount, locale: string): string {
  return formatAmount(amount, locale, true);
}

/**
 * The same number with no currency sign ("749,99" for ru), for a legacy amount that could not be converted to
 * tenge because no KZT-per-USD rate is set. Showing it as tenge would be a wrong price.
 */
export function formatUnconverted(amount: KztAmount, locale: string): string {
  return formatAmount(amount, locale, false);
}

/**
 * Final review I2: the output must be identical in Node (SSR) and in every browser, or hydration fails.
 * ICU versions differ in the KZT token ("KZT" or "₸"), in its position and in the space they use (U+00A0 or
 * U+202F). So only the digits, group and decimal symbols come from Intl (formatToParts of the plain number,
 * every separator normalised to U+00A0) and the currency part is pinned per locale: "KZT 1,350,000.00" for
 * en, "1 350 000,00 ₸" for ru and kk, always joined with U+00A0.
 */
function formatAmount(amount: KztAmount, locale: string, currency: boolean): string {
  const minor = toMinor(amount);
  if (minor === null) return "—";
  const negative = minor.startsWith("-");
  const [whole, cents] = minorToMajor(negative ? minor.slice(1) : minor).split(".");
  const intlLocale = kztIntlLocale(locale);
  const parts = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).formatToParts(BigInt(whole));
  const number = parts.map(part => (part.type === "fraction" ? cents : part.value.replace(SPACE_LIKE, NBSP))).join("");
  const text = !currency ? number : intlLocale === "en-KZ" ? "KZT" + NBSP + number : number + NBSP + "₸";
  return negative ? "-" + text : text;
}

/**
 * A legacy USD major amount in tenge at the importer's "KZT per 1 USD" rate, rounded half up to the tiyn.
 * Exact: minor units times the rate scaled to 4 decimals, in BigInt. Null when the amount or the rate is unusable.
 */
export function usdMajorToKztMajor(major: number | string, rateKztPerUsd: number | undefined): number | null {
  if (typeof rateKztPerUsd !== "number" || !Number.isFinite(rateKztPerUsd) || rateKztPerUsd <= 0) return null;
  const minor = toMinor({ major });
  if (minor === null || minor.startsWith("-")) return null;
  const scale = BigInt(10000);
  const product = BigInt(minor) * BigInt(Math.round(rateKztPerUsd * 10000));
  const kztMinor = (product + scale / BigInt(2)) / scale;
  return Number(minorToMajor(kztMinor.toString()));
}

/** The saving between an original and a sale price, or null when there is no saving. */
export function kztSaving(original: KztAmount, sale: KztAmount): KztAmount | null {
  const a = toMinor(original), b = toMinor(sale);
  if (a === null || b === null) return null;
  const diff = BigInt(a) - BigInt(b);
  return diff > BigInt(0) ? { minor: diff } : null;
}

/** True when `original` is a valid amount higher than `sale` (exact, minor units). */
export function isKztSale(original: KztAmount | null | undefined, sale: KztAmount | null | undefined): boolean {
  return Boolean(original && sale && kztSaving(original, sale));
}

/** A count (stock, orders, clients) with the same en grouping as admin money: 1,250. Not money: no currency, no decimals. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value) : "—";
}

/**
 * Task 5b.1 fix 1 (the 5a.2 rule for admin lists): an amount is shown as tenge only when its record is
 * explicitly in KZT (PostgreSQL data, or a legacy record stamped `currency: "KZT"`). Unmarked legacy amounts,
 * which are USD-scale seed data, and USD records are a plain number with no currency sign, never relabelled.
 */
export function formatRecordAmount(amount: number | string | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  return currency === "KZT" ? formatKzt({ major: amount }, "en") : formatUnconverted({ major: amount }, "en");
}
