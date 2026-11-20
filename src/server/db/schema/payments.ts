import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orders, orderItems } from "./commerce.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "bigint" });
const createdAt = () => time("created_at").notNull().defaultNow();

// Owner decision O07 (Task 21C): provider 'manual' is real money confirmed by staff. It always runs in
// the live environment under the fixed account 'manual'.
export const paymentAttempts = pgTable("payment_attempts", {
  id: id(), orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  provider: text("provider").notNull(), environment: text("environment").notNull(), merchantAccount: text("merchant_account").notNull(),
  merchantReference: text("merchant_reference").notNull(), providerSessionId: text("provider_session_id"),
  idempotencyKey: text("idempotency_key").notNull(), requestHash: text("request_hash").notNull(),
  currency: text("currency").notNull().default("KZT"), amountMinor: money("amount_minor").notNull(),
  status: text("status").notNull().default("created"), version: integer("version").notNull().default(1),
  createdAt: createdAt(), updatedAt: time("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [
  unique("payment_attempts_identity_order_unique").on(t.id, t.orderId),
  uniqueIndex("payment_attempts_payable_unique").on(t.orderId).where(sql`${t.status} IN ('created','pending','requires_action','authorized','unknown')`),
  uniqueIndex("payment_attempts_session_unique").on(t.provider, t.environment, t.merchantAccount, t.providerSessionId).where(sql`${t.providerSessionId} IS NOT NULL`),
  uniqueIndex("payment_attempts_reference_unique").on(t.provider, t.environment, t.merchantAccount, t.merchantReference),
  uniqueIndex("payment_attempts_key_unique").on(t.provider, t.environment, t.merchantAccount, t.idempotencyKey),
  index("payment_attempts_order_idx").on(t.orderId, t.createdAt),
  check("payment_attempts_context_valid", sql`((${t.provider}='demo' AND ${t.environment}='demo') OR (${t.provider} IN ('kaspi','secondary') AND ${t.environment} IN ('sandbox','live')) OR (${t.provider}='manual' AND ${t.environment}='live' AND ${t.merchantAccount}='manual')) AND length(btrim(${t.merchantAccount}))>0 AND length(btrim(${t.merchantReference}))>0 AND (${t.providerSessionId} IS NULL OR length(btrim(${t.providerSessionId}))>0)`),
  check("payment_attempts_fields_valid", sql`${t.currency}='KZT' AND ${t.amountMinor}>=0 AND ${t.version}>0 AND ${t.requestHash} ~ '^[0-9a-f]{64}$' AND ${t.idempotencyKey} ~ '^[ -~]{16,128}$' AND ${t.status} IN ('created','pending','requires_action','authorized','unknown','captured','failed','voided','cancelled','superseded','simulated','late_captured')`),
]);

export const paymentTransactions = pgTable("payment_transactions", {
  id: id(), attemptId: uuid("attempt_id").notNull(), orderId: uuid("order_id").notNull(),
  provider: text("provider").notNull(), environment: text("environment").notNull(), merchantAccount: text("merchant_account").notNull(),
  externalId: text("external_id").notNull(), kind: text("kind").notNull(), currency: text("currency").notNull().default("KZT"),
  amountMinor: money("amount_minor").notNull(), dedupeKey: text("dedupe_key").notNull().unique(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  refundEpoch: money("refund_epoch").notNull().default(sql`0`), occurredAt: time("occurred_at"), createdAt: createdAt(),
}, t => [
  foreignKey({ columns: [t.attemptId, t.orderId], foreignColumns: [paymentAttempts.id, paymentAttempts.orderId] }).onDelete("restrict"),
  unique("payment_transactions_identity_order_unique").on(t.id, t.orderId),
  uniqueIndex("payment_transactions_external_unique").on(t.provider, t.environment, t.merchantAccount, t.kind, t.externalId),
  index("payment_transactions_order_idx").on(t.orderId, t.createdAt), index("payment_transactions_attempt_idx").on(t.attemptId),
  // Task 21A: dashboard revenue windows read captures by time (EXPLAIN: seq scan over all transactions without it).
  index("payment_transactions_capture_time_idx").on(t.createdAt).where(sql`${t.kind}='capture'`),
  check("payment_transactions_fields_valid", sql`${t.currency}='KZT' AND ${t.amountMinor}>0 AND ((${t.provider} IN ('kaspi','secondary') AND ${t.environment} IN ('sandbox','live')) OR (${t.provider}='manual' AND ${t.environment}='live' AND ${t.merchantAccount}='manual') OR (${t.provider}='demo' AND ${t.environment}='demo' AND ${t.merchantAccount}='demo')) AND ${t.kind} IN ('authorization','capture','void') AND length(btrim(${t.externalId}))>0 AND length(btrim(${t.merchantAccount}))>0 AND length(btrim(${t.dedupeKey}))>0 AND jsonb_typeof(${t.evidence})='object' AND ${t.refundEpoch}>=0`),
]);

export const refunds = pgTable("refunds", {
  id: id(), transactionId: uuid("transaction_id").notNull(), orderId: uuid("order_id").notNull(),
  provider: text("provider").notNull(), environment: text("environment").notNull(), merchantAccount: text("merchant_account").notNull(),
  providerRefundId: text("provider_refund_id"), idempotencyKey: text("idempotency_key").notNull(), requestHash: text("request_hash").notNull(),
  amountMinor: money("amount_minor").notNull(), currency: text("currency").notNull().default("KZT"),
  status: text("status").notNull().default("reserved"), reason: text("reason"), version: integer("version").notNull().default(1),
  createdAt: createdAt(), updatedAt: time("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [
  foreignKey({ columns: [t.transactionId, t.orderId], foreignColumns: [paymentTransactions.id, paymentTransactions.orderId] }).onDelete("restrict"),
  unique("refunds_identity_order_unique").on(t.id, t.orderId),
  uniqueIndex("refunds_key_unique").on(t.orderId, t.idempotencyKey),
  uniqueIndex("refunds_provider_unique").on(t.provider, t.environment, t.merchantAccount, t.providerRefundId).where(sql`${t.providerRefundId} IS NOT NULL`),
  index("refunds_balance_idx").on(t.transactionId, t.status), index("refunds_order_idx").on(t.orderId),
  check("refunds_fields_valid", sql`${t.currency}='KZT' AND ${t.amountMinor}>0 AND ${t.version}>0 AND ((${t.provider} IN ('kaspi','secondary') AND ${t.environment} IN ('sandbox','live')) OR (${t.provider}='manual' AND ${t.environment}='live' AND ${t.merchantAccount}='manual') OR (${t.provider}='demo' AND ${t.environment}='demo' AND ${t.merchantAccount}='demo')) AND length(btrim(${t.merchantAccount}))>0 AND (${t.providerRefundId} IS NULL OR length(btrim(${t.providerRefundId}))>0) AND ${t.idempotencyKey} ~ '^[ -~]{16,128}$' AND ${t.requestHash} ~ '^[0-9a-f]{64}$' AND ${t.status} IN ('reserved','pending','unknown','succeeded','failed','cancelled')`),
]);

export const refundItems = pgTable("refund_items", {
  id: id(), refundId: uuid("refund_id").notNull(), orderId: uuid("order_id").notNull(), orderItemId: uuid("order_item_id"),
  kind: text("kind").notNull(), quantity: integer("quantity"), netMinor: money("net_minor").notNull(),
  discountMinor: money("discount_minor").notNull(), taxMinor: money("tax_minor").notNull(), amountMinor: money("amount_minor").notNull(),
}, t => [
  foreignKey({ columns: [t.refundId, t.orderId], foreignColumns: [refunds.id, refunds.orderId] }).onDelete("restrict"),
  foreignKey({ columns: [t.orderItemId, t.orderId], foreignColumns: [orderItems.id, orderItems.orderId] }).onDelete("restrict"),
  index("refund_items_refund_idx").on(t.refundId), index("refund_items_order_item_idx").on(t.orderItemId),
  check("refund_items_shape_valid", sql`(${t.kind}='item' AND ${t.orderItemId} IS NOT NULL AND ${t.quantity} IS NOT NULL AND ${t.quantity}>0) OR (${t.kind} IN ('shipping','adjustment') AND ${t.orderItemId} IS NULL AND ${t.quantity} IS NULL)`),
  check("refund_items_amounts_valid", sql`${t.netMinor}>=0 AND ${t.discountMinor} BETWEEN 0 AND ${t.netMinor} AND ${t.taxMinor}>=0 AND ${t.amountMinor}=${t.netMinor}-${t.discountMinor}+${t.taxMinor}`),
]);
