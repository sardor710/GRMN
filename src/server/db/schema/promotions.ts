import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { categories, productVariants } from "./catalog.ts";
import { checkoutAttempts, orders } from "./commerce.ts";
import { user } from "./identity.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "bigint" });

export const promotions = pgTable("promotions", {
  id: id(), code: text("code").notNull().unique(), legacyCode: text("legacy_code"), name: text("name").notNull(),
  kind: text("kind").notNull(), fixedMinor: money("fixed_minor"), percentageBps: integer("percentage_bps"), currency: text("currency").notNull().default("KZT"),
  minimumSpendMinor: money("minimum_spend_minor").notNull().default(sql`0`), scope: text("scope").notNull().default("all"),
  status: text("status").notNull().default("draft"), stackable: boolean("stackable").notNull().default(false),
  startsAt: time("starts_at"), endsAt: time("ends_at"), usageLimit: integer("usage_limit"), perCustomerLimit: integer("per_customer_limit"),
  legacyUsedCount: integer("legacy_used_count").notNull().default(0), usageEpoch: money("usage_epoch").notNull().default(sql`0`),
  version: integer("version").notNull().default(1), createdAt: time("created_at").notNull().defaultNow(),
}, t => [
  index("promotions_schedule_idx").on(t.status, t.startsAt, t.endsAt),
  check("promotions_fields_valid", sql`length(btrim(${t.code}))>0 AND ${t.code}=lower(btrim(${t.code})) AND length(btrim(${t.name}))>0 AND ${t.currency}='KZT' AND ${t.minimumSpendMinor}>=0 AND ${t.status} IN ('draft','active','archived') AND ${t.scope} IN ('all','categories','variants') AND ${t.version}>0 AND ${t.usageEpoch}>=0`),
  check("promotions_value_valid", sql`(${t.kind}='fixed' AND ${t.fixedMinor} IS NOT NULL AND ${t.fixedMinor}>0 AND ${t.percentageBps} IS NULL) OR (${t.kind}='percentage' AND ${t.percentageBps} IS NOT NULL AND ${t.percentageBps} BETWEEN 1 AND 10000 AND ${t.fixedMinor} IS NULL)`),
  check("promotions_limits_valid", sql`${t.legacyUsedCount}>=0 AND (${t.usageLimit} IS NULL OR ${t.usageLimit}>0) AND (${t.perCustomerLimit} IS NULL OR ${t.perCustomerLimit}>0) AND (${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt}>${t.startsAt})`),
]);

export const promotionCategories = pgTable("promotion_categories", {
  promotionId: uuid("promotion_id").notNull().references(() => promotions.id, { onDelete: "restrict" }), categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
}, t => [primaryKey({ columns: [t.promotionId, t.categoryId] }), index("promotion_categories_category_idx").on(t.categoryId)]);
export const promotionVariants = pgTable("promotion_variants", {
  promotionId: uuid("promotion_id").notNull().references(() => promotions.id, { onDelete: "restrict" }), variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
}, t => [primaryKey({ columns: [t.promotionId, t.variantId] }), index("promotion_variants_variant_idx").on(t.variantId)]);

export const promotionRedemptions = pgTable("promotion_redemptions", {
  id: id(), promotionId: uuid("promotion_id").notNull().references(() => promotions.id, { onDelete: "restrict" }),
  checkoutAttemptId: uuid("checkout_attempt_id").notNull().references(() => checkoutAttempts.id, { onDelete: "restrict" }), orderId: uuid("order_id"),
  userId: uuid("user_id").references(() => user.id, { onDelete: "restrict" }), subjectHash: text("subject_hash"),
  amountMinor: money("amount_minor").notNull(), currency: text("currency").notNull().default("KZT"), status: text("status").notNull().default("reserved"),
  expiresAt: time("expires_at").notNull(), endedAt: time("ended_at"), createdAt: time("created_at").notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.orderId, t.checkoutAttemptId], foreignColumns: [orders.id, orders.checkoutAttemptId] }).onDelete("restrict"),
  uniqueIndex("promotion_redemptions_checkout_unique").on(t.promotionId, t.checkoutAttemptId),
  index("promotion_redemptions_subject_idx").on(t.promotionId, t.userId, t.subjectHash, t.status), index("promotion_redemptions_order_idx").on(t.orderId), index("promotion_redemptions_checkout_idx").on(t.checkoutAttemptId),
  index("promotion_redemptions_expiry_idx").on(t.expiresAt, t.id).where(sql`${t.status}='reserved'`),
  check("promotion_redemptions_fields_valid", sql`${t.amountMinor}>=0 AND ${t.currency}='KZT' AND (${t.subjectHash} IS NULL OR ${t.subjectHash} ~ '^[0-9a-f]{64}$') AND NOT (${t.userId} IS NOT NULL AND ${t.subjectHash} IS NOT NULL) AND ${t.expiresAt}>${t.createdAt}`),
  check("promotion_redemptions_state_valid", sql`(${t.status}='reserved' AND ${t.endedAt} IS NULL) OR (${t.status} IN ('used','released','expired') AND ${t.endedAt} IS NOT NULL AND ${t.endedAt}>=${t.createdAt})`),
]);

export const priceAdjustmentRules = pgTable("price_adjustment_rules", {
  id: id(), name: text("name").notNull(), kind: text("kind").notNull(), fixedMinor: money("fixed_minor"), percentageBps: integer("percentage_bps"),
  currency: text("currency").notNull().default("KZT"), scope: text("scope").notNull().default("all"), status: text("status").notNull().default("draft"),
  stackable: boolean("stackable").notNull().default(false), startsAt: time("starts_at"), endsAt: time("ends_at"),
  version: integer("version").notNull().default(1), createdAt: time("created_at").notNull().defaultNow(),
}, t => [
  index("price_adjustment_rules_schedule_idx").on(t.status, t.startsAt, t.endsAt),
  check("price_adjustment_rules_fields_valid", sql`length(btrim(${t.name}))>0 AND ${t.currency}='KZT' AND ${t.scope} IN ('all','categories','variants') AND ${t.status} IN ('draft','active','archived') AND ${t.version}>0 AND (${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt}>${t.startsAt})`),
  check("price_adjustment_rules_value_valid", sql`(${t.kind}='fixed' AND ${t.fixedMinor} IS NOT NULL AND ${t.fixedMinor}>0 AND ${t.percentageBps} IS NULL) OR (${t.kind}='percentage' AND ${t.percentageBps} IS NOT NULL AND ${t.percentageBps} BETWEEN 1 AND 10000 AND ${t.fixedMinor} IS NULL)`),
]);
export const priceAdjustmentCategories = pgTable("price_adjustment_categories", {
  ruleId: uuid("rule_id").notNull().references(() => priceAdjustmentRules.id, { onDelete: "restrict" }), categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
}, t => [primaryKey({ columns: [t.ruleId, t.categoryId] }), index("price_adjustment_categories_category_idx").on(t.categoryId)]);
export const priceAdjustmentVariants = pgTable("price_adjustment_variants", {
  ruleId: uuid("rule_id").notNull().references(() => priceAdjustmentRules.id, { onDelete: "restrict" }), variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
}, t => [primaryKey({ columns: [t.ruleId, t.variantId] }), index("price_adjustment_variants_variant_idx").on(t.variantId)]);
