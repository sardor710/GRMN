import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgSequence, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./identity.ts";
import { customerProfiles } from "./customers.ts";
import { products, productVariants } from "./catalog.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => time("created_at").notNull().defaultNow();
const updatedAt = () => time("updated_at").notNull().defaultNow().$onUpdate(() => new Date());
const money = (name: string) => bigint(name, { mode: "bigint" });
const object = (name: string) => jsonb(name).$type<Record<string, unknown>>();

export const carts = pgTable("carts", {
  id: id(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "restrict" }),
  guestTokenHash: text("guest_token_hash").unique(),
  market: text("market").notNull().default("default"), currency: text("currency").notNull().default("KZT"),
  status: text("status").notNull().default("active"), version: integer("version").notNull().default(1),
  lineEpoch: money("line_epoch").notNull().default(sql`0`),
  mergedIntoCartId: uuid("merged_into_cart_id").references((): AnyPgColumn => carts.id, { onDelete: "restrict" }),
  expiresAt: time("expires_at").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("carts_active_user_unique").on(t.userId, t.market, t.currency).where(sql`${t.status}='active' AND ${t.userId} IS NOT NULL`),
  index("carts_expiry_idx").on(t.expiresAt, t.id).where(sql`${t.status}='active'`),
  check("carts_actor_valid", sql`(${t.userId} IS NOT NULL AND ${t.guestTokenHash} IS NULL) OR (${t.userId} IS NULL AND ${t.guestTokenHash} ~ '^[0-9a-f]{64}$')`),
  check("carts_actor_present", sql`${t.userId} IS NOT NULL OR ${t.guestTokenHash} IS NOT NULL`),
  check("carts_fields_valid", sql`${t.currency}='KZT' AND length(btrim(${t.market}))>0 AND ${t.version}>0 AND ${t.lineEpoch}>=0 AND ${t.expiresAt}>${t.createdAt} AND ${t.status} IN ('active','converted','merged','expired')`),
  check("carts_merge_valid", sql`(${t.status}='merged' AND ${t.mergedIntoCartId} IS NOT NULL AND ${t.mergedIntoCartId}<>${t.id}) OR (${t.status}<>'merged' AND ${t.mergedIntoCartId} IS NULL)`),
]);

export const cartItems = pgTable("cart_items", {
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  // The KZT unit price the shopper last saw for this line (Task 13A price-change notices). Display only;
  // quotes and orders always re-read the active price.
  seenUnitPriceMinor: money("seen_unit_price_minor"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [primaryKey({ columns: [t.cartId, t.variantId] }), index("cart_items_variant_idx").on(t.variantId), check("cart_items_quantity_valid", sql`${t.quantity} BETWEEN 1 AND 99`), check("cart_items_seen_price_valid", sql`${t.seenUnitPriceMinor} IS NULL OR ${t.seenUnitPriceMinor}>=0`)]);

export const checkoutQuotes = pgTable("checkout_quotes", {
  id: id(), cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "restrict" }),
  cartVersion: integer("cart_version").notNull(), cartHash: text("cart_hash"),
  currency: text("currency").notNull().default("KZT"), displayCurrency: text("display_currency").notNull().default("KZT"),
  contactSnapshot: object("contact_snapshot").notNull().default({}), deliverySnapshot: object("delivery_snapshot").notNull().default({}),
  linesSnapshot: jsonb("lines_snapshot").$type<Record<string, unknown>[]>().notNull().default([]),
  policyVersions: object("policy_versions").notNull().default({}), usdSnapshot: object("usd_snapshot"),
  subtotalMinor: money("subtotal_minor").notNull(), discountMinor: money("discount_minor").notNull(),
  shippingMinor: money("shipping_minor").notNull(), taxMinor: money("tax_minor").notNull(), totalMinor: money("total_minor").notNull(),
  expiresAt: time("expires_at").notNull(), createdAt: createdAt(),
}, t => [
  unique("checkout_quotes_revision_unique").on(t.id, t.cartId, t.cartVersion),
  index("checkout_quotes_cart_idx").on(t.cartId, t.cartVersion), index("checkout_quotes_expiry_idx").on(t.expiresAt, t.id),
  check("checkout_quotes_amounts_valid", sql`${t.subtotalMinor}>=0 AND ${t.discountMinor} BETWEEN 0 AND ${t.subtotalMinor} AND ${t.shippingMinor}>=0 AND ${t.taxMinor}>=0 AND ${t.totalMinor}=${t.subtotalMinor}-${t.discountMinor}+${t.shippingMinor}+${t.taxMinor}`),
  check("checkout_quotes_fields_valid", sql`${t.currency}='KZT' AND ${t.displayCurrency} IN ('KZT','USD') AND ${t.cartVersion}>0 AND ${t.expiresAt}>${t.createdAt} AND (${t.cartHash} IS NULL OR ${t.cartHash} ~ '^[0-9a-f]{64}$')`),
  check("checkout_quotes_json_valid", sql`jsonb_typeof(${t.contactSnapshot})='object' AND jsonb_typeof(${t.deliverySnapshot})='object' AND jsonb_typeof(${t.linesSnapshot})='array' AND jsonb_typeof(${t.policyVersions})='object' AND (${t.usdSnapshot} IS NULL OR jsonb_typeof(${t.usdSnapshot})='object')`),
]);

export const checkoutAttempts = pgTable("checkout_attempts", {
  id: id(), cartId: uuid("cart_id").notNull(), cartVersion: integer("cart_version").notNull(), quoteId: uuid("quote_id").notNull(),
  actorScope: text("actor_scope").notNull(), operation: text("operation").notNull().default("checkout"),
  idempotencyKey: text("idempotency_key").notNull(), requestHash: text("request_hash").notNull(),
  status: text("status").notNull().default("pending"),
  // Hold-abuse limit (2026-11-18): a keyed hash of the trusted client address, never the address itself.
  clientAddressHash: text("client_address_hash"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  index("checkout_attempts_client_address_idx").on(t.clientAddressHash, t.createdAt).where(sql`${t.clientAddressHash} IS NOT NULL`),
  check("checkout_attempts_client_address_valid", sql`${t.clientAddressHash} IS NULL OR ${t.clientAddressHash} ~ '^[0-9a-f]{64}$'`),
  foreignKey({ columns: [t.quoteId, t.cartId, t.cartVersion], foreignColumns: [checkoutQuotes.id, checkoutQuotes.cartId, checkoutQuotes.cartVersion] }).onDelete("restrict"),
  uniqueIndex("checkout_attempts_key_unique").on(t.actorScope, t.operation, t.idempotencyKey),
  uniqueIndex("checkout_attempts_revision_winner_unique").on(t.cartId, t.cartVersion).where(sql`${t.status}<>'failed'`),
  check("checkout_attempts_fields_valid", sql`${t.cartVersion}>0 AND length(btrim(${t.actorScope}))>0 AND ${t.operation}='checkout' AND ${t.idempotencyKey} ~ '^[ -~]{16,128}$' AND ${t.requestHash} ~ '^[0-9a-f]{64}$' AND ${t.status} IN ('pending','committed','failed')`),
]);

export const orderNumberSequence = pgSequence("order_number_sequence", { startWith: "1000001" });

export const orders = pgTable("orders", {
  id: id(), orderNumber: text("order_number").notNull().default(sql`'GRM-' || nextval('order_number_sequence')::text`).unique(),
  checkoutAttemptId: uuid("checkout_attempt_id").unique().references(() => checkoutAttempts.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => user.id, { onDelete: "restrict" }),
  profileId: uuid("profile_id").references(() => customerProfiles.id, { onDelete: "restrict" }),
  contactName: text("contact_name").notNull(), contactPhone: text("contact_phone"), contactEmail: text("contact_email"),
  dataQuality: text("data_quality").notNull().default("complete"), currency: text("currency").notNull().default("KZT"),
  subtotalMinor: money("subtotal_minor"), discountMinor: money("discount_minor"), shippingMinor: money("shipping_minor"), taxMinor: money("tax_minor"),
  shippingTaxMinor: money("shipping_tax_minor"), totalMinor: money("total_minor").notNull(),
  usdSnapshot: object("usd_snapshot"), policyVersions: object("policy_versions").notNull().default({}),
  legacySummary: object("legacy_summary").notNull().default({}),
  orderStatus: text("order_status").notNull().default("pending_payment"), paymentStatus: text("payment_status").notNull().default("unpaid"),
  fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"), paymentMode: text("payment_mode").notNull(),
  /** 0033 (owner 2026-11-26): delivery to an address or pickup at the store; pickupSnapshot = the store at order time. */
  fulfillmentMethod: text("fulfillment_method").notNull().default("delivery"), pickupSnapshot: jsonb("pickup_snapshot").$type<Record<string, unknown>>(),
  snapshotSealed: boolean("snapshot_sealed").notNull().default(false),
  version: integer("version").notNull().default(1), placedAt: time("placed_at"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  unique("orders_attempt_identity_unique").on(t.id, t.checkoutAttemptId),
  index("orders_customer_history_idx").on(t.userId, t.placedAt.desc(), t.id.desc()),
  // Task 23 G6: the unpaid-order expiry sweep pages (placed_at, id) over orders still awaiting payment
  // (21B: 3.6 s per run at 1M orders without it).
  index("orders_awaiting_payment_idx").on(t.placedAt, t.id).where(sql`${t.orderStatus}='pending_payment' AND ${t.checkoutAttemptId} IS NOT NULL AND ${t.placedAt} IS NOT NULL`),
  index("orders_profile_idx").on(t.profileId),
  index("orders_fulfillment_queue_idx").on(t.fulfillmentStatus, t.placedAt, t.id),
  index("orders_payment_queue_idx").on(t.paymentStatus, t.placedAt, t.id),
  // Task 21A: the staff order queue and dated exports sort or filter on the shown time (EXPLAIN: seq scan + sort over all orders without it).
  index("orders_shown_at_idx").on(sql`(COALESCE(${t.placedAt},${t.createdAt})) DESC`, t.id.desc().nullsFirst()),
  check("orders_fulfillment_method_valid", sql`${t.fulfillmentMethod} IN ('delivery','pickup') AND (${t.fulfillmentMethod}='delivery' OR ${t.pickupSnapshot} IS NOT NULL)`),
  check("orders_fields_valid", sql`length(btrim(${t.orderNumber}))>0 AND length(btrim(${t.contactName}))>0 AND ${t.currency}='KZT' AND ${t.dataQuality} IN ('complete','legacy_incomplete') AND ${t.version}>0`),
  check("orders_statuses_valid", sql`${t.orderStatus} IN ('pending_payment','confirmed','cancel_requested','cancelled','closed') AND ${t.paymentStatus} IN ('unpaid','pending','authorized','paid','partially_refunded','refunded','failed') AND ${t.fulfillmentStatus} IN ('unfulfilled','processing','partially_shipped','shipped','delivered','exception') AND ${t.paymentMode} IN ('demo','live','sandbox','legacy_unknown')`),
  check("orders_amounts_valid", sql`${t.totalMinor}>=0 AND (${t.subtotalMinor} IS NULL OR ${t.subtotalMinor}>=0) AND (${t.discountMinor} IS NULL OR ${t.discountMinor}>=0) AND (${t.shippingMinor} IS NULL OR ${t.shippingMinor}>=0) AND (${t.taxMinor} IS NULL OR ${t.taxMinor}>=0) AND (${t.shippingTaxMinor} IS NULL OR ${t.shippingTaxMinor} BETWEEN 0 AND ${t.taxMinor}) AND (${t.subtotalMinor} IS NULL OR ${t.discountMinor} IS NULL OR ${t.discountMinor}<=${t.subtotalMinor})`),
  check("orders_complete_fields", sql`${t.dataQuality}<>'complete' OR (${t.contactPhone} IS NOT NULL AND length(btrim(${t.contactPhone}))>0 AND ${t.placedAt} IS NOT NULL AND ${t.subtotalMinor} IS NOT NULL AND ${t.discountMinor} IS NOT NULL AND ${t.shippingMinor} IS NOT NULL AND ${t.taxMinor} IS NOT NULL AND ${t.totalMinor}=${t.subtotalMinor}-${t.discountMinor}+${t.shippingMinor}+${t.taxMinor})`),
  check("orders_json_valid", sql`jsonb_typeof(${t.policyVersions})='object' AND jsonb_typeof(${t.legacySummary})='object' AND (${t.usdSnapshot} IS NULL OR jsonb_typeof(${t.usdSnapshot})='object')`),
]);

export const orderAddresses = pgTable("order_addresses", {
  id: id(), orderId: uuid("order_id").notNull().unique().references(() => orders.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(), recipientName: text("recipient_name"), phone: text("phone"),
  countryCode: text("country_code"), city: text("city"), line1: text("line1"), line2: text("line2"), region: text("region"), postalCode: text("postal_code"),
  legacyRaw: text("legacy_raw"),
}, t => [check("order_addresses_shape_valid", sql`(${t.kind}='structured' AND ${t.recipientName} IS NOT NULL AND length(btrim(${t.recipientName}))>0 AND ${t.phone} IS NOT NULL AND length(btrim(${t.phone}))>0 AND ${t.countryCode} IS NOT NULL AND ${t.countryCode} ~ '^[A-Z]{2}$' AND ${t.city} IS NOT NULL AND length(btrim(${t.city}))>0 AND ${t.line1} IS NOT NULL AND length(btrim(${t.line1}))>0 AND ${t.legacyRaw} IS NULL) OR (${t.kind}='legacy_unstructured' AND ${t.legacyRaw} IS NOT NULL AND length(btrim(${t.legacyRaw}))>0 AND ${t.recipientName} IS NULL AND ${t.phone} IS NULL AND ${t.countryCode} IS NULL AND ${t.city} IS NULL AND ${t.line1} IS NULL AND ${t.line2} IS NULL AND ${t.region} IS NULL AND ${t.postalCode} IS NULL)`)]);

export const orderItems = pgTable("order_items", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }), variantId: uuid("variant_id"),
  productKey: text("product_key"), sku: text("sku"), name: text("name").notNull(),
  options: object("options").notNull().default({}), legacySource: object("legacy_source").notNull().default({}),
  quantity: integer("quantity").notNull(), unitPriceMinor: money("unit_price_minor").notNull(),
  discountMinor: money("discount_minor").notNull(), taxMinor: money("tax_minor").notNull(), totalMinor: money("total_minor").notNull(),
}, t => [
  unique("order_items_identity_variant_unique").on(t.id, t.variantId),
  unique("order_items_identity_order_unique").on(t.id, t.orderId),
  foreignKey({ columns: [t.variantId, t.productId], foreignColumns: [productVariants.id, productVariants.productId] }).onDelete("restrict"),
  index("order_items_order_idx").on(t.orderId, t.id), index("order_items_catalog_idx").on(t.productId, t.variantId), index("order_items_variant_idx").on(t.variantId),
  check("order_items_fields_valid", sql`${t.quantity}>0 AND length(btrim(${t.name}))>0 AND (${t.variantId} IS NULL OR ${t.productId} IS NOT NULL) AND jsonb_typeof(${t.options})='object' AND jsonb_typeof(${t.legacySource})='object'`),
  check("order_items_amounts_valid", sql`${t.unitPriceMinor}>=0 AND ${t.discountMinor} BETWEEN 0 AND ${t.unitPriceMinor}::numeric*${t.quantity} AND ${t.taxMinor}>=0 AND ${t.totalMinor}::numeric=${t.unitPriceMinor}::numeric*${t.quantity}-${t.discountMinor}+${t.taxMinor}`),
]);

export const orderAdjustments = pgTable("order_adjustments", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }), orderItemId: uuid("order_item_id"),
  kind: text("kind").notNull(), code: text("code"), label: text("label").notNull(),
  amountMinor: money("amount_minor").notNull(), sourceSnapshot: object("source_snapshot").notNull().default({}),
}, t => [
  foreignKey({ columns: [t.orderItemId, t.orderId], foreignColumns: [orderItems.id, orderItems.orderId] }).onDelete("restrict"),
  index("order_adjustments_order_idx").on(t.orderId), index("order_adjustments_item_idx").on(t.orderItemId),
  check("order_adjustments_valid", sql`${t.kind} IN ('discount','tax','shipping') AND ${t.amountMinor}>=0 AND length(btrim(${t.label}))>0 AND jsonb_typeof(${t.sourceSnapshot})='object'`),
]);

export const orderEvents = pgTable("order_events", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  type: text("type").notNull(), source: text("source").notNull(), actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  dedupeKey: text("dedupe_key").notNull().unique(), visibility: text("visibility").notNull().default("internal"),
  occurredAt: time("occurred_at"), recordedAt: time("recorded_at").notNull().defaultNow(), payload: object("payload").notNull().default({}),
}, t => [index("order_events_history_idx").on(t.orderId, t.recordedAt, t.id), index("order_events_actor_idx").on(t.actorUserId), check("order_events_valid", sql`length(btrim(${t.type}))>0 AND length(btrim(${t.source}))>0 AND length(btrim(${t.dedupeKey}))>0 AND ${t.visibility} IN ('internal','customer') AND jsonb_typeof(${t.payload})='object'`)]);

export const orderAccessTokens = pgTable("order_access_tokens", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique(), scope: text("scope").notNull().default("order_status"),
  expiresAt: time("expires_at").notNull(), revokedAt: time("revoked_at"), createdAt: createdAt(),
}, t => [index("order_access_tokens_order_idx").on(t.orderId), index("order_access_tokens_expiry_idx").on(t.expiresAt), check("order_access_tokens_valid", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$' AND ${t.scope} IN ('order_status','order_receipt') AND ${t.expiresAt}>${t.createdAt} AND (${t.revokedAt} IS NULL OR ${t.revokedAt}>=${t.createdAt})`)]);

// Task 10B: a staff-approved, single-use receipt that lets the verified owner of the approved
// phone claim one unowned (legacy/provisional) order. Only the SHA-256 of the receipt is stored.
export const orderClaimApprovals = pgTable("order_claim_approvals", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique(), phoneNumber: text("phone_number").notNull(),
  approvedBy: uuid("approved_by").notNull().references(() => user.id, { onDelete: "restrict" }), reason: text("reason").notNull(),
  expiresAt: time("expires_at").notNull(), revokedAt: time("revoked_at"),
  consumedAt: time("consumed_at"), consumedBy: uuid("consumed_by").references(() => user.id, { onDelete: "restrict" }), createdAt: createdAt(),
}, t => [
  uniqueIndex("order_claim_approvals_open_unique").on(t.orderId).where(sql`${t.consumedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  check("order_claim_approvals_valid", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$' AND ${t.phoneNumber} ~ '^[+][1-9][0-9]{7,14}$' AND length(btrim(${t.reason})) BETWEEN 1 AND 500 AND ${t.expiresAt}>${t.createdAt} AND (${t.consumedAt} IS NULL) = (${t.consumedBy} IS NULL) AND (${t.consumedAt} IS NULL OR ${t.revokedAt} IS NULL)`),
]);