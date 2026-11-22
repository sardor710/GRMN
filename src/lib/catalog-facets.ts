// Pure, browser-safe category-page logic (M4.3): garmin.com facet buckets, facet counts, filtering and
// sorting over a category's product set, and the product-page accessory tab grouping (M4.6).
// The server loads the facts (src/server/catalog/category-page.ts); everything here is deterministic.
import type { CatalogSortKey, CategoryFilterInput, FacetDTO, FacetKey, FacetOptionDTO } from "../contracts/catalog-browse.ts";

export type CaseSizeBucket = "Youth" | "Small" | "Medium" | "Large";

/** garmin.com "Case Size" (WEARABLES_FILTER_BY_CASESIZE). Youth is shown only where youth products exist. */
export const CASE_SIZE_BUCKETS: readonly { value: CaseSizeBucket; label: string }[] = [
  { value: "Youth", label: "Youth" },
  { value: "Small", label: "Small (35 to 43 mm)" },
  { value: "Medium", label: "Medium (44 to 49 mm)" },
  { value: "Large", label: "Large (≥ 50 mm)" },
];

/** Case diameter in mm from an option value label ("47 mm", "51mm", "43 MM", "fēnix 8 – 47 mm"); null otherwise. */
export function caseMillimetres(label: string): number | null {
  const match = /(\d+(?:[.,]\d+)?)\s*mm\b/i.exec(String(label));
  if (!match) return null;
  const mm = Number(match[1].replace(",", "."));
  return Number.isFinite(mm) && mm > 0 ? mm : null;
}

/** Small = up to 43 mm (garmin: 35 to 43), Medium = 44 to 49 mm, Large = 50 mm and above. */
export function caseSizeBucket(label: string): Exclude<CaseSizeBucket, "Youth"> | undefined {
  const mm = caseMillimetres(label);
  if (mm === null) return undefined;
  if (mm < 44) return "Small";
  if (mm < 50) return "Medium";
  return "Large";
}

/** Price ranges in KZT (amounts in minor units = tiyn). `max` is exclusive; null = no upper bound. */
export const PRICE_BUCKETS: readonly { value: string; label: string; min: bigint; max: bigint | null }[] = [
  { value: "0-100000", label: "Under 100,000 KZT", min: BigInt(0), max: BigInt(10_000_000) },
  { value: "100000-250000", label: "100,000 – 250,000 KZT", min: BigInt(10_000_000), max: BigInt(25_000_000) },
  { value: "250000-500000", label: "250,000 – 500,000 KZT", min: BigInt(25_000_000), max: BigInt(50_000_000) },
  { value: "500000-750000", label: "500,000 – 750,000 KZT", min: BigInt(50_000_000), max: BigInt(75_000_000) },
  { value: "750000-", label: "750,000 KZT and above", min: BigInt(75_000_000), max: null },
];

export function priceBucket(amountMinor: string): string {
  const amount = BigInt(amountMinor);
  return (PRICE_BUCKETS.find(b => amount >= b.min && (b.max === null || amount < b.max)) ?? PRICE_BUCKETS[PRICE_BUCKETS.length - 1]).value;
}

/** garmin.com Activity options (WEARABLES_FILTER_BY_ACTIVITY), in their order. */
export const ACTIVITY_LABELS: readonly string[] = ["Boating", "Cycling", "Diving", "Flying", "Golfing", "Hiking", "Running", "Strength", "Swimming", "Tactical training", "Triathlon", "Walking"];
export const LEVEL_ORDER: readonly string[] = ["Entry", "Advanced", "Premium", "Youth"];

/** The store's activity key: lowercase words joined by "-" ("Tactical training" → "tactical-training"). */
export const activityKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
export function activityLabel(key: string): string {
  const known = ACTIVITY_LABELS.find(label => activityKey(label) === key);
  if (known) return known;
  const words = key.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** ASCII slug of a series name ("fēnix" → "fenix", "vívoactive" → "vivoactive"). */
export const seriesValue = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").replace(/[®™]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface FacetVariant {
  amountMinor: string;
  available: boolean;
  caseSize: CaseSizeBucket | null;
}

export interface FacetProduct {
  key: string;
  name: string;
  featured: boolean;
  /** Sortable creation key (ISO timestamp). */
  createdKey: string;
  series: readonly { value: string; label: string }[];
  activities: readonly string[];
  level: string | null;
  /** Eligible (active, priced) variants; the default variant first. */
  variants: readonly FacetVariant[];
}

export type FacetSelection = Required<{ [K in keyof CategoryFilterInput]-?: NonNullable<CategoryFilterInput[K]> }>;

export const emptySelection = (): FacetSelection => ({ series: [], activities: [], levels: [], caseSizes: [], prices: [], inStock: false });

const FACET_LABELS: Record<FacetKey, string> = {
  activities: "Activity", levels: "Level", caseSizes: "Case Size", series: "Series", prices: "Price", availability: "Availability",
};

/** True when `product` passes every filter in `selection` (one variant must satisfy all variant-level filters). */
export function matchesSelection(product: FacetProduct, selection: FacetSelection): boolean {
  if (selection.series.length && !product.series.some(s => selection.series.includes(s.value))) return false;
  if (selection.activities.length && !product.activities.some(a => selection.activities.includes(a))) return false;
  if (selection.levels.length && !(product.level && selection.levels.includes(product.level))) return false;
  return product.variants.some(v =>
    (!selection.caseSizes.length || (v.caseSize !== null && selection.caseSizes.includes(v.caseSize)))
    && (!selection.prices.length || selection.prices.includes(priceBucket(v.amountMinor)))
    && (!selection.inStock || v.available));
}

/** The offer a card shows: an available variant first, then the cheapest (same order as the SQL `chosen`). */
export function chosenVariant(product: FacetProduct): FacetVariant | undefined {
  return [...product.variants].sort((a, b) => Number(b.available) - Number(a.available) || (BigInt(a.amountMinor) < BigInt(b.amountMinor) ? -1 : BigInt(a.amountMinor) > BigInt(b.amountMinor) ? 1 : 0))[0];
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

export function sortProducts(products: readonly FacetProduct[], sort: CatalogSortKey): FacetProduct[] {
  const price = (p: FacetProduct) => BigInt(chosenVariant(p)?.amountMinor ?? "0");
  const byName = (a: FacetProduct, b: FacetProduct) => collator.compare(a.name, b.name) || a.key.localeCompare(b.key);
  const list = [...products];
  switch (sort) {
    case "name-asc": return list.sort(byName);
    case "name-desc": return list.sort((a, b) => byName(b, a));
    case "price-asc": return list.sort((a, b) => (price(a) < price(b) ? -1 : price(a) > price(b) ? 1 : byName(a, b)));
    case "price-desc": return list.sort((a, b) => (price(a) > price(b) ? -1 : price(a) < price(b) ? 1 : byName(a, b)));
    default: return list.sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdKey.localeCompare(a.createdKey) || byName(a, b));
  }
}

function options(products: readonly FacetProduct[], selection: FacetSelection, key: Exclude<FacetKey, "availability">, candidates: readonly { value: string; label: string }[]): FacetOptionDTO[] {
  const selected = selection[key];
  return candidates.flatMap(({ value, label }) => {
    const count = products.filter(p => matchesSelection(p, { ...selection, [key]: [value] })).length;
    const checked = selected.includes(value);
    return count > 0 || checked ? [{ value, label, count, checked }] : [];
  });
}

/**
 * Facets with counts, garmin.com style: within a facet the options are OR-ed, facets are AND-ed, and each
 * option's count applies every other facet's selection. Options that match nothing disappear unless checked;
 * facets with no options are omitted.
 */
export function computeFacets(products: readonly FacetProduct[], selection: FacetSelection): FacetDTO[] {
  const activityKeys = [...new Set(products.flatMap(p => p.activities))];
  const activityCandidates = activityKeys
    .map(value => ({ value, label: activityLabel(value) }))
    .sort((a, b) => {
      const ia = ACTIVITY_LABELS.indexOf(a.label), ib = ACTIVITY_LABELS.indexOf(b.label);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || collator.compare(a.label, b.label);
    });
  const levelCandidates = LEVEL_ORDER.filter(level => products.some(p => p.level === level)).map(value => ({ value, label: value }));
  const caseCandidates = CASE_SIZE_BUCKETS.filter(b => products.some(p => p.variants.some(v => v.caseSize === b.value)));
  const seriesMap = new Map<string, string>();
  for (const p of products) for (const s of p.series) if (!seriesMap.has(s.value)) seriesMap.set(s.value, s.label);
  const seriesCandidates = [...seriesMap].map(([value, label]) => ({ value, label })).sort((a, b) => collator.compare(seriesValue(a.label), seriesValue(b.label)));
  const priceCandidates = PRICE_BUCKETS.map(({ value, label }) => ({ value, label }));
  const facets: FacetDTO[] = [
    { key: "activities", label: FACET_LABELS.activities, options: options(products, selection, "activities", activityCandidates) },
    { key: "levels", label: FACET_LABELS.levels, options: options(products, selection, "levels", levelCandidates) },
    { key: "caseSizes", label: FACET_LABELS.caseSizes, options: options(products, selection, "caseSizes", caseCandidates) },
    { key: "series", label: FACET_LABELS.series, options: options(products, selection, "series", seriesCandidates) },
    { key: "prices", label: FACET_LABELS.prices, options: options(products, selection, "prices", priceCandidates) },
  ];
  const inStock = products.filter(p => matchesSelection(p, { ...selection, inStock: true })).length;
  if (inStock > 0 || selection.inStock) facets.push({ key: "availability", label: FACET_LABELS.availability, options: [{ value: "in-stock", label: "In stock", count: inStock, checked: selection.inStock }] });
  return facets.filter(f => f.options.length > 0);
}

export const SORT_OPTIONS: readonly { value: CatalogSortKey; label: string }[] = [
  { value: "featured", label: "Featured Products" },
  { value: "name-asc", label: "A to Z" },
  { value: "name-desc", label: "Z to A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];
export const parseSort = (value: string | undefined): CatalogSortKey => SORT_OPTIONS.find(o => o.value === value)?.value ?? "featured";

// ---- Product page: Accessories tab grouping (garmin.com PDP order) ----

/** Accessory category slugs in garmin.com's PDP "Accessories" tab order; "View All" always comes last. */
export const ACCESSORY_TAB_ORDER: readonly { slug: string; label: string }[] = [
  { slug: "apps", label: "Apps" },
  { slug: "subscription-plans", label: "Service Plans" },
  { slug: "bands", label: "Bands" },
  { slug: "dive-bands", label: "Dive Bands" },
  { slug: "marq-straps-bracelets", label: "MARQ Straps & Bracelets" },
  { slug: "cables-chargers", label: "Cables & Chargers" },
  { slug: "sports-fitness/cycling-biking-accessories", label: "Cycling Accessories" },
  { slug: "heart-rate-monitors", label: "Heart Rate Monitors" },
  { slug: "sensors", label: "Sensors" },
];
export const VIEW_ALL_TAB = "view-all";

export interface AccessoryLike { group: { slug: string; name: string } | null; variantIds: readonly string[] | null }

/** Accessories that fit `variantId` (whole-device rows fit every variant). */
export function accessoriesForVariant<T extends AccessoryLike>(accessories: readonly T[], variantId: string | null | undefined): T[] {
  return accessories.filter(a => a.variantIds === null || (variantId != null && a.variantIds.includes(variantId)));
}

/**
 * Tabs in garmin.com order, then any other accessory category alphabetically, then "View All".
 * Empty tabs are hidden; "View All" is always present and lists every accessory grouped in tab order.
 */
export function accessoryTabs<T extends AccessoryLike>(accessories: readonly T[]): { slug: string; label: string; items: T[] }[] {
  // A known group keeps garmin.com's position; its label is the category's own (localized, possibly renamed) name.
  const known = ACCESSORY_TAB_ORDER.map(tab => { const items = accessories.filter(a => a.group?.slug === tab.slug); return { ...tab, label: items[0]?.group?.name ?? tab.label, items }; });
  const otherSlugs = [...new Map(accessories.filter(a => a.group && !ACCESSORY_TAB_ORDER.some(t => t.slug === a.group!.slug)).map(a => [a.group!.slug, a.group!.name])).entries()]
    .sort((a, b) => collator.compare(a[1], b[1]));
  const others = otherSlugs.map(([slug, label]) => ({ slug, label, items: accessories.filter(a => a.group?.slug === slug) }));
  const tabs = [...known, ...others].filter(tab => tab.items.length > 0);
  const viewAll = [...tabs.flatMap(tab => tab.items), ...accessories.filter(a => a.group === null)];
  return [...tabs, { slug: VIEW_ALL_TAB, label: "View All", items: viewAll }];
}
