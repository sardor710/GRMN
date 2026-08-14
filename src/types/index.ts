export interface HeroSlide {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  alt: string;
}

export interface FeaturedCard {
  badge?: "NEW" | "SALE";
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
  title: string;
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
  heading: string;
  links: { label: string; href: string }[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  priceSuffix?: string; // e.g. "and up"
  description: string;
  image: string;
  badge?: "NEW" | "CUSTOMIZABLE" | "SALE";
  family: string;
  activities: string[];
  level: "Entry" | "Advanced" | "Premium" | "Youth";
  caseSize: "Small" | "Medium" | "Large";
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
  id: string;
  title: string;
  subtitle: string;
  partNumber: string;
  price: number;
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
}

