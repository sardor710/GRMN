import type { VariantContent } from '../catalog/variant-content';

export type AdminRole = 'super_admin' | 'editor' | 'product_manager' | 'support';
export type AdminStatus = 'active' | 'inactive';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: AdminRole;
  status: AdminStatus;
  avatar?: string;
  createdAt: string;
  lastLogin?: string;
}

export type ClientStatus = 'active' | 'vip' | 'pending' | 'suspended';

export interface Client {
  version?: number;
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  status: ClientStatus;
  totalSpent?: number;
  /** Set only on records known to be tenge (Task 5b.1 fix 1); unmarked legacy money is shown without a currency. */
  currency?: "KZT" | "USD";
  ordersCount?: number;
  avatar?: string;
  notes?: string;
  createdAt: string;
}

// ---- Translation overlay: English fields stay the source; ru/kk overlays are optional and
// partial (blank/missing fields fall back to English). Maps 1:1 onto future *_translations tables. ----
export type Translations<T> = Partial<Record<'ru' | 'kk', Partial<T>>>;

export type ProductStatus = 'published' | 'draft' | 'archived';

export type ProductBadgeOption =
  | 'NONE'
  | 'NEW'
  | 'CUSTOMIZABLE'
  | 'SALE'
  | 'BEST SELLER'
  | 'LIMITED EDITION'
  | 'CARBON EDITION'
  | 'GARMIN SIGNATURE'
  | 'EXCLUSIVE'
  | 'POPULAR'
  | 'FEATURED';

export interface ProductSpecItem {
  label: string;
  value: string;
}

export interface ProductFeatureItem {
  title: string;
  body: string;
  image?: string;
}

// ---- Product media, options and variants (mirror Postgres product_options / option_values /
// product_variants / variant_option_values / prices / media_assets / product_media) ----
export type OptionDisplay = "buttons" | "swatch" | "dropdown";

export interface ProductOptionValue {
  id: string;
  key: string;
  label: string;
  swatchColor?: string;
  swatchImage?: string;
}

export interface ProductOption {
  id: string;
  key: string;
  name: string;
  display: OptionDisplay;
  values: ProductOptionValue[];
}

export interface ProductImage {
  id: string;
  src: string;
  alt: string;
  source: "upload" | "import" | "url";
  width?: number;
  height?: number;
}

export interface SourcePrice {
  currency: "USD";
  list: number;
  sale?: number;
  rateKztPerUsd: number;
}

export type VariantStatus = "draft" | "active" | "archived";

export interface ProductVariant {
  id: string;
  sku: string;
  title: string;
  /** optionId → valueId */
  selections: Record<string, string>;
  price: number;
  originalPrice?: number;
  stock: number;
  status: VariantStatus;
  isDefault: boolean;
  imageIds: string[];
  sourcePartNumber?: string;
  sourcePrice?: SourcePrice;
  /** Own Specs/Overview/In the box (PostgreSQL only); a missing key inherits the product's block. */
  content?: VariantContent;
}

export interface SpecGroup {
  title: string;
  items: ProductSpecItem[];
}

export interface ProductSource {
  provider: "garmin";
  url: string;
  productId: string;
  partNumber: string;
  importedAt: string;
}

export interface CMSProduct {
  currency?: "KZT" | "USD";
  stockManaged?: boolean;
  version?: number;
  id: string;
  name: string;
  sku: string;
  price: number;
  originalPrice?: number;
  priceSuffix?: string;
  description: string;
  image: string;
  badge?: string;
  family: string;
  category: string;
  subCategory: string;
  activities: string[];
  level: 'Entry' | 'Advanced' | 'Premium' | 'Youth';
  caseSize: 'Small' | 'Medium' | 'Large';
  stock: number;
  status: ProductStatus;
  isFeatured?: boolean;
  specs: ProductSpecItem[];
  inTheBox: string[];
  compatibleAccessories: string[]; // Cross-selling product IDs or SKUs
  features?: ProductFeatureItem[];
  // Media, options & variants (all optional; legacy fields above are mirrored from the default variant)
  images?: ProductImage[];
  defaultImageId?: string;
  options?: ProductOption[];
  variants?: ProductVariant[];
  overviewHtml?: string;
  specGroups?: SpecGroup[];
  source?: ProductSource;
  // SEO Metadata
  seoTitle?: string;
  seoDescription?: string;
  focusKeywords?: string[];
  canonicalUrl?: string;
  noIndex?: boolean;
  ogImage?: string;
  createdAt: string;
  translations?: Translations<ProductTranslatable>;
}

export interface ProductTranslatable
  extends Pick<
    CMSProduct,
    | 'name'
    | 'description'
    | 'overviewHtml'
    | 'specs'
    | 'specGroups'
    | 'inTheBox'
    | 'features'
    | 'seoTitle'
    | 'seoDescription'
    | 'priceSuffix'
  > {
  /** optionId → translated option name */
  optionNames?: Record<string, string>;
  /** optionValueId → translated value label */
  valueLabels?: Record<string, string>;
  /** variantId → translated variant title */
  variantTitles?: Record<string, string>;
  /** imageId → translated alt text */
  imageAlts?: Record<string, string>;
}

export type DiscountType = 'percentage' | 'fixed';
export type DiscountStatus = 'active' | 'expired' | 'disabled';
export type DiscountApplyType = 'all' | 'categories' | 'skus';

export interface Discount {
  id: string;
  code: string;
  description: string;
  type: DiscountType;
  value: number;
  minSpend?: number;
  /** Currency of `value`/`minSpend` when known; unmarked legacy discounts show plain numbers. */
  currency?: "KZT" | "USD";
  usageLimit?: number;
  perCustomerLimit?: number;
  usageCount: number;
  applyType: DiscountApplyType;
  targetCategories?: string[];
  targetSkus?: string[];
  startDate?: string;
  expiresAt?: string;
  isStackable?: boolean;
  status: DiscountStatus;
  createdAt: string;
}

export type BannerPosition = 'hero' | 'promo_pod' | 'announcement';

export interface Banner {
  version?: number;
  id: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  image?: string;
  position: BannerPosition;
  active: boolean;
  order: number;
  createdAt: string;
  translations?: Translations<BannerTranslatable>;
}

export type BannerTranslatable = Pick<Banner, 'title' | 'subtitle' | 'ctaLabel'>;

export type BlogStatus = 'published' | 'draft';

export interface CMSBlog {
  updatedAt?: string;
  version?: number;
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  category: string;
  readingTime: string;
  author: string;
  status: BlogStatus;
  publishedAt: string;
  // SEO Metadata
  seoTitle?: string;
  seoDescription?: string;
  focusKeywords?: string[];
  canonicalUrl?: string;
  noIndex?: boolean;
  ogImage?: string;
  createdAt: string;
  translations?: Translations<BlogTranslatable>;
}

/** Blog category is a plain label string (no separate tag/category records), so it is translated inline. */
export type BlogTranslatable = Pick<
  CMSBlog,
  'title' | 'excerpt' | 'content' | 'category' | 'readingTime' | 'seoTitle' | 'seoDescription'
>;

export interface SEOCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  impact: 'high' | 'medium' | 'low';
}

export interface SEOScoreReport {
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  status: 'excellent' | 'good' | 'needs_work' | 'critical';
  checks: SEOCheckItem[];
  suggestions: string[];
}

export interface PageSEOAudit {
  id: string;
  title: string;
  type: 'product' | 'blog' | 'page';
  url: string;
  seoTitle?: string;
  seoDescription?: string;
  score: number;
  status: 'excellent' | 'good' | 'needs_work' | 'critical';
  issuesCount: number;
  lastUpdated?: string;
}

export type PaymentStatus = 'paid' | 'pending' | 'refunded';
export type FulfillmentStatus =
  | 'new'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'canceled'
  | 'returned'
  | 'cancelled';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  sku?: string;
  variantLabel?: string;
}

export type OrderRouteStage =
  | 'created'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered';

export interface OrderMilestone {
  stage: OrderRouteStage;
  label: string;
  date: string;
  description: string;
  completed: boolean;
  current?: boolean;
  location?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  total: number;
  /** Currency of `total` and item prices when known; unmarked legacy orders show plain numbers. */
  currency?: "KZT" | "USD";
  itemsCount: number;
  items: OrderItem[];
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  shippingAddress: string;
  clientPhone?: string;
  comments?: string;
  notes?: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDeliveryDate?: string;
  milestones?: OrderMilestone[];
  coordinates?: { lat: number; lng: number };
  createdAt: string;
}

export interface StoreSettings {
  storeName: string;
  contactEmail: string;
  supportPhone: string;
  currency: string;
  currencySymbol: string;
  freeShippingThreshold: number;
  taxRate: number;
  maintenanceMode: boolean;
  garminPaySandbox: boolean;
  stripeEnabled: boolean;
  seoTitle: string;
  seoDescription: string;
  /** KZT per 1 USD, remembered by the garmin.com importer */
  importRateKztPerUsd?: number;
  translations?: Translations<SettingsTranslatable>;
}

export type SettingsTranslatable = Pick<StoreSettings, 'seoTitle' | 'seoDescription'>;

export interface ActivityLog {
  id: string;
  adminName: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface CMSData {
  admins: AdminUser[];
  clients: Client[];
  products: CMSProduct[];
  discounts: Discount[];
  banners: Banner[];
  blogs: CMSBlog[];
  orders: Order[];
  settings: StoreSettings;
  activities: ActivityLog[];
  homepage?: HomepageConfig;
}

// ----------------- HOMEPAGE MANAGEMENT TYPES -----------------

export interface HeroBanner {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  /** Small legal copy under the subtitle (e.g. licensing notice). */
  disclaimer?: string;
  image: string;
  href: string;
  active: boolean;
  order: number;
}

export interface ProductCarouselItem {
  id: string;
  title: string;
  description: string;
  price: string;
  originalPrice?: string;
  badge?: "NEW" | "SALE" | string;
  image: string;
  href: string;
  order: number;
  /** Optional per-item render variant; "promo" renders an edge-to-edge image tile with a CTA button. */
  variant?: "product" | "promo";
  imageAlt?: string;
}

export interface PromoCarouselItem {
  id: string;
  title: string;
  description: string;
  image: string;
  href: string;
  ctaText: string;
  order: number;
  /** Optional per-item render variant; "promo" renders an edge-to-edge image tile with a CTA button. */
  variant?: "product" | "promo";
  imageAlt?: string;
}

export type CarouselType = "product" | "promo";

export interface CarouselBlock {
  id: string;
  title: string;
  subtitle?: string;
  type: CarouselType; // "product" (with price and tag) | "promo" (with photo and hyperlink button)
  /** PostgreSQL mode: show this published merchandising collection instead of the inline items. */
  collectionKey?: string;
  active: boolean;
  order: number;
  items: (ProductCarouselItem | PromoCarouselItem)[];
}

export interface HomepageTileBlock {
  id: string;
  title: string;
  image: string;
  href: string;
  cta: string;
  order: number;
}

export interface HomepageConfig {
  heroBanners: HeroBanner[];
  carousels: CarouselBlock[];
  promoTiles: HomepageTileBlock[];
  storyTiles: HomepageTileBlock[];
  categoryTiles: HomepageTileBlock[];
  updatedAt?: string;
  translations?: Translations<HomepageTranslatable>;
}

/** Homepage overlay: every block and carousel item has a stable `id`, so overlays are keyed by id. */
export type HomepageTileTranslatable = Partial<Pick<HomepageTileBlock, 'title' | 'cta'>>;

export interface CarouselItemTranslatable {
  title?: string;
  description?: string;
  /** e.g. "Save $100" */
  badge?: string;
  /** CTA label of promo items */
  ctaText?: string;
  imageAlt?: string;
}

export interface HomepageTranslatable {
  /** heroBanner.id → text. `disclaimer` is the legal copy. */
  heroBanners?: Record<string, Partial<Pick<HeroBanner, 'title' | 'subtitle' | 'disclaimer'>>>;
  /** carousel.id → text + items keyed by item.id */
  carousels?: Record<
    string,
    { title?: string; subtitle?: string; items?: Record<string, CarouselItemTranslatable> }
  >;
  promoTiles?: Record<string, HomepageTileTranslatable>;
  storyTiles?: Record<string, HomepageTileTranslatable>;
  categoryTiles?: Record<string, HomepageTileTranslatable>;
}

export interface ImageDimensionSpec {
  label: string;
  recommendedWidth: number;
  recommendedHeight: number;
  aspectRatio: string;
  maxSizeBytes: number;
  maxSizeFormatted: string;
  supportedFormats: string[];
  description: string;
}

