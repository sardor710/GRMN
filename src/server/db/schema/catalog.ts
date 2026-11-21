import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

/** A box-contents entry: legacy plain text, or a labelled item with an optional image source (0013). */
export type InTheBoxItem = string | { label: string; image?: string };

/** Listing filters a category applies when opened; keys mirror the public catalog query (0013). */
export interface CategoryPresetFilters {
  activities?: string[];
  levels?: ("Entry" | "Advanced" | "Premium" | "Youth")[];
  caseSizes?: ("Small" | "Medium" | "Large")[];
  families?: string[];
}

export const categoryKinds = ["catalog", "accessory", "group"] as const;
export type CategoryKind = (typeof categoryKinds)[number];

export const products = pgTable("products", {
  id: id(),
  publicKey: text("public_key").notNull().unique(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  family: text("family"),
  brand: text("brand"),
  badge: text("badge"),
  priceSuffix: text("price_suffix"),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  isFeatured: boolean("is_featured").notNull().default(false),
  specs: jsonb("specs").$type<{ label: string; value: string }[]>().notNull().default([]),
  features: jsonb("features").$type<{ title: string; body: string; image?: string }[]>().notNull().default([]),
  // Item shapes are enforced by the custom check products_in_the_box_items (migration 0013).
  inTheBox: jsonb("in_the_box").$type<InTheBoxItem[]>().notNull().default([]),
  legacyContent: jsonb("legacy_content").$type<Record<string, unknown>>().notNull().default({}),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  focusKeywords: jsonb("focus_keywords").$type<string[]>().notNull().default([]),
  canonicalUrl: text("canonical_url"),
  noIndex: boolean("no_index").notNull().default(false),
  ogImageSource: text("og_image_source"),
  version: integer("version").notNull().default(1),
  configurationEpoch: bigint("configuration_epoch", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("products_published_order_idx").on(table.status, table.createdAt, table.id),
  check("products_public_key_present", sql`length(btrim(${table.publicKey}))>0 AND ${table.publicKey}=btrim(${table.publicKey})`),
  check("products_slug_valid", sql`${table.slug} IS NULL OR (length(btrim(${table.slug}))>0 AND ${table.slug}=btrim(${table.slug}))`),
  check("products_name_present", sql`length(btrim(${table.name}))>0`),
  check("products_status_valid", sql`${table.status} IN ('draft','published','archived')`),
  check("products_content_shapes", sql`jsonb_typeof(${table.specs})='array' AND jsonb_typeof(${table.features})='array' AND jsonb_typeof(${table.inTheBox})='array' AND jsonb_typeof(${table.focusKeywords})='array' AND jsonb_typeof(${table.legacyContent})='object'`),
  check("products_versions_valid", sql`${table.version}>=1 AND ${table.configurationEpoch}>=0`),
]);

export const productVariants = pgTable("product_variants", {
  id: id(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  sku: text("sku").notNull(),
  name: text("name"),
  barcode: text("barcode"),
  status: text("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft"),
  isDefault: boolean("is_default").notNull().default(false),
  optionSignature: uuid("option_signature").array(),
  weightGrams: integer("weight_grams"),
  lengthMm: integer("length_mm"),
  widthMm: integer("width_mm"),
  heightMm: integer("height_mm"),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique("product_variants_id_product_unique").on(table.id, table.productId),
  uniqueIndex("product_variants_sku_unique").on(sql`lower(${table.sku})`),
  uniqueIndex("product_variants_default_unique").on(table.productId).where(sql`${table.isDefault} AND ${table.status}<>'archived'`),
  uniqueIndex("product_variants_combination_unique").on(table.productId, table.optionSignature).where(sql`${table.status}<>'archived' AND ${table.optionSignature} IS NOT NULL`),
  index("product_variants_product_status_idx").on(table.productId, table.status, table.id),
  check("product_variants_sku_present", sql`length(btrim(${table.sku}))>0 AND ${table.sku}=btrim(${table.sku})`),
  check("product_variants_status_valid", sql`${table.status} IN ('draft','active','archived')`),
  check("product_variants_measurements_valid", sql`(${table.weightGrams} IS NULL OR ${table.weightGrams}>0) AND (${table.lengthMm} IS NULL OR ${table.lengthMm}>0) AND (${table.widthMm} IS NULL OR ${table.widthMm}>0) AND (${table.heightMm} IS NULL OR ${table.heightMm}>0)`),
  check("product_variants_version_valid", sql`${table.version}>=1`),
]);

export const productOptions = pgTable("product_options", {
  id: id(), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  key: text("key").notNull(), name: text("name").notNull(), position: integer("position").notNull().default(0),
}, (table) => [
  unique("product_options_id_product_unique").on(table.id, table.productId),
  uniqueIndex("product_options_key_unique").on(table.productId, table.key),
  check("product_options_fields_valid", sql`length(btrim(${table.key}))>0 AND ${table.key}=lower(btrim(${table.key})) AND length(btrim(${table.name}))>0 AND ${table.position}>=0`),
]);

export const optionValues = pgTable("option_values", {
  id: id(), productId: uuid("product_id").notNull(), optionId: uuid("option_id").notNull(),
  key: text("key").notNull(), label: text("label").notNull(), position: integer("position").notNull().default(0),
}, (table) => [
  foreignKey({ columns: [table.optionId, table.productId], foreignColumns: [productOptions.id, productOptions.productId] }).onDelete("restrict"),
  unique("option_values_identity_unique").on(table.id, table.productId, table.optionId),
  // Target for product_compatibility's device ownership FK (0013).
  unique("option_values_id_product_unique").on(table.id, table.productId),
  uniqueIndex("option_values_key_unique").on(table.optionId, table.key),
  check("option_values_fields_valid", sql`length(btrim(${table.key}))>0 AND length(btrim(${table.label}))>0 AND ${table.position}>=0`),
]);

export const variantOptionValues = pgTable("variant_option_values", {
  variantId: uuid("variant_id").notNull(), productId: uuid("product_id").notNull(),
  optionId: uuid("option_id").notNull(), optionValueId: uuid("option_value_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.variantId, table.optionId] }),
  foreignKey({ columns: [table.variantId, table.productId], foreignColumns: [productVariants.id, productVariants.productId] }).onDelete("restrict"),
  foreignKey({ columns: [table.optionValueId, table.productId, table.optionId], foreignColumns: [optionValues.id, optionValues.productId, optionValues.optionId] }).onDelete("restrict"),
  index("variant_option_values_value_idx").on(table.optionValueId, table.productId, table.optionId),
]);

export const categories = pgTable("categories", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "restrict" }),
  archived: boolean("archived").notNull().default(false), position: integer("position").notNull().default(0),
  kind: text("kind", { enum: categoryKinds }).notNull().default("catalog"),
  slug: text("slug").unique(),
  presetFilters: jsonb("preset_filters").$type<CategoryPresetFilters>().notNull().default({}),
  navVisible: boolean("nav_visible").notNull().default(true),
  description: text("description"),
}, (table) => [
  index("categories_parent_order_idx").on(table.parentId, table.position, table.id),
  check("categories_fields_valid", sql`length(btrim(${table.key}))>0 AND length(btrim(${table.name}))>0 AND ${table.position}>=0`),
  check("categories_not_self_parent", sql`${table.parentId} IS NULL OR ${table.parentId}<>${table.id}`),
  check("categories_kind_valid", sql`${table.kind} IN ('catalog','accessory','group')`),
  check("categories_slug_valid", sql`${table.slug} IS NULL OR ${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$'`),
  check("categories_preset_filters_object", sql`jsonb_typeof(${table.presetFilters})='object'`),
]);

// Internal serialization row; its only initial record is infrastructure state.
export const catalogTaxonomyGuard = pgTable("catalog_taxonomy_guard", {
  id: integer("id").primaryKey(),
  epoch: bigint("epoch", { mode: "bigint" }).notNull().default(sql`0`),
}, (table) => [check("catalog_taxonomy_guard_singleton", sql`${table.id}=1 AND ${table.epoch}>=0`)]);

export const productCategories = pgTable("product_categories", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (table) => [
  primaryKey({ columns: [table.productId, table.categoryId] }),
  index("product_categories_category_idx").on(table.categoryId, table.productId),
  uniqueIndex("product_categories_primary_unique").on(table.productId).where(sql`${table.isPrimary}`),
]);

export const activities = pgTable("activities", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(),
}, (table) => [check("activities_fields_present", sql`length(btrim(${table.key}))>0 AND length(btrim(${table.name}))>0`)]);

export const productActivities = pgTable("product_activities", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  activityId: uuid("activity_id").notNull().references(() => activities.id, { onDelete: "restrict" }),
}, (table) => [primaryKey({ columns: [table.productId, table.activityId] }), index("product_activities_activity_idx").on(table.activityId, table.productId)]);

export const attributeDefinitions = pgTable("attribute_definitions", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(),
  dataType: text("data_type", { enum: ["text", "number", "boolean", "enum"] }).notNull(),
  unit: text("unit"), filterable: boolean("filterable").notNull().default(false),
}, (table) => [
  unique("attribute_definitions_identity_type_unique").on(table.id, table.dataType),
  check("attribute_definitions_fields_valid", sql`length(btrim(${table.key}))>0 AND ${table.key}=lower(btrim(${table.key})) AND length(btrim(${table.name}))>0 AND ${table.dataType} IN ('text','number','boolean','enum')`),
]);

export const attributeEnumValues = pgTable("attribute_enum_values", {
  attributeId: uuid("attribute_id").notNull(), dataType: text("data_type").notNull().default("enum"),
  key: text("key").notNull(), label: text("label").notNull(),
}, (table) => [
  primaryKey({ columns: [table.attributeId, table.key] }),
  foreignKey({ columns: [table.attributeId, table.dataType], foreignColumns: [attributeDefinitions.id, attributeDefinitions.dataType] }).onDelete("restrict"),
  check("attribute_enum_values_fields_valid", sql`${table.dataType}='enum' AND length(btrim(${table.key}))>0 AND length(btrim(${table.label}))>0`),
]);

export const productAttributeValues = pgTable("product_attribute_values", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  attributeId: uuid("attribute_id").notNull(), dataType: text("data_type").notNull(),
  textValue: text("text_value"), numberValue: numeric("number_value", { precision: 20, scale: 6 }),
  booleanValue: boolean("boolean_value"), enumValue: text("enum_value"),
}, (table) => [
  primaryKey({ columns: [table.productId, table.attributeId] }),
  foreignKey({ columns: [table.attributeId, table.dataType], foreignColumns: [attributeDefinitions.id, attributeDefinitions.dataType] }).onDelete("restrict"),
  foreignKey({ columns: [table.attributeId, table.enumValue], foreignColumns: [attributeEnumValues.attributeId, attributeEnumValues.key] }).onDelete("restrict"),
  index("product_attribute_values_lookup_idx").on(table.attributeId, table.enumValue, table.productId),
  check("product_attribute_values_typed_payload", sql`(${table.dataType}='text' AND ${table.textValue} IS NOT NULL AND ${table.numberValue} IS NULL AND ${table.booleanValue} IS NULL AND ${table.enumValue} IS NULL) OR (${table.dataType}='number' AND ${table.numberValue} IS NOT NULL AND ${table.textValue} IS NULL AND ${table.booleanValue} IS NULL AND ${table.enumValue} IS NULL) OR (${table.dataType}='boolean' AND ${table.booleanValue} IS NOT NULL AND ${table.textValue} IS NULL AND ${table.numberValue} IS NULL AND ${table.enumValue} IS NULL) OR (${table.dataType}='enum' AND ${table.enumValue} IS NOT NULL AND ${table.textValue} IS NULL AND ${table.numberValue} IS NULL AND ${table.booleanValue} IS NULL)`),
]);

export const productRelations = pgTable("product_relations", {
  sourceProductId: uuid("source_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  targetProductId: uuid("target_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  relationType: text("relation_type", { enum: ["related", "compatible_accessory", "upsell"] }).notNull(),
  position: integer("position").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.sourceProductId, table.targetProductId, table.relationType] }),
  index("product_relations_target_idx").on(table.targetProductId),
  check("product_relations_valid", sql`${table.sourceProductId}<>${table.targetProductId} AND ${table.relationType} IN ('related','compatible_accessory','upsell') AND ${table.position}>=0`),
]);

const noScope = sql.raw("'00000000-0000-0000-0000-000000000000'::uuid");

/**
 * One stored "accessory fits device" fact (0013). Device scope: neither option value nor variant =
 * every variant of the device; an option value = every current/future variant carrying it; a variant =
 * a single-variant exception. Composite FKs pin each optional variant/option value to its own product.
 */
export const productCompatibility = pgTable("product_compatibility", {
  id: id(),
  accessoryProductId: uuid("accessory_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  accessoryVariantId: uuid("accessory_variant_id"),
  deviceProductId: uuid("device_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  deviceOptionValueId: uuid("device_option_value_id"),
  deviceVariantId: uuid("device_variant_id"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (table) => [
  foreignKey({ name: "product_compatibility_accessory_variant_fk", columns: [table.accessoryVariantId, table.accessoryProductId], foreignColumns: [productVariants.id, productVariants.productId] }).onDelete("restrict"),
  foreignKey({ name: "product_compatibility_device_option_value_fk", columns: [table.deviceOptionValueId, table.deviceProductId], foreignColumns: [optionValues.id, optionValues.productId] }).onDelete("restrict"),
  foreignKey({ name: "product_compatibility_device_variant_fk", columns: [table.deviceVariantId, table.deviceProductId], foreignColumns: [productVariants.id, productVariants.productId] }).onDelete("restrict"),
  uniqueIndex("product_compatibility_link_unique").on(table.accessoryProductId, sql`coalesce(${table.accessoryVariantId},${noScope})`, table.deviceProductId, sql`coalesce(${table.deviceOptionValueId},${noScope})`, sql`coalesce(${table.deviceVariantId},${noScope})`),
  index("product_compatibility_device_idx").on(table.deviceProductId, table.position),
  index("product_compatibility_accessory_idx").on(table.accessoryProductId, table.position),
  index("product_compatibility_accessory_variant_idx").on(table.accessoryVariantId).where(sql`${table.accessoryVariantId} IS NOT NULL`),
  index("product_compatibility_device_option_value_idx").on(table.deviceOptionValueId).where(sql`${table.deviceOptionValueId} IS NOT NULL`),
  index("product_compatibility_device_variant_idx").on(table.deviceVariantId).where(sql`${table.deviceVariantId} IS NOT NULL`),
  check("product_compatibility_not_self", sql`${table.accessoryProductId}<>${table.deviceProductId}`),
  check("product_compatibility_single_device_scope", sql`${table.deviceOptionValueId} IS NULL OR ${table.deviceVariantId} IS NULL`),
  check("product_compatibility_position_valid", sql`${table.position}>=0`),
]);

export const prices = pgTable("prices", {
  id: id(), variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
  currency: text("currency").notNull().default("KZT"), market: text("market").notNull().default("default"),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  compareAtMinor: bigint("compare_at_minor", { mode: "bigint" }),
  isActive: boolean("is_active").notNull().default(true), version: integer("version").notNull().default(1),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("prices_active_unique").on(table.variantId, table.market, table.currency).where(sql`${table.isActive}`),
  index("prices_variant_history_idx").on(table.variantId, table.createdAt),
  check("prices_amounts_valid", sql`${table.amountMinor}>=0 AND (${table.compareAtMinor} IS NULL OR ${table.compareAtMinor}>=${table.amountMinor})`),
  check("prices_currency_market_valid", sql`${table.currency}='KZT' AND length(btrim(${table.market}))>0`),
  check("prices_version_valid", sql`${table.version}>=1`),
]);
