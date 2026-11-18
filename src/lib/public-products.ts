import type { Product, WatchFamily } from "@/types";

export const watchFamilies: WatchFamily[] = [
  { name: "fēnix®", tagline: "Push the limits of multisport performance.", image: "/images/families/fenix.png" },
  { name: "Venu®", tagline: "Style and design meet health and fitness.", image: "/images/families/venu.png" },
  { name: "Forerunner®", tagline: "For any reason to run.", image: "/images/families/forerunner.png" },
  { name: "Instinct®", tagline: "Keep it bold, rugged and ready for adventure.", image: "/images/families/instinct.png" },
  { name: "vívoactive®", tagline: "Stay healthy and active every day.", image: "/images/families/vivoactive.png" },
];

export const products: Product[] = [
  { id: "1228429", name: "fēnix® 8", price: 799.99, priceSuffix: "and up", description: "Premium multisport GPS smartwatches with options that include inReach® technology for connectivity on the go.", image: "/images/products/1228429.jpg", badge: "CUSTOMIZABLE", family: "fēnix", activities: ["Hiking", "Running", "Swimming", "Triathlon", "Diving"], level: "Premium", caseSize: "Medium" },
  { id: "1614061", name: "Venu® 4", price: 549.99, description: "Advanced health and fitness GPS smartwatches with bright, colorful displays, a built-in flashlight, and wellness and smart features.", image: "/images/products/1614061.jpg", badge: "CUSTOMIZABLE", family: "Venu", activities: ["Running", "Strength", "Swimming", "Walking"], level: "Advanced", caseSize: "Medium" },
  { id: "1462801", name: "Forerunner® 970", price: 749.99, description: "Premium GPS running and triathlon smartwatch with an AMOLED display, built-in LED flashlight and enhanced navigation plus advanced training and recovery features.", image: "/images/products/1462801.jpg", family: "Forerunner", activities: ["Running", "Triathlon", "Cycling", "Swimming"], level: "Premium", caseSize: "Medium" },
  { id: "1510465", name: "Venu® X1", price: 699.99, description: "Sleek, lightweight GPS smartwatch with a bright 2-inch AMOLED display and advanced health and fitness features.", image: "/images/products/1510465.jpg", family: "Venu", activities: ["Running", "Strength", "Walking"], level: "Advanced", caseSize: "Large" },
  { id: "1463821", name: "Forerunner® 570", price: 549.99, description: "Advanced GPS running and triathlon smartwatches with AMOLED displays plus training and recovery features.", image: "/images/products/1463821.jpg", badge: "CUSTOMIZABLE", family: "Forerunner", activities: ["Running", "Triathlon", "Cycling"], level: "Advanced", caseSize: "Medium" },
  { id: "1941179", name: "Forerunner® 70/170", price: 249.99, priceSuffix: "and up", description: "GPS running smartwatches with essential training and recovery features, plus optional music.", image: "/images/products/1941179.jpg", badge: "NEW", family: "Forerunner", activities: ["Running", "Walking"], level: "Entry", caseSize: "Small" },
  { id: "1316397", name: "Instinct® 3", price: 249.99, priceSuffix: "and up", description: "Rugged GPS smartwatches with dedicated tactical features and solar charging or AMOLED displays.", image: "/images/products/1316397.jpg", badge: "CUSTOMIZABLE", family: "Instinct", activities: ["Hiking", "Tactical training", "Running"], level: "Advanced", caseSize: "Medium" },
  { id: "1555457", name: "vívoactive® 6", price: 299.99, description: "Health and fitness GPS smartwatch with a bright, colorful display and essential fitness, wellness and smart features.", image: "/images/products/1555457.jpg", family: "vívoactive", activities: ["Running", "Walking", "Strength"], level: "Entry", caseSize: "Small" },
  { id: "1800201", name: "Instinct® Crossover", price: 399.99, priceSuffix: "and up", description: "Hybrid outdoor GPS smartwatches with options for solar charging or AMOLED displays.", image: "/images/products/1800201.jpg", family: "Instinct", activities: ["Hiking", "Tactical training", "Running"], level: "Advanced", caseSize: "Medium" },
  { id: "1828641", name: "tactix® 8", price: 1299.99, priceSuffix: "and up", description: "Premium tactical GPS smartwatches with solar charging or AMOLED displays.", image: "/images/products/1828641.jpg", family: "tactix", activities: ["Tactical training", "Flying", "Diving", "Hiking"], level: "Premium", caseSize: "Large" },
  { id: "851039", name: "Enduro™ 3", price: 899.99, description: "Ultraperformance smartwatch with GPS plus advanced training metrics and maps.", image: "/images/products/851039.jpg", family: "Enduro", activities: ["Running", "Hiking", "Triathlon"], level: "Premium", caseSize: "Large" },
  { id: "1196650", name: "Lily® 2", price: 249.99, priceSuffix: "and up", description: "Small fashion smartwatch with essential wellness and smart features plus optional GPS.", image: "/images/products/1196650.jpg", family: "Lily", activities: ["Walking", "Strength"], level: "Entry", caseSize: "Small" },
  { id: "1815501", name: "Bounce™ 2", price: 299.99, description: "Kids smartwatch with calling, messaging and location tracking features.", image: "/images/products/1815501.jpg", family: "Bounce", activities: ["Walking"], level: "Youth", caseSize: "Small" },
  { id: "1908217", name: "Approach® J1", price: 299.99, description: "Junior golf watch with built-in GPS, a bright, colorful display and essential features.", image: "/images/products/1908217.jpg", family: "Approach", activities: ["Golfing"], level: "Youth", caseSize: "Small" },
  { id: "1765781", name: "MARQ® (Gen 2)", price: 1900.0, priceSuffix: "and up", description: "Luxury GPS tool watches with AMOLED displays, premium materials and multisport capabilities.", image: "/images/products/1765781.jpg", badge: "CUSTOMIZABLE", family: "MARQ", activities: ["Hiking", "Flying", "Boating"], level: "Premium", caseSize: "Large" },
  { id: "785411", name: "vívomove®", price: 269.99, priceSuffix: "and up", description: "Hybrid smartwatches with hidden displays, essential wellness tracking and smart features.", image: "/images/products/785411.jpg", family: "vívomove", activities: ["Walking", "Strength"], level: "Entry", caseSize: "Small" },
  { id: "847706", name: "Approach® S70", price: 649.99, priceSuffix: "and up", description: "Premium golf smartwatch with GPS, an AMOLED display and advanced wellness and on-course features.", image: "/images/products/847706.jpg", family: "Approach", activities: ["Golfing"], level: "Premium", caseSize: "Medium" },
];

export const activityFilters = ["Boating", "Cycling", "Diving", "Flying", "Golfing", "Hiking", "Running", "Strength", "Swimming", "Tactical training", "Triathlon", "Walking"];
export const levelFilters: Product["level"][] = ["Entry", "Advanced", "Premium", "Youth"];
export const caseSizeFilters: { label: string; value: Product["caseSize"] }[] = [
  { label: "Small (35 to 43 mm)", value: "Small" },
  { label: "Medium (44 to 49 mm)", value: "Medium" },
  { label: "Large (≥ 50 mm)", value: "Large" },
];

