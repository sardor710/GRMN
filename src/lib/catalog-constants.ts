import type { Product, WatchFamily } from "@/types";

// Family tiles open the watch-series group pages (taxonomy kind "group", linked from the storefront).
export const watchFamilies: WatchFamily[] = [
  { name: "fēnix®", tagline: "Push the limits of multisport performance.", image: "/images/families/fenix.png", href: "/c/watch-series/fenix" },
  { name: "Venu®", tagline: "Style and design meet health and fitness.", image: "/images/families/venu.png", href: "/c/watch-series/venu" },
  { name: "Forerunner®", tagline: "For any reason to run.", image: "/images/families/forerunner.png", href: "/c/watch-series/forerunner" },
  { name: "Instinct®", tagline: "Keep it bold, rugged and ready for adventure.", image: "/images/families/instinct.png", href: "/c/watch-series/instinct" },
  { name: "vívoactive®", tagline: "Stay healthy and active every day.", image: "/images/families/vivoactive.png", href: "/c/watch-series/vivoactive" },
];

export const activityFilters = ["Boating", "Cycling", "Diving", "Flying", "Golfing", "Hiking", "Running", "Strength", "Swimming", "Tactical training", "Triathlon", "Walking"];
export const levelFilters: Product["level"][] = ["Entry", "Advanced", "Premium", "Youth"];
export const caseSizeFilters: { label: string; value: Product["caseSize"] }[] = [
  { label: "Small (35 to 43 mm)", value: "Small" },
  { label: "Medium (44 to 49 mm)", value: "Medium" },
  { label: "Large (≥ 50 mm)", value: "Large" },
];

