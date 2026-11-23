/**
 * Owner 2026-11-23: homepage carousel cards carry garmin.ae-style starburst badges. The card stores the code
 * (`badge`); the storefront shows the localized label (messages HomeFeatured.badges.<code>) in the badge's colour.
 */
export type CarouselBadgeCode = "NEW" | "SALE" | "SOON" | "HIT" | "LIMITED" | "EXCLUSIVE" | "PREORDER";
export type CarouselBadgeTone = "black" | "red" | "blue" | "gold" | "orange" | "purple" | "green";

export const CAROUSEL_BADGES: readonly { code: CarouselBadgeCode; tone: CarouselBadgeTone; adminLabel: string }[] = [
  { code: "NEW", tone: "black", adminLabel: "NEW" },
  { code: "SALE", tone: "red", adminLabel: "SALE (shows −% when the old price is set)" },
  { code: "SOON", tone: "blue", adminLabel: "SOON (coming soon)" },
  { code: "HIT", tone: "gold", adminLabel: "HIT (bestseller)" },
  { code: "LIMITED", tone: "orange", adminLabel: "LIMITED" },
  { code: "EXCLUSIVE", tone: "purple", adminLabel: "EXCLUSIVE" },
  { code: "PREORDER", tone: "green", adminLabel: "PRE-ORDER" },
];

/** Stored or catalog badge text (any case) → badge code; null for none or text with no starburst. */
const ALIASES: Readonly<Record<string, CarouselBadgeCode>> = {
  NEW: "NEW", SALE: "SALE", SOON: "SOON", "COMING SOON": "SOON", HIT: "HIT", "BEST SELLER": "HIT", BESTSELLER: "HIT", POPULAR: "HIT",
  LIMITED: "LIMITED", "LIMITED EDITION": "LIMITED", EXCLUSIVE: "EXCLUSIVE", PREORDER: "PREORDER", "PRE-ORDER": "PREORDER",
};

export function badgeCode(raw: string | undefined | null): CarouselBadgeCode | null {
  return raw ? ALIASES[raw.trim().toUpperCase()] ?? null : null;
}

export function badgeTone(code: CarouselBadgeCode): CarouselBadgeTone {
  return CAROUSEL_BADGES.find((badge) => badge.code === code)?.tone ?? "black";
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
