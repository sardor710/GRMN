import type { Product, WatchFamily, ProductDetail, AccessoryItem } from "@/types";
import { getProducts as getRawCMSProducts, getProductsFor as getCMSProducts } from "@/lib/cms/store";
import type { Locale } from "@/i18n/config";
import type { CMSProduct } from "@/lib/cms/types";
import { usesCmsDetail } from "@/lib/cms/product-variants";

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

export interface CatalogueDef {
  slug: string;
  /** Message keys (`CataloguePage.*`), resolved with `t()` where rendered. */
  titleKey: string;
  headingKey: string;
  showFamilies: boolean;
  hero?: { image: string; labelKey: string; blurbKey: string };
  filter: (p: Product) => boolean;
}

export const catalogues: CatalogueDef[] = [
  {
    slug: "wearables-smartwatches",
    titleKey: "CataloguePage.smartwatches.title",
    headingKey: "CataloguePage.smartwatches.heading",
    showFamilies: true,
    filter: () => true,
  },
  {
    slug: "sports-fitness/running-smartwatches",
    titleKey: "CataloguePage.running.title",
    headingKey: "CataloguePage.running.heading",
    showFamilies: false,
    hero: {
      image: "/images/74662-sports-and-fitness-pod.jpg",
      labelKey: "CataloguePage.running.heroLabel",
      blurbKey: "CataloguePage.running.heroBlurb",
    },
    filter: (p) => p.activities.includes("Running"),
  },
];

export function getCatalogue(slug: string): CatalogueDef | undefined {
  return catalogues.find((c) => c.slug === slug);
}

export function getAllProducts(locale: Locale = "en"): Product[] {
  try {
    const cmsProducts = getCMSProducts(locale);
    if (cmsProducts && cmsProducts.length > 0) {
      return cmsProducts.map((cp) => ({
        id: cp.id,
        name: cp.name,
        price: cp.price,
        priceSuffix: cp.priceSuffix,
        description: cp.description,
        image: cp.image,
        badge: cp.badge && cp.badge !== "NONE" ? cp.badge : undefined,
        family: cp.family,
        activities: cp.activities,
        level: cp.level,
        caseSize: cp.caseSize,
      }));
    }
  } catch (err) {
    console.error("Error reading CMS products, fallback to static:", err);
  }
  return products;
}

export function catalogueProducts(def: CatalogueDef, locale: Locale = "en"): Product[] {
  return getAllProducts(locale).filter(def.filter);
}

// Back-compat: simple metadata lookup keyed by slug.
export const catalogueMeta: Record<string, { titleKey: string; headingKey: string }> = Object.fromEntries(
  catalogues.map((c) => [c.slug, { titleKey: c.titleKey, headingKey: c.headingKey }]),
);

export function getCMSProduct(id: string, locale: Locale = "en") {
  try {
    const cmsProducts = getCMSProducts(locale);
    return cmsProducts.find((cp) => cp.id === id);
  } catch (err) {
    console.error("Error looking up raw CMS product:", err);
    return undefined;
  }
}

export function getRawCMSProduct(id: string): CMSProduct | undefined {
  try {
    return getRawCMSProducts().find((cp) => cp.id === id);
  } catch (err) {
    console.error("Error looking up raw CMS product:", err);
    return undefined;
  }
}

export function getProduct(id: string, locale: Locale = "en"): Product | undefined {
  try {
    const cmsProducts = getCMSProducts(locale);
    const found = cmsProducts.find((cp) => cp.id === id);
    if (found) {
      return {
        id: found.id,
        name: found.name,
        price: found.price,
        priceSuffix: found.priceSuffix,
        description: found.description,
        image: found.image,
        badge: found.badge && found.badge !== "NONE" ? found.badge : undefined,
        family: found.family,
        activities: found.activities,
        level: found.level,
        caseSize: found.caseSize,
      };
    }
  } catch (err) {
    console.error("Error looking up CMS product:", err);
  }
  return products.find((p) => p.id === id);
}

export const fenix8Accessories: AccessoryItem[] = [
  {
    id: "acc-hrm-pro-plus",
    name: "HRM-Pro™ Plus",
    category: "Heart Rate & Sensors",
    price: 129.99,
    image: "/images/accessories/hrm-pro-plus.jpg",
    partNumber: "010-13118-05",
    description: "Premium chest strap transmitter with running dynamics, dual transmission (ANT+ & BLE) and tool-free battery door.",
    badge: "POPULAR",
  },
  {
    id: "acc-hrm-dual",
    name: "HRM-Dual™",
    category: "Heart Rate & Sensors",
    price: 69.99,
    image: "/images/accessories/hrm-dual.jpg",
    partNumber: "010-12845-00",
    description: "Transmits real-time heart rate data over ANT+ connectivity and BLUETOOTH Low Energy technology.",
  },
  {
    id: "acc-speed-cadence",
    name: "Speed Sensor 2 and Cadence Sensor 2 Bundle",
    category: "Heart Rate & Sensors",
    price: 69.99,
    image: "/images/accessories/speed-cadence-bundle.jpg",
    partNumber: "010-12843-00",
    description: "Monitor your pedaling cadence and wheel speed as you ride with easy-to-install wireless sensors.",
  },
  {
    id: "acc-qf22-silicone-black",
    name: "QuickFit® 22 Watch Band (Silicone Black)",
    category: "Bands & Straps",
    price: 49.99,
    image: "/images/accessories/quickfit-22-silicone.jpg",
    partNumber: "010-13392-10",
    description: "Stay stylish and sport-ready with this 22 mm silicone band for compatible Garmin watches.",
    badge: "INCLUDED SIZE",
  },
  {
    id: "acc-qf26-silicone-graphite",
    name: "QuickFit® 26 Watch Band (Silicone Graphite/Black)",
    category: "Bands & Straps",
    price: 49.99,
    image: "/images/accessories/quickfit-26-silicone.jpg",
    partNumber: "010-13393-00",
    description: "Interchangeable 26 mm silicone band for 51 mm fēnix models. Quick snap on and off mechanism.",
  },
  {
    id: "acc-charging-cable",
    name: "Garmin Charging / Data Cable",
    category: "Cables & Power",
    price: 24.99,
    image: "/images/accessories/charging-cable.jpg",
    partNumber: "010-12496-00",
    description: "Complete 2 tasks with 1 cable: connect to USB to recharge your device and transfer data.",
  },
  {
    id: "acc-inreach-mini2",
    name: "inReach® Mini 2",
    category: "Satellite & Navigation",
    price: 399.99,
    image: "/images/accessories/inreach-mini-2.jpg",
    partNumber: "010-02602-00",
    description: "Compact satellite communicator with two-way messaging and interactive SOS capabilities.",
    badge: "SAFETY ESSENTIAL",
  },
];

// ---- Detailed product page data (fēnix 8, id 1228429) ----
export const fenix8Detail: ProductDetail = {
  id: "1228429",
  title: "fēnix® 8 – 47 mm, AMOLED",
  subtitle: "Sapphire, Titanium with Spark Orange/Graphite Silicone Band",
  partNumber: "010-02904-10",
  price: 1099.99,
  badge: "CUSTOMIZABLE",
  breadcrumb: [
    { label: "OUTDOOR RECREATION", href: "/c/wearables-smartwatches" },
    { label: "ADVENTURE WATCHES", href: "/c/wearables-smartwatches" },
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
    { label: "Water rating", value: "10 ATM (Dive rated 40m)" },
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
  accessories: fenix8Accessories,
  related: ["1462801", "1316397", "1828641", "851039"],
};

// Build a functional detail page for products without hand-authored data.
function buildFallbackDetail(p: Product, locale: Locale): ProductDetail {
  let specs = [
    { label: "Family", value: p.family },
    { label: "Level", value: p.level },
    { label: "Case size", value: p.caseSize },
    { label: "Activities", value: p.activities.join(", ") },
  ];
  let inTheBox = [p.name, "Charging/data cable", "Documentation"];
  let gallery = [{ view: "Front", src: p.image }];

  try {
    const cmsProducts = getCMSProducts(locale);
    const found = cmsProducts.find((cp) => cp.id === p.id);
    if (found) {
      if (found.specs && found.specs.length > 0) {
        specs = found.specs;
      }
      if (found.inTheBox && found.inTheBox.length > 0) {
        inTheBox = found.inTheBox;
      }
      // Photos uploaded in the admin show on the legacy page too (default photo first).
      if (found.images && found.images.length > 0) {
        const ordered = [
          ...found.images.filter((i) => i.id === found.defaultImageId),
          ...found.images.filter((i) => i.id !== found.defaultImageId),
        ];
        gallery = ordered.map((img, i) => ({ view: `${img.alt || p.name} ${i + 1}`, src: img.src }));
      }
    }
  } catch (e) {
    console.error("Error reading CMS product details:", e);
  }

  return {
    id: p.id,
    title: p.name,
    subtitle: p.description,
    partNumber: `010-${p.id.slice(0, 4)}-00`,
    price: p.price,
    badge: p.badge,
    breadcrumb: [
      { label: "SMARTWATCHES", href: "/c/wearables-smartwatches" },
      { label: p.family.toUpperCase(), href: "/c/wearables-smartwatches" },
    ],
    gallery,
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
    specs,
    inTheBox,
    related: getAllProducts(locale)
      .filter((x) => x.id !== p.id && x.family === p.family)
      .slice(0, 4)
      .map((x) => x.id),
  };
}

/** Storefront detail for CMS products that use the media/options/variants model. */
export function buildDetailFromCms(p: CMSProduct, locale: Locale = "en"): ProductDetail {
  const images = p.images || [];
  const ordered = [
    ...images.filter((i) => i.id === p.defaultImageId),
    ...images.filter((i) => i.id !== p.defaultImageId),
  ];
  const gallery = ordered.length
    ? ordered.map((img, i) => ({ view: `${img.alt || p.name} ${i + 1}`, src: img.src }))
    : [{ view: p.name, src: p.image || "/images/products/1228429.jpg" }];
  const variants = p.variants || [];
  const defaultVariant = variants.find((v) => v.isDefault) || variants[0];
  const hasVariants = Boolean(p.options?.length && variants.length);
  return {
    id: p.id,
    title: p.name,
    subtitle: p.description,
    partNumber: defaultVariant?.sku || p.sku,
    price: p.price,
    badge: p.badge && p.badge !== "NONE" ? p.badge : undefined,
    breadcrumb: [
      { label: (p.category || "Products").toUpperCase(), href: "/c/wearables-smartwatches" },
      ...(p.family ? [{ label: p.family.toUpperCase(), href: "/c/wearables-smartwatches" }] : []),
    ],
    gallery,
    caseSizes: [],
    defaultCaseSize: "",
    versions: [],
    defaultVersion: "",
    colors: [],
    features: p.features || [],
    specs: p.specs || [],
    inTheBox: p.inTheBox || [],
    related: getAllProducts(locale)
      .filter((x) => x.id !== p.id && x.family === p.family)
      .slice(0, 4)
      .map((x) => x.id),
    ...(hasVariants ? { variantModel: { options: p.options || [], variants, images } } : {}),
    ...(p.overviewHtml ? { overviewHtml: p.overviewHtml } : {}),
    ...(p.specGroups?.length ? { specGroups: p.specGroups } : {}),
  };
}

export function getProductDetail(id: string, locale: Locale = "en"): ProductDetail | undefined {
  const cms = getCMSProduct(id, locale);
  // Only products with variants or an overview get the CMS page; legacy products keep their hand-built page
  // (re-saving one in the admin must not change its storefront).
  if (cms && usesCmsDetail(cms)) return buildDetailFromCms(cms, locale);
  const dynamicProduct = getProduct(id, locale);

  if (id === "1228429") {
    if (!dynamicProduct) return fenix8Detail;
    return {
      ...fenix8Detail,
      title: dynamicProduct.name || fenix8Detail.title,
      subtitle: dynamicProduct.description || fenix8Detail.subtitle,
      price: dynamicProduct.price ?? fenix8Detail.price,
      badge: dynamicProduct.badge, // Dynamically pulled from CMS store
    };
  }

  return dynamicProduct ? buildFallbackDetail(dynamicProduct, locale) : undefined;
}
