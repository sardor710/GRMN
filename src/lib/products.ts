import type { Product, WatchFamily, ProductDetail } from "@/types";

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

export const catalogueMeta: Record<string, { title: string; heading: string }> = {
  "wearables-smartwatches": { title: "Smartwatches", heading: "ALL SMARTWATCHES" },
};

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

// ---- Detailed product page data (fēnix 8, id 1228429) ----
export const fenix8Detail: ProductDetail = {
  id: "1228429",
  title: "fēnix® 8 – 47 mm, AMOLED",
  subtitle: "Sapphire, Titanium with Spark Orange/Graphite Silicone Band",
  partNumber: "010-02904-10",
  price: 1099.99,
  badge: "CUSTOMIZABLE",
  breadcrumb: [
    { label: "OUTDOOR RECREATION", href: "/en-US/c/wearables-smartwatches" },
    { label: "ADVENTURE WATCHES", href: "/en-US/c/wearables-smartwatches" },
  ],
  gallery: [
    { view: "Front", src: "/images/products/fenix8-cf.jpg" },
    { view: "Right", src: "/images/products/fenix8-rf.jpg" },
    { view: "Left", src: "/images/products/fenix8-lf.jpg" },
    { view: "Detail 1", src: "/images/products/fenix8-pd-01.jpg" },
    { view: "Detail 2", src: "/images/products/fenix8-pd-02.jpg" },
  ],
  caseSizes: ["43 MM", "47 MM", "51 MM"],
  defaultCaseSize: "47 MM",
  versions: ["FĒNIX 8 – AMOLED", "FĒNIX 8 – SOLAR", "FĒNIX E", "FĒNIX 8 PRO – AMOLED", "FĒNIX 8 PRO – MICROLED"],
  defaultVersion: "FĒNIX 8 – AMOLED",
  colors: [
    { label: "Spark Orange/Graphite", src: "/images/products/fenix8-cf.jpg" },
    { label: "Black/Slate", src: "/images/products/1228429.jpg" },
    { label: "Left profile", src: "/images/products/fenix8-lf.jpg" },
    { label: "Right profile", src: "/images/products/fenix8-rf.jpg" },
  ],
  features: [
    {
      title: "BE LIMITLESS",
      body: "For serious athletes and adventurers who want to push beyond their limits, this premium multisport GPS smartwatch is built to perform — with advanced strength training, a bright AMOLED display and up to 16 days of battery life.",
      image: "/images/products/fenix8-hero.jpg",
    },
    {
      title: "RUGGED BY DESIGN",
      body: "Built to endure, this premium design is dive-rated and features leakproof buttons, a metal sensor guard cover and a bright 1.4\" AMOLED display with options for a scratch-resistant sapphire lens.",
      image: "/images/products/fenix8-rugged.jpg",
    },
    {
      title: "BUILT-IN SPEAKER AND MICROPHONE",
      body: "Make and take phone calls from your watch when it's paired to your smartphone. Plus, control watch functions with off-grid voice commands, even without a connection.",
    },
    {
      title: "BUILT-IN LED FLASHLIGHT",
      body: "Light your way in the dark with a variable-intensity LED flashlight — with a strobe mode that flashes to your running cadence for improved visibility.",
    },
  ],
  specs: [
    { label: "Display type", value: "AMOLED" },
    { label: "Display size", value: "1.4\" (35.56 mm) diameter" },
    { label: "Display resolution", value: "454 x 454 pixels" },
    { label: "Battery life (smartwatch mode)", value: "Up to 16 days (7 days always-on)" },
    { label: "Battery type", value: "Lithium ion" },
    { label: "Charging method", value: "Garmin proprietary plug charger" },
    { label: "Memory/History", value: "32 GB" },
    { label: "Water rating", value: "10 ATM" },
    { label: "Physical size", value: "47 x 47 x 13.8 mm" },
    { label: "Weight", value: "Titanium: 73 g (case only: 52 g)" },
    { label: "Lens material", value: "Corning® Gorilla® Glass or sapphire crystal" },
    { label: "Bezel material", value: "stainless steel or titanium" },
    { label: "Case material", value: "fiber-reinforced polymer with metal rear cover" },
    { label: "Strap material", value: "silicone" },
    { label: "QuickFit® watch band compatible", value: "included (22 mm)" },
  ],
  inTheBox: [
    "fēnix® 8 – 47 mm, AMOLED",
    "QuickFit® 22 watch band",
    "Charging/data cable",
    "Documentation",
  ],
  related: ["1462801", "1316397", "1828641", "851039"],
};

// Build a functional detail page for products without hand-authored data.
function buildFallbackDetail(p: Product): ProductDetail {
  return {
    id: p.id,
    title: p.name,
    subtitle: p.description,
    partNumber: "010-0000-00",
    price: p.price,
    badge: p.badge,
    breadcrumb: [
      { label: "SMARTWATCHES", href: "/c/wearables-smartwatches" },
      { label: p.family.toUpperCase(), href: "/c/wearables-smartwatches" },
    ],
    gallery: [{ view: "Front", src: p.image }],
    caseSizes: ["43 MM", "47 MM", "51 MM"],
    defaultCaseSize: "47 MM",
    versions: [p.name.toUpperCase()],
    defaultVersion: p.name.toUpperCase(),
    colors: [{ label: p.name, src: p.image }],
    features: [
      {
        title: `MEET ${p.name.replace(/[®™]/g, "").toUpperCase()}`,
        body: p.description,
        image: p.image,
      },
    ],
    specs: [
      { label: "Family", value: p.family },
      { label: "Level", value: p.level },
      { label: "Case size", value: p.caseSize },
      { label: "Activities", value: p.activities.join(", ") },
    ],
    inTheBox: [p.name, "Charging/data cable", "Documentation"],
    related: products
      .filter((x) => x.id !== p.id && x.family === p.family)
      .slice(0, 4)
      .map((x) => x.id),
  };
}

export function getProductDetail(id: string): ProductDetail | undefined {
  if (id === "1228429") return fenix8Detail;
  const basic = getProduct(id);
  return basic ? buildFallbackDetail(basic) : undefined;
}
