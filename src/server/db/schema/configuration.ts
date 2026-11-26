import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./identity.ts";
import { PICKUP_SEED } from "../../../lib/pickup.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "bigint" });
const object = (name: string) => jsonb(name).$type<Record<string, unknown>>();

export const exchangeRateVersions = pgTable("exchange_rate_versions", {
  id: id(), version: integer("version").notNull().unique(), kztPerUsd: numeric("kzt_per_usd", { precision: 20, scale: 8 }).notNull(),
  source: text("source").notNull().default("manual"), editorUserId: uuid("editor_user_id").references(() => user.id, { onDelete: "restrict" }), createdAt: time("created_at").notNull().defaultNow(),
}, t => [index("exchange_rate_versions_editor_idx").on(t.editorUserId), check("exchange_rate_versions_valid", sql`${t.version}>0 AND ${t.kztPerUsd}>0 AND ${t.kztPerUsd}<>'NaN'::numeric AND ${t.source}='manual'`)]);
export const shippingPolicyVersions = pgTable("shipping_policy_versions", {
  id: id(), version: integer("version").notNull().unique(), editorUserId: uuid("editor_user_id").references(() => user.id, { onDelete: "restrict" }), metadata: object("metadata").notNull().default({}), snapshotSealed: boolean("snapshot_sealed").notNull().default(false), createdAt: time("created_at").notNull().defaultNow(),
}, t => [check("shipping_policy_versions_valid", sql`${t.version}>0 AND jsonb_typeof(${t.metadata})='object'`)]);
export const shippingZones = pgTable("shipping_zones", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(), countries: jsonb("countries").$type<string[]>().notNull().default([]), active: boolean("active").notNull().default(false),
}, t => [check("shipping_zones_fields_valid", sql`length(btrim(${t.key}))>0 AND length(btrim(${t.name}))>0 AND jsonb_typeof(${t.countries})='array'`)]);
export const shippingRates = pgTable("shipping_rates", {
  id: id(), policyId: uuid("policy_id").notNull().references(() => shippingPolicyVersions.id, { onDelete: "restrict" }), zoneId: uuid("zone_id").notNull().references(() => shippingZones.id, { onDelete: "restrict" }),
  key: text("key").notNull(), currency: text("currency").notNull().default("KZT"), amountMinor: money("amount_minor").notNull(),
  minimumSubtotalMinor: money("minimum_subtotal_minor").notNull().default(sql`0`), maximumSubtotalMinor: money("maximum_subtotal_minor"), minimumWeightGrams: integer("minimum_weight_grams").notNull().default(0), maximumWeightGrams: integer("maximum_weight_grams"),
}, t => [uniqueIndex("shipping_rates_band_unique").on(t.policyId, t.zoneId, t.key), index("shipping_rates_zone_idx").on(t.zoneId), check("shipping_rates_values_valid", sql`length(btrim(${t.key}))>0 AND ${t.currency}='KZT' AND ${t.amountMinor}>=0 AND ${t.minimumSubtotalMinor}>=0 AND (${t.maximumSubtotalMinor} IS NULL OR ${t.maximumSubtotalMinor}>=${t.minimumSubtotalMinor}) AND ${t.minimumWeightGrams}>=0 AND (${t.maximumWeightGrams} IS NULL OR ${t.maximumWeightGrams}>=${t.minimumWeightGrams})`)]);
export const taxConfiguration = pgTable("tax_configuration", {
  id: id(), version: integer("version").notNull().unique(), mode: text("mode").notNull(), rateBps: integer("rate_bps").notNull(), countryCode: text("country_code"), rules: object("rules").notNull().default({}),
  editorUserId: uuid("editor_user_id").references(() => user.id, { onDelete: "restrict" }), createdAt: time("created_at").notNull().defaultNow(),
}, t => [check("tax_configuration_fields_valid", sql`${t.version}>0 AND ${t.mode} IN ('inclusive','exclusive') AND ${t.rateBps} BETWEEN 0 AND 10000 AND (${t.countryCode} IS NULL OR ${t.countryCode} ~ '^[A-Z]{2}$') AND jsonb_typeof(${t.rules})='object'`)]);
export const storeSettings = pgTable("store_settings", {
  id: integer("id").primaryKey(), version: integer("version").notNull().default(1), storeName: text("store_name"), contactEmail: text("contact_email"), supportPhone: text("support_phone"),
  baseCurrency: text("base_currency").notNull().default("KZT"), usdDisplayEnabled: boolean("usd_display_enabled").notNull().default(false),
  activeExchangeRateId: uuid("active_exchange_rate_id").references(() => exchangeRateVersions.id, { onDelete: "restrict" }),
  activeShippingPolicyId: uuid("active_shipping_policy_id").references(() => shippingPolicyVersions.id, { onDelete: "restrict" }), activeTaxConfigurationId: uuid("active_tax_configuration_id").references(() => taxConfiguration.id, { onDelete: "restrict" }),
  freeShippingThresholdMinor: money("free_shipping_threshold_minor"), maintenanceMode: boolean("maintenance_mode").notNull().default(true), paymentMode: text("payment_mode").notNull().default("demo"),
  seoTitle: text("seo_title"), seoDescription: text("seo_description"), presentationConfig: object("presentation_config").notNull().default({}), legacySettings: object("legacy_settings").notNull().default({}),
  // O07 (Task 21C): the payment instructions shown on the receipt of a manual-payment order, and how
  // long its stock and coupon are held while staff wait for the money.
  manualPaymentInstructions: text("manual_payment_instructions"), manualPaymentHoldHours: integer("manual_payment_hold_hours").notNull().default(48),
  /** 0033 (owner 2026-11-26): the one store customers can pick up from (see src/lib/pickup.ts). */
  pickupLocation: object("pickup_location").notNull().default(PICKUP_SEED),
}, t => [check("store_settings_manual_payment_valid", sql`${t.manualPaymentHoldHours} BETWEEN 1 AND 168 AND (${t.manualPaymentInstructions} IS NULL OR length(${t.manualPaymentInstructions}) BETWEEN 1 AND 2000)`), check("store_settings_valid", sql`${t.id}=1 AND ${t.version}>0 AND ${t.baseCurrency}='KZT' AND (NOT ${t.usdDisplayEnabled} OR ${t.activeExchangeRateId} IS NOT NULL) AND (${t.freeShippingThresholdMinor} IS NULL OR ${t.freeShippingThresholdMinor}>=0) AND ${t.paymentMode} IN ('demo','live') AND jsonb_typeof(${t.presentationConfig})='object' AND jsonb_typeof(${t.legacySettings})='object'`)]);
