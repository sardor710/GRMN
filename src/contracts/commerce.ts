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
  /** Option key → display name (e.g. "case-size" → "Case Size"); variant `options` stay keyed by key. */
  optionNames?: Record<string, string>;
  /** garmin.com-style overview (sanitized HTML) and grouped specifications from the product editor. */
  overviewHtml?: string;
  specGroups?: { title: string; items: { label: string; value: string }[] }[];
  /** Task 24: languages with a translated name and description (en always); others are noindex. */
  translatedLocales?: Locale[];
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
  /** The checkout methods offered now: ["demo"] while demo checkout is on, otherwise ["manual"]. */
  paymentMethods: ("demo" | "manual")[];
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

/** "manual" (O07): staff confirm the payment by hand. "demo" is for tests and development only. */
export type PaymentMethodCode = "demo" | "manual" | "kaspi" | "secondary";

/**
 * POST /api/cart/checkout with an `Idempotency-Key` header (16–128 printable ASCII). The contact
 * name and phone and the delivery address come from the quote's delivery snapshot (D06); only an
 * optional email is added here. Real checkout uses "manual" (O07); "demo" is refused in production,
 * and "kaspi"/"secondary" stay 409 until a real provider exists (D03).
 */
export interface CheckoutCommand {
  quoteId: string;
  cartVersion: number;
  paymentMethod: PaymentMethodCode;
  contactEmail?: string;
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
  /** Payable amount in KZT. */
  total: Money;
  /** Guest checkouts only: the order-status capability. Only its hash is stored; a retried key returns it again. */
  statusToken: string | null;
  /** True when this key already placed the order and the original result is returned. */
  replayed: boolean;
}

/** POST /api/cart/checkout/status `{ orderId, statusToken? }`: the polling contract after checkout. */
export interface CheckoutStatusDTO {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  paymentMode: "demo" | "live";
  total: Money;
  placedAt: string | null;
  /** How the order is paid: the provider of its latest payment attempt. */
  paymentMethod: PaymentMethodCode | null;
  /** O07: the staff-edited payment instructions, while a manual-payment order awaits payment. */
  paymentInstructions: string | null;
  /** When the stock hold ends while the order awaits payment; after that the order expires. */
  payBy: string | null;
}

export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  /** Task 3.3: "demo" for a demo-checkout order (no money was charged), shown with a DEMO label. */
  paymentMode: "demo" | "live" | "legacy_unknown";
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
  /** Dispatched and delivered shipments (Task 16A). Carrier, tracking and staff notes are never included (D04). */
  shipments: OrderShipmentDTO[];
  originalUsdEquivalent: UsdEquivalentDTO | null;
}

export interface OrderShipmentDTO {
  id: string;
  status: "dispatched" | "delivered";
  dispatchedAt: string;
  deliveredAt: string | null;
  items: { orderItemId: string; quantity: number }[];
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

// Task 16A staff fulfillment DTOs (served only under /api/admin/orders).
export type FulfillmentBlock = "LEGACY_ORDER" | "ORDER_NOT_PAID" | "FULFILLMENT_EXCEPTION" | "ORDER_NOT_SHIPPABLE";
export interface ShipmentDTO {
  id: string;
  status: "draft" | "ready" | "dispatched" | "delivered" | "cancelled";
  version: number;
  /** Staff-only; null for readers without orders:fulfill. */
  carrier: string | null;
  /** Staff-only; null for readers without orders:fulfill (review I4). */
  trackingReference: string | null;
  /** Staff-only; null for readers without orders:fulfill. */
  internalNotes: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  items: { orderItemId: string; quantity: number }[];
}
export interface AdminOrderSummaryDTO {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  paymentMode: "demo" | "live" | "legacy_unknown";
  dataQuality: "complete" | "legacy_incomplete";
  total: Money;
  itemsCount: number;
  contactName: string;
}
export interface TimelineEventDTO {
  id: string;
  type: string;
  visibility: "internal" | "customer";
  source: string;
  occurredAt: string;
  actorUserId: string | null;
  shipmentId: string | null;
  /** Present only for readers with orders:fulfill. */
  internalNote?: string;
}
export interface AdminOrderDetailDTO extends AdminOrderSummaryDTO {
  version: number;
  legacy: boolean;
  fulfillable: { allowed: boolean; reason: FulfillmentBlock | null };
  contact: { name: string; phone: string | null; email: string | null };
  deliveryAddress: Record<string, string> | null;
  items: { id: string; name: string; sku: string | null; quantity: number; allocated: number; claimed: number; shipped: number; remaining: number }[];
  shipments: ShipmentDTO[];
  timeline: TimelineEventDTO[];
  /** Task 16B: refunds of this order (reserved, pending, unknown, succeeded, failed, cancelled). */
  refunds: RefundDTO[];
  /** Task 16B: returns of this order. */
  returns: ReturnDTO[];
  /** O07: how the order is paid and whether staff can confirm a manual payment now. */
  payment: {
    method: PaymentMethodCode | null;
    confirmable: boolean;
    confirmation: { method: string; reference: string; amountMinor: string; note: string | null; confirmedAt: string; actorUserId: string | null } | null;
  };
}
export interface ShipmentResultDTO {
  shipment: ShipmentDTO;
  order: { id: string; version: number; fulfillmentStatus: FulfillmentStatus };
  replayed: boolean;
}

// Task 16B after-sales DTOs (staff only, /api/admin/orders).
export interface RefundDTO {
  id: string;
  status: "reserved" | "pending" | "unknown" | "succeeded" | "failed" | "cancelled";
  amountMinor: string;
  reason: string | null;
  createdAt: string;
  items: { kind: "item" | "shipping" | "adjustment"; orderItemId: string | null; quantity: number | null; amountMinor: string }[];
  /** O07: a refund of a manual payment. Staff pay it out by hand and record the payout to complete it. */
  manual: boolean;
  /** O07: the payout reference staff recorded for a completed manual refund. */
  payoutReference: string | null;
}
export interface ReturnDTO {
  id: string;
  status: "requested" | "authorized" | "received" | "inspected" | "rejected" | "cancelled" | "closed";
  version: number;
  reason: string;
  createdAt: string;
  receivedAt: string | null;
  inspectedAt: string | null;
  items: { id: string; orderItemId: string; shipmentItemId: string; quantity: number; receivedQuantity: number; acceptedQuantity: number; restockedQuantity: number; decision: "undecided" | "restock" | "quarantine" | "dispose" }[];
}
export interface CancelResultDTO {
  order: { id: string; version: number; status: OrderStatus; paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus };
  /** The refund reserved for a captured order; null when nothing was captured. */
  refundId: string | null;
  replayed: boolean;
}
