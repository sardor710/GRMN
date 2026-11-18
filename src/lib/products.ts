import "server-only";
import type { Product, ProductDetail, AccessoryItem } from "@/types";
import { cmsBackend, readProduct, readProductsPage } from "@/server/cms/source";
import { getCatalogService } from "@/server/catalog/runtime";
import { catalogCardView } from "@/lib/public-catalog";
import type { ProductQuery } from "@/contracts/commerce";
import type { CMSProduct } from "@/lib/cms/types";
import { usesCmsDetail } from "@/lib/cms/product-variants";


export { watchFamilies, products, activityFilters, levelFilters, caseSizeFilters } from "./public-products";

export interface CatalogueDef {
  slug: string;
  title: string;
  heading: string;
  showFamilies: boolean;
  hero?: { image: string; label: string; blurb: string };
  filter: (p: Product) => boolean;
}

export const catalogues: CatalogueDef[] = [
  {
    slug: "wearables-smartwatches",
    title: "Smartwatches",
    heading: "ALL SMARTWATCHES",
    showFamilies: true,
    filter: () => true,
  },
  {
    slug: "sports-fitness/running-smartwatches",
    title: "GPS Running Watches",
    heading: "ALL RUNNING SMARTWATCHES",
    showFamilies: false,
    hero: {
      image: "/images/74662-sports-and-fitness-pod.jpg",
      label: "SPORTS & FITNESS",
      blurb: "Running Smartwatches",
    },
    filter: (p) => p.activities.includes("Running"),
  },
];

export function getCatalogue(slug: string): CatalogueDef | undefined {
  return catalogues.find((c) => c.slug === slug);
}

function publicProduct(cp: CMSProduct): Product {
  return {currency:cp.currency??"USD",purchasable:cp.stockManaged===false?false:undefined,id:cp.id,name:cp.name,price:cp.price,priceSuffix:cp.priceSuffix,description:cp.description,image:cp.image,badge:cp.badge&&cp.badge!=="NONE"?cp.badge:undefined,family:cp.family,activities:cp.activities,level:cp.level,caseSize:cp.caseSize};
}
export const defaultProductQuery:ProductQuery={market:"default",locale:"en",displayCurrency:"KZT"};
export async function getAllProducts(): Promise<Product[]> {
  if(cmsBackend()==="postgres")return (await getCatalogService().listProducts(defaultProductQuery,{limit:100})).items.map(p=>catalogCardView(p));
  return (await readProductsPage({limit:100})).items.map(publicProduct);
}
export async function getProductsByKeys(keys:string[]):Promise<Product[]> {
  if(cmsBackend()==="postgres")return (await getCatalogService().getProductsByKeys(keys,defaultProductQuery)).items.map(p=>catalogCardView(p));
  return (await Promise.all(keys.slice(0,100).map(getProduct))).filter((p):p is Product=>p!==undefined);
}
export async function catalogueProducts(def:CatalogueDef,input:Partial<ProductQuery>&{cursor?:string}={}) {
  const {cursor,...filters}=input;
  const query:ProductQuery={...defaultProductQuery,...filters,...(def.slug.includes("running-smartwatches")?{activitiesAll:["running"]}:{})};
  if(cmsBackend()==="postgres"){const page=await getCatalogService().listProducts(query,{limit:24,cursor});return{items:page.items.map(p=>catalogCardView(p,query.displayCurrency)),nextCursor:page.nextCursor};}
  const page=await readProductsPage({limit:24,cursor,...filters,...(def.slug.includes("running-smartwatches")?{activitiesAll:["running"]}:{})});return {items:page.items.map(publicProduct),nextCursor:page.nextCursor};
}

// Back-compat: simple metadata lookup keyed by slug.
export const catalogueMeta: Record<string, { title: string; heading: string }> = Object.fromEntries(
  catalogues.map((c) => [c.slug, { title: c.title, heading: c.heading }]),
);

export async function getCMSProduct(id:string){return cmsBackend()==="legacy"?readProduct(id):undefined;}
export async function getProduct(id:string):Promise<Product|undefined> {
  if(cmsBackend()==="postgres"){const found=await getCatalogService().getProductByPublicKey(id,"default","KZT");return found?catalogCardView(found):undefined;}
  const found=await readProduct(id);return found?publicProduct(found):undefined;
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
async function buildFallbackDetail(p: Product): Promise<ProductDetail> {
  let specs = [
    { label: "Family", value: p.family },
    { label: "Level", value: p.level },
    { label: "Case size", value: p.caseSize },
    { label: "Activities", value: p.activities.join(", ") },
  ];
  let inTheBox = [p.name, "Charging/data cable", "Documentation"];
  let gallery = [{ view: "Front", src: p.image }];

  const found=await readProduct(p.id);
  if(found?.specs?.length)specs=found.specs;
  if(found?.inTheBox?.length)inTheBox=found.inTheBox;
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
    related: (await getAllProducts())
      .filter((x) => x.id !== p.id && x.family === p.family)
      .slice(0, 4)
      .map((x) => x.id),
  };
}

/** Storefront detail for CMS products that use the media/options/variants model. */
export async function buildDetailFromCms(p: CMSProduct): Promise<ProductDetail> {
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
    related: (await getAllProducts())
      .filter((x) => x.id !== p.id && x.family === p.family)
      .slice(0, 4)
      .map((x) => x.id),
    ...(hasVariants ? { variantModel: { options: p.options || [], variants, images } } : {}),
    ...(p.overviewHtml ? { overviewHtml: p.overviewHtml } : {}),
    ...(p.specGroups?.length ? { specGroups: p.specGroups } : {}),
  };
}


export async function getProductDetail(id: string): Promise<ProductDetail | undefined> {
  if(cmsBackend()==="postgres"){
    const detail=await getCatalogService().getProductByPublicKey(id,"default","KZT");if(!detail)return undefined;
    const view=catalogCardView(detail),editorial=id==="1228429"?fenix8Detail:undefined;
    return {id:detail.publicKey,title:detail.name,subtitle:detail.description,partNumber:detail.variants.find(v=>v.id===detail.selectedVariantId)?.sku??detail.variants[0]?.sku??"",price:view.price,priceLabel:view.priceLabel,currency:"KZT",purchasable:false,badge:view.badge,commerce:detail,
      breadcrumb:editorial?.breadcrumb??[{label:"SMARTWATCHES",href:"/c/wearables-smartwatches"}],
      gallery:detail.gallery.map(m=>({view:m.alt||detail.name,src:m.url})),
      caseSizes:[],defaultCaseSize:"",versions:[],defaultVersion:"",colors:[],
      features:detail.features.length?detail.features.map(f=>({title:f.title,body:f.body,image:f.image?.url})):editorial?.features??[],specs:detail.specs.length?detail.specs:editorial?.specs??[],inTheBox:detail.inTheBox.length?detail.inTheBox:editorial?.inTheBox??[],related:detail.relatedProductKeys??[]};
  }
  const cms = await getCMSProduct(id);
  // Only products with variants or an overview get the CMS page; legacy products keep their hand-built page
  // (re-saving one in the admin must not change its storefront).
  if (cms && usesCmsDetail(cms)) return buildDetailFromCms(cms);
  const dynamicProduct = await getProduct(id);

  if (id === "1228429") {
    if (!dynamicProduct) return undefined;
    return {
      ...fenix8Detail,
      accessories:dynamicProduct.currency==="KZT"?undefined:fenix8Detail.accessories,
      title: dynamicProduct.name || fenix8Detail.title,
      subtitle: dynamicProduct.description || fenix8Detail.subtitle,
      currency:dynamicProduct.currency,purchasable:dynamicProduct.purchasable,
      price: dynamicProduct.price ?? fenix8Detail.price,
      badge: dynamicProduct.badge, // Dynamically pulled from CMS store
    };
  }

  return dynamicProduct ? buildFallbackDetail(dynamicProduct) : undefined;
}
