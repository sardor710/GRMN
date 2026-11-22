import "server-only";
import type { AccessoryItem, Product, ProductDetail } from "@/types";
import { cmsBackend, readLegacyKztPerUsd, readProduct, readProductsPage } from "@/server/cms/source";
import { isLegacyUsdProduct, withStorefrontPrices } from "@/lib/legacy-prices";
import { getCatalogService } from "@/server/catalog/runtime";
import { catalogCardView } from "@/lib/public-catalog";
import type { ProductQuery } from "@/contracts/commerce";
import type { CMSProduct } from "@/lib/cms/types";
import { usesCmsDetail } from "@/lib/cms/product-variants";
import type { Locale } from "@/i18n/config";
import { localizeProduct } from "@/i18n/translate-record";
import { cardColors } from "@/lib/catalog/card-colors";
import { activityFilters, caseSizeFilters, levelFilters } from "@/lib/catalog-constants";
import { parseSort, SORT_OPTIONS } from "@/lib/catalog-facets";
import type { CatalogSortKey } from "@/contracts/catalog-browse";
import { taxonomySeed } from "@/server/catalog/taxonomy-seed";
import { URL_PRESET_SLUGS } from "@/server/catalog/category-page";
import { homepageProductCandidates, localizeHomepage } from "@/server/catalog/local-links";
import type { HomepageConfig } from "@/lib/cms/types";


export { watchFamilies, products } from "./public-products";
export { activityFilters, levelFilters, caseSizeFilters, filterLabelKey, type FilterOption } from "./catalog-constants";

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

/** Task C-d: colour dots from the record's colour option, counting only colours an active variant is in. */
function legacyColors(cp:CMSProduct):Pick<Product,"colors">{
  const active=(cp.variants??[]).filter(v=>v.status==="active");
  const colors=cardColors(cp.options,(option,value)=>active.some(v=>v.selections?.[option.id]===value.id));
  return colors.length?{colors}:{};
}
/** Task 5a.2: legacy USD-scale prices become tenge here, once, at the importer rate (src/lib/legacy-prices.ts). */
function publicProduct(raw: CMSProduct, rate: number | undefined): Product {
  const cp=withStorefrontPrices(raw,rate);
  return {...legacyColors(cp),currency:cp.currency,purchasable:cp.stockManaged===false?false:undefined,id:cp.id,name:cp.name,price:cp.price,
    // A sale shows on the card unless the record is marked currency "USD": those seed records carry a generated originalPrice (+15%), not a sale. An admin save stamps KZT, so a sale set there shows.
    ...(!isLegacyUsdProduct(raw)&&typeof cp.originalPrice==="number"&&cp.originalPrice>cp.price?{compareAt:cp.originalPrice}:{}),
    priceSuffix:cp.priceSuffix,description:cp.description,image:cp.image,badge:cp.badge&&cp.badge!=="NONE"?cp.badge:undefined,family:cp.family,activities:cp.activities,level:cp.level,caseSize:cp.caseSize};
}
export const defaultProductQuery:ProductQuery={market:"default",locale:"en",displayCurrency:"KZT"};
/** Product query for a storefront locale (the PostgreSQL catalog overlays product_translations, Task 24). */
function queryFor(locale:Locale):ProductQuery{return locale===defaultProductQuery.locale?defaultProductQuery:{...defaultProductQuery,locale};}
/** Legacy CMS records carry `translations`; overlay the visitor's language (blank fields fall back to English). */
function localized(cp:CMSProduct,locale:Locale):CMSProduct{return locale==="en"?cp:localizeProduct(cp,locale);}
export async function getAllProducts(locale:Locale="en"): Promise<Product[]> {
  if(cmsBackend()==="postgres")return (await getCatalogService().listProducts(queryFor(locale),{limit:100})).items.map(p=>catalogCardView(p));
  const rate=await readLegacyKztPerUsd();
  return (await readProductsPage({limit:100})).items.map(cp=>publicProduct(localized(cp,locale),rate));
}
export async function getProductsByKeys(keys:string[],locale:Locale="en"):Promise<Product[]> {
  if(cmsBackend()==="postgres")return (await getCatalogService().getProductsByKeys(keys,queryFor(locale))).items.map(p=>catalogCardView(p));
  return (await Promise.all(keys.slice(0,100).map(key=>getProduct(key,locale)))).filter((p):p is Product=>p!==undefined);
}
export async function catalogueProducts(def:CatalogueDef,input:Partial<ProductQuery>&{cursor?:string}={},locale:Locale="en") {
  const {cursor,...filters}=input;
  const query:ProductQuery={...queryFor(locale),...filters,...(def.slug.includes("running-smartwatches")?{activitiesAll:["running"]}:{})};
  if(cmsBackend()==="postgres"){const page=await getCatalogService().listProducts(query,{limit:24,cursor});return{items:page.items.map(p=>catalogCardView(p,query.displayCurrency)),nextCursor:page.nextCursor};}
  const rate=await readLegacyKztPerUsd();
  const page=await readProductsPage({limit:24,cursor,...filters,...(def.slug.includes("running-smartwatches")?{activitiesAll:["running"]}:{})});return {items:page.items.map(cp=>publicProduct(localized(cp,locale),rate)),nextCursor:page.nextCursor};
}

// ---- Taxonomy category pages (M4.2/M4.3) ----

/** URL parameters of the facet rail (CatalogueGrid writes them, the /c/ page reads them). */
export const FACET_PARAMS = ["series", "activities", "levels", "caseSizes", "prices", "availability"] as const;
/** Present when the shopper cleared every facet on a page with a garmin.com URL preset. */
export const EXPLICIT_PARAM = "all";
type SearchQuery = Readonly<Record<string, string | string[] | undefined>>;

export interface GridFacet { key: string; label: string; options: { value: string; label: string; count?: number; checked: boolean }[] }
export interface CategoryView {
  /** Category name (PostgreSQL / taxonomy); legacy JSON catalogues carry `headingKey` instead and show its message. */
  name: string;
  headingKey?: string;
  slug: string;
  path: { name: string; slug: string }[];
  description: string | null;
  hero: CatalogueDef["hero"] | "families" | null;
  items: Product[];
  facets: GridFacet[];
  sort: CatalogSortKey;
  sortOptions: readonly { value: CatalogSortKey; label: string }[];
  categoryTotal: number;
  total: number;
  page: number;
  pageCount: number;
  /** The rail must keep the selection explicit (EXPLICIT_PARAM) when it empties: the page has a URL preset. */
  hasPreset: boolean;
  /** Legacy JSON storefront only: keyset paging. */
  nextCursor?: string | null;
}

const one = (query: SearchQuery, key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
const many = (query: SearchQuery, key: string) => [query[key] ?? []].flat().filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, 30);

/** The page for a taxonomy slug, or null (404). Postgres: from `categories`; legacy JSON: the two original pages, other taxonomy slugs render empty. */
export async function getCategoryView(slug: string, query: SearchQuery, locale: Locale = "en"): Promise<CategoryView | null> {
  const def = getCatalogue(slug);
  const hero: CategoryView["hero"] = def ? (def.showFamilies ? "families" : def.hero ?? null) : null;
  const sortParam = parseSort(one(query, "sort"));
  if (cmsBackend() === "postgres") {
    const rawPage = Number.parseInt(one(query, "page") ?? "1", 10);
    const data = await getCatalogService().getCategoryPage(slug, {
      filters: { series: many(query, "series"), activities: many(query, "activities"), levels: many(query, "levels"), caseSizes: many(query, "caseSizes"), prices: many(query, "prices"), inStock: one(query, "availability") === "in-stock" },
      explicit: [...FACET_PARAMS, EXPLICIT_PARAM].some(key => query[key] !== undefined),
      sort: sortParam, page: Number.isSafeInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, 10000) : 1,
    });
    if (!data) return null;
    return {
      name: data.category.name, slug: data.category.slug, path: data.category.path, description: data.category.description, hero,
      items: data.items.map(card => catalogCardView(card)), facets: data.facets, sort: data.sort, sortOptions: SORT_OPTIONS,
      categoryTotal: data.categoryTotal, total: data.total, page: data.page, pageCount: data.pageCount,
      hasPreset: data.presetApplied || URL_PRESET_SLUGS.has(data.category.slug),
    };
  }
  // Legacy JSON storefront (frozen): behaves as before for its two catalogues.
  if (!def) {
    const node = taxonomySeed.find(n => n.slug === slug && (n.kind !== "group" || n.navVisible || n.slug.startsWith("watch-series/")));
    if (!node) return null;
    const path: { name: string; slug: string }[] = [];
    for (let at: typeof node | undefined = node; at; at = taxonomySeed.find(n => n.key === at!.parentKey)) path.unshift({ name: at.name, slug: at.slug });
    return { name: node.name, slug, path, description: null, hero: null, items: [], facets: [], sort: "featured", sortOptions: SORT_OPTIONS, categoryTotal: 0, total: 0, page: 1, pageCount: 1, hasPreset: false };
  }
  const legacySorts = { featured: "newest", "price-asc": "price_asc", "price-desc": "price_desc", "name-asc": "name_asc", "name-desc": "name_desc" } as const;
  const activities = many(query, "activities"), levels = many(query, "levels"), caseSizes = many(query, "caseSizes");
  const page = await catalogueProducts(def, { cursor: one(query, "cursor"), search: one(query, "search"), activities, levels: levels as ProductQuery["levels"], caseSizes: caseSizes as ProductQuery["caseSizes"], sort: legacySorts[sortParam] }, locale);
  // Option labels are the English data values; CatalogueGrid shows them in the page language.
  const facets: GridFacet[] = [
    { key: "activities", label: "Activity", options: activityFilters.map(f => ({ value: f.value, label: f.value, checked: activities.includes(f.value) })) },
    { key: "levels", label: "Level", options: levelFilters.map(f => ({ value: f.value, label: f.value, checked: levels.includes(f.value) })) },
    { key: "caseSizes", label: "Case Size", options: caseSizeFilters.map(f => ({ value: f.value, label: f.value, checked: caseSizes.includes(f.value) })) },
  ];
  return {
    name: def.slug, headingKey: def.headingKey, slug, path: [{ name: def.slug, slug }], description: null, hero, items: page.items, facets, sort: sortParam,
    sortOptions: SORT_OPTIONS, categoryTotal: page.items.length, total: page.items.length, page: 1, pageCount: 1, hasPreset: false, nextCursor: page.nextCursor,
  };
}

/**
 * The category's display name for page metadata (no product queries); null when the slug has no page. Legacy JSON
 * catalogues are named by their `titleKey` message on the page, so this returns null for them.
 */
export async function getCategoryName(slug: string): Promise<string | null> {
  if (cmsBackend() === "postgres") return (await getCatalogService().getCategory(slug))?.name ?? null;
  return getCatalogue(slug) ? null : taxonomySeed.find(n => n.slug === slug && (n.kind !== "group" || n.navVisible || n.slug.startsWith("watch-series/")))?.name ?? null;
}

/** M4.4: homepage CMS links open local categories and published local products where they exist. */
export async function localizeHomepageLinks(config: HomepageConfig): Promise<HomepageConfig> {
  const candidates = homepageProductCandidates(config);
  const published = new Set((candidates.length ? await getProductsByKeys(candidates) : []).map(p => p.id));
  return localizeHomepage(config, published);
}

/** Category slugs for the sitemap: Postgres = categories with at least one listed product; legacy = the two catalogues. */
export async function getSitemapCategorySlugs(): Promise<string[]> {
  if (cmsBackend() === "postgres") return getCatalogService().listCategorySlugsWithProducts();
  return catalogues.map(c => c.slug);
}

// Back-compat: simple metadata lookup keyed by slug.
export const catalogueMeta: Record<string, { titleKey: string; headingKey: string }> = Object.fromEntries(
  catalogues.map((c) => [c.slug, { titleKey: c.titleKey, headingKey: c.headingKey }]),
);

/** Untranslated CMS record (English source plus its `translations` overlay), legacy backend only. */
export async function getRawCMSProduct(id:string):Promise<CMSProduct|undefined>{return cmsBackend()==="legacy"?readProduct(id):undefined;}
export async function getCMSProduct(id:string,locale:Locale="en"){const raw=await getRawCMSProduct(id);return raw?localized(raw,locale):undefined;}
export async function getProduct(id:string,locale:Locale="en"):Promise<Product|undefined> {
  if(cmsBackend()==="postgres"){const found=await getCatalogService().getProductByPublicKey(id,"default","KZT",locale);return found?catalogCardView(found):undefined;}
  const found=await readProduct(id);return found?publicProduct(localized(found,locale),await readLegacyKztPerUsd()):undefined;
}


// Legacy static accessory records (USD era). The storefront no longer shows them: PostgreSQL products list their
// accessories from product_compatibility (Accessories tab). Kept as source data for the legacy migration archive
// (D02: existing business data is preserved; see docs/backend/source-inventory.json).
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
    { label: "Outdoor Recreation", href: "/c/wearables-smartwatches" },
    { label: "Adventure Watches", href: "/c/wearables-smartwatches" },
  ],
  gallery: [
    { view: "Front", src: "/images/products/fenix8-cf.jpg" },
    { view: "Right", src: "/images/products/fenix8-rf.jpg" },
    { view: "Left", src: "/images/products/fenix8-lf.jpg" },
    { view: "Detail 1", src: "/images/products/fenix8-pd-01.jpg" },
    { view: "Detail 2", src: "/images/products/fenix8-pd-02.jpg" },
  ],
  caseSizes: ["43 mm", "47 mm", "51 mm"],
  defaultCaseSize: "47 mm",
  versions: ["fēnix® 8 – AMOLED", "fēnix® 8 – Solar", "fēnix® E", "fēnix® 8 Pro – AMOLED", "fēnix® 8 Pro – MicroLED"],
  defaultVersion: "fēnix® 8 – AMOLED",
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
  related: ["1462801", "1316397", "1828641", "851039"],
};

// Build a functional detail page for products without hand-authored data.
async function buildFallbackDetail(p: Product, locale: Locale): Promise<ProductDetail> {
  let specs = [
    { label: "Family", value: p.family },
    { label: "Level", value: p.level },
    { label: "Case size", value: p.caseSize },
    { label: "Activities", value: p.activities.join(", ") },
  ];
  // No in-the-box preset (plan #7): the tab is hidden until the product lists its contents.
  let inTheBox: string[] = [];
  let gallery = [{ view: "Front", src: p.image }];

  const raw=await readProduct(p.id);
  const found=raw?localized(raw,locale):undefined;
  if(found?.specs?.length)specs=found.specs;
  if(found?.inTheBox?.length)inTheBox=boxFields(found.inTheBox).inTheBox;
  // Photos uploaded in the admin show on the legacy page too (default photo first).
  if(found?.images?.length){
    const ordered=[...found.images.filter((i)=>i.id===found.defaultImageId),...found.images.filter((i)=>i.id!==found.defaultImageId)];
    gallery=ordered.map((img,i)=>({view:`${img.alt||p.name} ${i+1}`,src:img.src}));
  }

  return {
    id: p.id,
    title: p.name,
    subtitle: p.description,
    partNumber: found?.sku ?? p.id,
    currency:p.currency,purchasable:p.purchasable,
    price: p.price,
    badge: p.badge,
    breadcrumb: [
      { label: "Smartwatches", href: "/c/wearables-smartwatches" },
      { label: p.family, href: "/c/wearables-smartwatches" },
    ],
    gallery,
    caseSizes: ["43 mm", "47 mm", "51 mm"],
    defaultCaseSize: "47 mm",
    versions: [p.name],
    defaultVersion: p.name,
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
    related: (await getAllProducts(locale))
      .filter((x) => x.id !== p.id && x.family === p.family)
      .slice(0, 4)
      .map((x) => x.id),
  };
}

/** In-the-box labels, plus the items when any has a photo (stored items are strings or `{label, image?}`). */
function boxFields(raw: unknown): Pick<ProductDetail, "inTheBox" | "inTheBoxItems"> {
  const items = (Array.isArray(raw) ? raw : []).flatMap((entry: unknown) => {
    if (typeof entry === "string") return entry.trim() ? [{ label: entry, image: null }] : [];
    const record = entry && typeof entry === "object" ? (entry as { label?: unknown; image?: unknown }) : {};
    const image = typeof record.image === "string" && record.image.startsWith("/") && !record.image.startsWith("//") ? record.image : null;
    return typeof record.label === "string" && record.label.trim() ? [{ label: record.label, image }] : [];
  });
  return { inTheBox: items.map((item) => item.label), ...(items.some((item) => item.image) ? { inTheBoxItems: items } : {}) };
}

/** Storefront detail for CMS products that use the media/options/variants model. */
export async function buildDetailFromCms(p: CMSProduct, locale: Locale = "en"): Promise<ProductDetail> {
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
    currency: p.currency,
    badge: p.badge && p.badge !== "NONE" ? p.badge : undefined,
    breadcrumb: [
      // garmin.com: "Sports & Fitness / Fitness Tracking" — category, then subcategory (family as a fallback).
      { label: p.category || "Products", href: "/c/wearables-smartwatches" },
      ...(p.subCategory || p.family ? [{ label: String(p.subCategory || p.family), href: "/c/wearables-smartwatches" }] : []),
    ],
    gallery,
    caseSizes: [],
    defaultCaseSize: "",
    versions: [],
    defaultVersion: "",
    colors: [],
    features: p.features || [],
    specs: p.specs || [],
    ...boxFields(p.inTheBox),
    related: (await getAllProducts(locale))
      .filter((x) => x.id !== p.id && x.family === p.family)
      .slice(0, 4)
      .map((x) => x.id),
    ...(hasVariants ? { variantModel: { options: p.options || [], variants, images } } : {}),
    ...(p.overviewHtml ? { overviewHtml: p.overviewHtml } : {}),
    ...(p.specGroups?.length ? { specGroups: p.specGroups } : {}),
  };
}


export async function getProductDetail(id: string, locale: Locale = "en"): Promise<ProductDetail | undefined> {
  if(cmsBackend()==="postgres"){
    const detail=await getCatalogService().getProductByPublicKey(id,"default","KZT",locale);if(!detail)return undefined;
    const view=catalogCardView(detail),editorial=id==="1228429"?fenix8Detail:undefined;
    return {id:detail.publicKey,title:detail.name,subtitle:detail.description,partNumber:detail.variants.find(v=>v.id===detail.selectedVariantId)?.sku??detail.variants[0]?.sku??"",price:view.price,priceLabel:view.priceLabel,currency:"KZT",purchasable:view.purchasable,badge:view.badge,commerce:detail,
      // M4.7: the primary category path; products without a primary category keep the editorial or Smartwatches crumb.
      breadcrumb:detail.breadcrumb?.length?detail.breadcrumb.map(c=>({label:c.name,href:`/c/${c.slug}`})):editorial?.breadcrumb??[{label:"Smartwatches",href:"/c/wearables-smartwatches"}],
      gallery:detail.gallery.map(m=>({view:m.alt||detail.name,src:m.url})),
      caseSizes:[],defaultCaseSize:"",versions:[],defaultVersion:"",colors:[],
      features:detail.features.length?detail.features.map(f=>({title:f.title,body:f.body,image:f.image?.url})):editorial?.features??[],specs:detail.specs.length?detail.specs:editorial?.specs??[],inTheBox:detail.inTheBox.length?detail.inTheBox:editorial?.inTheBox??[],related:detail.relatedProductKeys??[],
      // M5.6: overview, grouped specs and in-the-box photos from the Postgres catalog.
      ...(detail.overviewHtml?{overviewHtml:detail.overviewHtml}:{}),...(detail.specGroups?.length?{specGroups:detail.specGroups}:{}),...(detail.inTheBoxItems?.length?{inTheBoxItems:detail.inTheBoxItems}:{})};
  }
  const cms = await getCMSProduct(id, locale);
  // Only products with variants or an overview get the CMS page; legacy products keep their hand-built page
  // (re-saving one in the admin must not change its storefront).
  if (cms && usesCmsDetail(cms)) return buildDetailFromCms(withStorefrontPrices(cms, await readLegacyKztPerUsd()), locale);
  const dynamicProduct = await getProduct(id, locale);

  if (id === "1228429") {
    if (!dynamicProduct) return undefined;
    return {
      ...fenix8Detail,
      title: dynamicProduct.name || fenix8Detail.title,
      subtitle: dynamicProduct.description || fenix8Detail.subtitle,
      currency:dynamicProduct.currency,purchasable:dynamicProduct.purchasable,
      price: dynamicProduct.price ?? fenix8Detail.price,
      badge: dynamicProduct.badge, // Dynamically pulled from CMS store
    };
  }

  return dynamicProduct ? buildFallbackDetail(dynamicProduct, locale) : undefined;
}
