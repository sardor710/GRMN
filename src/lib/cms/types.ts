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
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  status: ClientStatus;
  totalSpent: number;
  ordersCount: number;
  avatar?: string;
  notes?: string;
  createdAt: string;
}

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

export interface CMSProduct {
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
  // SEO Metadata
  seoTitle?: string;
  seoDescription?: string;
  focusKeywords?: string[];
  canonicalUrl?: string;
  noIndex?: boolean;
  ogImage?: string;
  createdAt: string;
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
}

export type BlogStatus = 'published' | 'draft';

export interface CMSBlog {
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
}

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
export type FulfillmentStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  total: number;
  itemsCount: number;
  items: OrderItem[];
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  shippingAddress: string;
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
}

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
}
