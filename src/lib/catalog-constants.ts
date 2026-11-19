import type { Product, WatchFamily } from "@/types";

export const watchFamilies: WatchFamily[] = [
  { name: "fēnix®", tagline: "Push the limits of multisport performance.", image: "/images/families/fenix.png" },
  { name: "Venu®", tagline: "Style and design meet health and fitness.", image: "/images/families/venu.png" },
  { name: "Forerunner®", tagline: "For any reason to run.", image: "/images/families/forerunner.png" },
  { name: "Instinct®", tagline: "Keep it bold, rugged and ready for adventure.", image: "/images/families/instinct.png" },
  { name: "vívoactive®", tagline: "Stay healthy and active every day.", image: "/images/families/vivoactive.png" },
];

/** Catalogue filter options. `value` matches product data (English); `labelKey` is the displayed message. */
export interface FilterOption<T extends string = string> {
  value: T;
  labelKey: string;
}

export const activityFilters: FilterOption[] = [
  { value: "Boating", labelKey: "CatalogueGrid.activities.boating" },
  { value: "Cycling", labelKey: "CatalogueGrid.activities.cycling" },
  { value: "Diving", labelKey: "CatalogueGrid.activities.diving" },
  { value: "Flying", labelKey: "CatalogueGrid.activities.flying" },
  { value: "Golfing", labelKey: "CatalogueGrid.activities.golfing" },
  { value: "Hiking", labelKey: "CatalogueGrid.activities.hiking" },
  { value: "Running", labelKey: "CatalogueGrid.activities.running" },
  { value: "Strength", labelKey: "CatalogueGrid.activities.strength" },
  { value: "Swimming", labelKey: "CatalogueGrid.activities.swimming" },
  { value: "Tactical training", labelKey: "CatalogueGrid.activities.tacticalTraining" },
  { value: "Triathlon", labelKey: "CatalogueGrid.activities.triathlon" },
  { value: "Walking", labelKey: "CatalogueGrid.activities.walking" },
];
export const levelFilters: FilterOption<Product["level"]>[] = [
  { value: "Entry", labelKey: "CatalogueGrid.levels.entry" },
  { value: "Advanced", labelKey: "CatalogueGrid.levels.advanced" },
  { value: "Premium", labelKey: "CatalogueGrid.levels.premium" },
  { value: "Youth", labelKey: "CatalogueGrid.levels.youth" },
];
export const caseSizeFilters: FilterOption<Product["caseSize"]>[] = [
  { value: "Small", labelKey: "CatalogueGrid.caseSizes.small" },
  { value: "Medium", labelKey: "CatalogueGrid.caseSizes.medium" },
  { value: "Large", labelKey: "CatalogueGrid.caseSizes.large" },
];

/** Message key for a filter value (e.g. a product's level), or undefined for values outside the list. */
export function filterLabelKey(options: FilterOption[], value: string): string | undefined {
  return options.find((option) => option.value === value)?.labelKey;
}
