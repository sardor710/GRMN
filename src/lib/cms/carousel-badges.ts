/**
 * Owner 2026-11-23: homepage carousel cards carry garmin.ae-style starburst badges: a black burst with white
 * condensed uppercase text, for every badge text. A known code shows its localized label (messages
 * HomeFeatured.badges.<code>); any other text (e.g. catalog "Save 50,000 KZT") is shown as it is.
 */
export type CarouselBadgeCode = "NEW" | "SALE" | "SOON" | "HIT" | "LIMITED" | "EXCLUSIVE" | "PREORDER";
export type CarouselBadgeTone = "black";

export const CAROUSEL_BADGES: readonly { code: CarouselBadgeCode; tone: CarouselBadgeTone; adminLabel: string }[] = [
  { code: "NEW", tone: "black", adminLabel: "NEW" },
  { code: "SALE", tone: "black", adminLabel: "SALE (shows −% when the old price is set)" },
  { code: "SOON", tone: "black", adminLabel: "SOON (coming soon)" },
  { code: "HIT", tone: "black", adminLabel: "HIT (bestseller)" },
  { code: "LIMITED", tone: "black", adminLabel: "LIMITED" },
  { code: "EXCLUSIVE", tone: "black", adminLabel: "EXCLUSIVE" },
  { code: "PREORDER", tone: "black", adminLabel: "PRE-ORDER" },
];

/** Stored or catalog badge text (any case) → badge code; null for none or text with no starburst. */
const ALIASES: Readonly<Record<string, CarouselBadgeCode>> = {
  NEW: "NEW", SALE: "SALE", SOON: "SOON", "COMING SOON": "SOON", HIT: "HIT", "BEST SELLER": "HIT", BESTSELLER: "HIT", POPULAR: "HIT",
  LIMITED: "LIMITED", "LIMITED EDITION": "LIMITED", EXCLUSIVE: "EXCLUSIVE", PREORDER: "PREORDER", "PRE-ORDER": "PREORDER",
};

export function badgeCode(raw: string | undefined | null): CarouselBadgeCode | null {
  return raw ? ALIASES[raw.trim().toUpperCase()] ?? null : null;
}

/** Whole tenge from free price text ("₸99 000", "99 000 KZT"); null when it has no digits. */
function amount(text: string | undefined): number | null {
  const digits = (text ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/** Rounded saving in percent when both prices read as numbers and the old price is higher; otherwise null. */
export function discountPercent(price: string | undefined, originalPrice: string | undefined): number | null {
  const now = amount(price), before = amount(originalPrice);
  if (now === null || before === null || now <= 0 || before <= now) return null;
  return Math.round(((before - now) / before) * 100);
}

export type CarouselBadgeSize = "large" | "medium" | "small";

/** Text size inside the starburst: one short word large, one 6–7 letter word medium, anything longer small. */
export function badgeSize(label: string): CarouselBadgeSize {
  const words = label.trim().split(/[\s-]+/).filter(Boolean);
  const longest = Math.max(0, ...words.map((word) => word.length));
  if (words.length <= 1 && longest <= 5) return "large";
  if (words.length <= 1 && longest <= 7) return "medium";
  return "small";
}

/**
 * Catalog savings text ("Save 50,000 KZT", "Экономия 50 000 KZT", "50 000 KZT үнемдеңіз") → the word and the amount
 * in tenge (₸), so the starburst shows them on two clean lines; null for any other text.
 */
export function savingsParts(text: string): { word: string; amount: string } | null {
  const match = /(\d[\d\s ,.]*\d|\d)\s*(?:KZT|₸)/i.exec(text);
  if (!match) return null;
  const word = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).replace(/\s+/g, " ").trim();
  return word ? { word, amount: `${match[1]} ₸` } : null;
}
