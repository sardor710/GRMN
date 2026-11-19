import type { ProductImage, ProductOption, ProductVariant, SpecGroup } from "@/lib/cms/types";

export interface HeroSlide {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  alt: string;
}

export interface FeaturedCard {
  badge?: string;
  title: string;
  description: string;
  image: string;
  href: string;
  fineprint?: string;
}

export interface PromoPod {
  title: string;
  image: string;
  href: string;
  cta: string;
}

export interface HalfPod {
  title: string;
  image: string;
  href: string;
  cta: string;
}

export interface CategoryTile {
  /** Message key (`CategoryGrid.tiles.*`). */
  titleKey: string;
  image: string;
  href: string;
}

export interface NavItem {
  label: string;
  href: string;
  columns?: NavColumn[];
}

export interface NavColumn {
  heading?: string;
  links: { label: string; href: string }[];
}

export interface FooterColumn {
  /** Stable id for the accordion panel (independent of the translated heading). */
  id: string;
  /** Message keys (`Footer.*`), resolved with `t()` where rendered. */
  headingKey: string;
  links: { labelKey: string; href: string }[];
}

export interface Product {
  availability?: import("../contracts/commerce").Availability;
  priceLabel?: string;
  currency?: "KZT" | "USD";
  purchasable?: boolean;
  id: string;
  name: string;
  price: number | string;
  priceSuffix?: string; // e.g. "and up"
  description: string;
  image: string;
  badge?: string;
  family: string;
  activities: string[];
  level: "Entry" | "Advanced" | "Premium" | "Youth" | "Unknown";
  caseSize: "Small" | "Medium" | "Large" | "Unknown";
}

export interface WatchFamily {
  name: string;
  tagline: string;
  image: string;
}

export interface AccessoryItem {
  id: string;
  name: string;
  category: "Bands & Straps" | "Heart Rate & Sensors" | "Cables & Power" | "Mounts & Protection" | "Satellite & Navigation";
  price: number;
  image: string;
  partNumber: string;
  description?: string;
  badge?: string;
}

export interface ProductDetail {
  priceLabel?: string;
  commerce?: import("../contracts/commerce").ProductDetailDTO;
  currency?: "KZT" | "USD";
  purchasable?: boolean;
  id: string;
  title: string;
  subtitle: string;
  partNumber: string;
  price: number | string;
  badge?: string;
  breadcrumb: { label: string; href: string }[];
  gallery: { view: string; src: string }[];
  caseSizes: string[];
  defaultCaseSize: string;
  versions: string[];
  defaultVersion: string;
  colors: { label: string; src: string }[];
  features: { title: string; body: string; image?: string }[];
  specs: { label: string; value: string }[];
  inTheBox: string[];
  accessories?: AccessoryItem[];
  related: string[]; // product ids
  /** Present when the CMS product defines options/variants: drives the storefront variant pickers. */
  variantModel?: { options: ProductOption[]; variants: ProductVariant[]; images: ProductImage[] };
  /** Sanitized overview HTML (garmin.com import or admin edit). */
  overviewHtml?: string;
  specGroups?: SpecGroup[];
}

