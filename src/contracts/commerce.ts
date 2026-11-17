// Browser-safe wire contracts. Runtime validation belongs to the owning service.
export type Locale = "kk" | "ru" | "en";
export type DisplayCurrency = "KZT" | "USD";

export interface Money {
  amountMinor: string;
  currency: "KZT";
}

export interface ExchangeRateSnapshotDTO {
  id: string;
  version: number;
  kztPerUsd: string;
  updatedAt: string;
}

export interface UsdEquivalentDTO {
  amountMinor: string;
  currency: "USD";
  exchangeRate: ExchangeRateSnapshotDTO;
}

export interface PriceDTO {
  selling: Money;
  compareAt: Money | null;
  usdEquivalent: UsdEquivalentDTO | null;
}

export type Availability = "available" | "out_of_stock" | "unavailable";

export interface MediaDTO {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface ProductCardDTO {
  id: string;
  publicKey: string;
  name: string;
  description: string;
  image: MediaDTO | null;
  badge: string | null;
  price: PriceDTO;
  availability: Availability;
  family?: string;
  activities?: string[];
  level?: "Entry" | "Advanced" | "Premium" | "Youth" | null;
  caseSize?: "Small" | "Medium" | "Large" | null;
  priceSuffix?: string;
  noIndex?: boolean;
  canonicalUrl?: string | null;
  updatedAt?: string;
}

export interface VariantDTO {
  id: string;
  sku: string;
  name: string;
  options: Readonly<Record<string, string>>;
  price: PriceDTO;
  availability: Availability;
  gallery?: MediaDTO[];
}

export interface ProductDetailDTO extends ProductCardDTO {
  variants: VariantDTO[];
  gallery: MediaDTO[];
  specs: { label: string; value: string }[];
  features: { title: string; body: string; image: MediaDTO | null }[];
  inTheBox: string[];
  compatibleProductKeys: string[];
  relatedProductKeys?: string[];
  selectedVariantId?: string;
  seo?: { title: string; description: string; canonicalUrl: string | null; noIndex: boolean; image: string | null };
}

export interface ProductQuery {
  market: string;
  locale: Locale;
  displayCurrency: DisplayCurrency;
  search?: string;
  category?: string;
  activities?: readonly string[];
  activitiesAll?: readonly string[];
  levels?: readonly ("Entry" | "Advanced" | "Premium" | "Youth")[];
  caseSizes?: readonly ("Small" | "Medium" | "Large")[];
  level?: "Entry" | "Advanced" | "Premium" | "Youth";
  caseSize?: "Small" | "Medium" | "Large";
  sort?: "name_asc" | "price_asc" | "price_desc" | "newest";
}

export interface DeliveryAddress {
  recipientName: string;
  phone: string;
  countryCode: string;
  city: string;
  line1: string;
  line2?: string;
  region?: string;
  postalCode?: string;
}

export interface SavedAddressDTO extends DeliveryAddress {
  id: string;
  label: string;
  isPrimary: boolean;
  version: number;
}

export type DeliveryAddressSelection =
  | { kind: "saved"; addressId: string; version: number }
  | { kind: "inline"; address: DeliveryAddress };

export interface QuickCheckoutContact {
  name: string;
  phone: string;
  email?: string;
}

export interface CompleteProfileCommand {
  name: string;
  email: string;
  phone: string;
  expectedVersion: number;
}

export interface CustomerProfileDTO {
  /** Null until the signed-in user first saves a customer profile (version 0). */
  id: string | null;
  name: string;
  email: string | null;
  /** False for a customer-typed contact email; an unverified email grants no ownership. */
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  profileState: "provisional" | "complete";
  version: number;
}

/** POST /api/cart/lines adds `quantity` to a line; identify it by variant or by product (its default variant). */
export interface CartAddCommand {
  variantId?: string;
  productKey?: string;
  quantity: number;
  expectedCartVersion: number;
}

/** PUT /api/cart/lines/{variantId} sets the quantity; 0 removes the line. */
export interface CartLineCommand {
  quantity: number;
  expectedCartVersion: number;
}

/** One-time import of the browser-stored cart: ids and quantities only, never names or prices. */
export interface CartImportCommand {
  items: { id: string; quantity: number }[];
}

export interface CartLineDTO {
  variantId: string;
  productKey: string;
  name: string;
  variantName: string;
  image: string | null;
  quantity: number;
  /** Null when the variant is no longer sold; such a line is excluded from the subtotal. */
  unitPrice: Money | null;
  /** The price the shopper last saw, when it differs from the current one. */
  previousUnitPrice: Money | null;
  lineTotal: Money | null;
  availability: Availability;
}

export type CartNoticeCode = "price_changed" | "quantity_adjusted" | "item_unavailable";

export interface CartDTO {
  /** Null until the first line is added. */
  id: string | null;
  version: number;
  owner: "guest" | "account";
  lines: CartLineDTO[];
  /** Sum of the available lines only. Display value; the checkout quote is authoritative. */
  subtotal: Money;
  expiresAt: string | null;
  /** True when a signed-in shopper still holds a guest cart that can be merged. */
  pendingMerge: boolean;
  notices: { code: CartNoticeCode; variantId: string }[];
}

export interface QuoteCommand {
  cartVersion: number;
  delivery: DeliveryAddressSelection;
  displayCurrency: DisplayCurrency;
  couponCode?: string;
  /** Payment is always in KZT; any other value is rejected. */
  paymentCurrency?: "KZT";
}

export interface QuoteLineDTO {
  variantId: string;
  quantity: number;
  /** The active catalog price before admin markdowns. */
  baseUnitPrice: Money;
  /** The selling unit price after admin markdowns. */
  unitPrice: Money;
  /** This line's share of the coupon discount. */
  discount: Money;
  /** Exclusive tax added to this line. */
  tax: Money;
  /** Tax already included in the price (inclusive tax policy); informational. */
  includedTax: Money;
  total: Money;
}

export interface CheckoutQuoteDTO {
  id: string;
  cartId: string;
  cartVersion: number;
  payableCurrency: "KZT";
  /** "USD" only when a USD equivalent is shown; amounts are always KZT. */
  displayCurrency: DisplayCurrency;
  lines: QuoteLineDTO[];
  subtotal: Money;
  discount: Money;
  shipping: Money;
  tax: Money;
  includedTax: Money;
  total: Money;
  coupon: { code: string; discount: Money } | null;
  usdEquivalent: UsdEquivalentDTO | null;
  expiresAt: string;
  policyVersions: { pricing: string; tax: string; shipping: string; promotion: string | null; markdowns: string[]; exchangeRate: string | null };
}

export type PaymentMethodCode = "demo" | "kaspi" | "secondary";

export interface CheckoutCommand {
  quoteId: string;
  cartVersion: number;
  contact: QuickCheckoutContact;
  delivery: DeliveryAddressSelection;
  paymentMethod: PaymentMethodCode;
}

export type OrderStatus = "pending_payment" | "confirmed" | "cancel_requested" | "cancelled" | "closed";
export type PaymentStatus = "unpaid" | "pending" | "authorized" | "paid" | "partially_refunded" | "refunded" | "failed";
export type FulfillmentStatus = "unfulfilled" | "processing" | "partially_shipped" | "shipped" | "delivered" | "exception";

export interface CheckoutResultDTO {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMode: "demo" | "live";
  paymentState: "pending" | "redirect_required" | "retry_required" | "simulated";
  paymentRedirectUrl: string | null;
}

export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  total: Money;
  itemsCount: number;
}

export interface OrderItemDTO {
  id: string;
  productKey: string | null;
  sku: string | null;
  name: string;
  options: Readonly<Record<string, string>>;
  quantity: number;
  unitPrice: Money;
  discount: Money;
  tax: Money;
  total: Money;
}

export interface OrderDetailDTO extends OrderSummaryDTO {
  version: number;
  contact: { name: string; phone: string | null; email: string | null };
  deliveryAddress: { kind: "structured"; address: DeliveryAddress } | { kind: "legacy_unstructured"; raw: string } | null;
  dataQuality: "complete" | "legacy_incomplete";
  items: OrderItemDTO[];
  // Null only for legacy_incomplete history: missing values are never invented.
  subtotal: Money | null;
  discount: Money | null;
  shipping: Money | null;
  tax: Money | null;
  events: { id: string; type: string; occurredAt: string; label: string }[];
  originalUsdEquivalent: UsdEquivalentDTO | null;
}

export interface OrderTransitionCommand {
  orderId: string;
  expectedVersion: number;
  action: "start_processing" | "request_cancellation" | "cancel" | "close";
  reason: string;
}

export interface WishlistItemDTO {
  productKey: string;
  name: string;
  image: string | null;
  /** Lowest active KZT price; null when the product is archived or not sold. */
  price: Money | null;
  availability: Availability;
  archived: boolean;
  addedAt: string;
}

export type ApiErrorCode =
  | "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND"
  | "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "OUT_OF_STOCK" | "ADDRESS_LIMIT_REACHED"
  | "QUOTE_EXPIRED" | "QUOTE_CHANGED" | "RATE_UNAVAILABLE"
  | "METHOD_UNAVAILABLE" | "RATE_LIMITED" | "DEPENDENCY_UNAVAILABLE" | "INTERNAL_ERROR";

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    fieldErrors?: Readonly<Record<string, readonly string[]>>;
    requestId: string;
  };
}
