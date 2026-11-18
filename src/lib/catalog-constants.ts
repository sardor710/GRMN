import type { Product, WatchFamily } from "@/types";

export const watchFamilies: WatchFamily[] = [
  { name: "fēnix®", tagline: "Push the limits of multisport performance.", image: "/images/families/fenix.png" },
  { name: "Venu®", tagline: "Style and design meet health and fitness.", image: "/images/families/venu.png" },
  { name: "Forerunner®", tagline: "For any reason to run.", image: "/images/families/forerunner.png" },
  { name: "Instinct®", tagline: "Keep it bold, rugged and ready for adventure.", image: "/images/families/instinct.png" },
  { name: "vívoactive®", tagline: "Stay healthy and active every day.", image: "/images/families/vivoactive.png" },
];

export const activityFilters = ["Boating", "Cycling", "Diving", "Flying", "Golfing", "Hiking", "Running", "Strength", "Swimming", "Tactical training", "Triathlon", "Walking"];
export const levelFilters: Product["level"][] = ["Entry", "Advanced", "Premium", "Youth"];
export const caseSizeFilters: { label: string; value: Product["caseSize"] }[] = [
  { label: "Small (35 to 43 mm)", value: "Small" },
  { label: "Medium (44 to 49 mm)", value: "Medium" },
  { label: "Large (≥ 50 mm)", value: "Large" },
];

