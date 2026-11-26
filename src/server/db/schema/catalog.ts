import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, numeric, pgSequence, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  /** Series (watch-series children) by stable key; survives a rename (0028, owner 2026-11-22). */
  seriesKeys?: string[];
}

export const categoryKinds = ["catalog", "accessory", "group"] as const;
/** How the storefront renders an option's values (0014). */
export const optionDisplays = ["buttons", "swatch", "dropdown"] as const;
export type OptionDisplay = (typeof optionDisplays)[number];
export type CategoryKind = (typeof categoryKinds)[number];

/** New product codes start above every garmin.com product id (0029, owner 2026-11-23). */
export const productCodeSeq = pgSequence("product_code_seq", { startWith: 90000001 });

export const products = pgTable("products", {
  id: id(),
  publicKey: text("public_key").notNull().unique(),
  // Public URL key: /p/{code} and /p/{code}/{sku} (0029). Imported products carry their garmin.com id.
  productCode: text("product_code").notNull().default(sql`(nextval('product_code_seq'))::text`),
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
  // Admin list thumbnail fallback, computed at write time so list queries never detoast legacy_content (0014).
  thumbnailSource: text("thumbnail_source").generatedAlwaysAs(sql`("legacy_content"->>'image')`),
  version: integer("version").notNull().default(1),
  configurationEpoch: bigint("configuration_epoch", { mode: "bigint" }).notNull().default(sql`0`),
  /** 0030: serial number at packing — "required", "none", or NULL = decided by categories (owner 2026-11-25). */
  serialPolicy: text("serial_policy"),
  /** 0033: warranty length in months; null = from categories, else 12. */
  warrantyMonths: integer("warranty_months"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("products_published_order_idx").on(table.status, table.createdAt, table.id),
  // Admin product/SKU lists: keyset order updated_at DESC, id DESC (0014).
  index("products_admin_order_idx").on(table.updatedAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
  uniqueIndex("products_product_code_unique").on(table.productCode),
  check("products_product_code_valid", sql`${table.productCode} ~ '^[0-9]{1,12}$'`),
  check("products_public_key_present", sql`length(btrim(${table.publicKey}))>0 AND ${table.publicKey}=btrim(${table.publicKey})`),
  check("products_slug_valid", sql`${table.slug} IS NULL OR (length(btrim(${table.slug}))>0 AND ${table.slug}=btrim(${table.slug}))`),
  check("products_name_present", sql`length(btrim(${table.name}))>0`),
  check("products_status_valid", sql`${table.status} IN ('draft','published','archived')`),
  check("products_content_shapes", sql`jsonb_typeof(${table.specs})='array' AND jsonb_typeof(${table.features})='array' AND jsonb_typeof(${table.inTheBox})='array' AND jsonb_typeof(${table.focusKeywords})='array' AND jsonb_typeof(${table.legacyContent})='object'`),
  check("products_versions_valid", sql`${table.version}>=1 AND ${table.configurationEpoch}>=0`),
  check("products_warranty_months_valid", sql`${table.warrantyMonths} IS NULL OR ${table.warrantyMonths} BETWEEN 1 AND 120`),
  check("products_serial_policy_valid", sql`${table.serialPolicy} IS NULL OR ${table.serialPolicy} IN ('required','none')`),
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
  contentOverrides: jsonb("content_overrides").notNull().default({}),
  // Owner 2026-11-23 (0030): the variant page's own SEO title/description per language — {en|ru|kk: {title?, description?}};
  // an absent language or field means the page's text is generated.
  seo: jsonb("seo").$type<Partial<Record<"en" | "ru" | "kk", { title?: string; description?: string }>>>().notNull().default({}),
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
  check("product_variants_content_overrides_object", sql`jsonb_typeof(${table.contentOverrides})='object'`),
  check("product_variants_seo_object", sql`jsonb_typeof(${table.seo})='object'`),
]);

export const productOptions = pgTable("product_options", {
  id: id(), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  key: text("key").notNull(), name: text("name").notNull(), position: integer("position").notNull().default(0),
  display: text("display", { enum: optionDisplays }).notNull().default("buttons"),
}, (table) => [
  unique("product_options_id_product_unique").on(table.id, table.productId),
  check("product_options_display_valid", sql`${table.display} IN ('buttons','swatch','dropdown')`),
  uniqueIndex("product_options_key_unique").on(table.productId, table.key),
  check("product_options_fields_valid", sql`length(btrim(${table.key}))>0 AND ${table.key}=lower(btrim(${table.key})) AND length(btrim(${table.name}))>0 AND ${table.position}>=0`),
]);

export const optionValues = pgTable("option_values", {
  id: id(), productId: uuid("product_id").notNull(), optionId: uuid("option_id").notNull(),
  key: text("key").notNull(), label: text("label").notNull(), position: integer("position").notNull().default(0),
  // Swatch presentation (0014): a lowercase #rrggbb color and/or an image path or https URL.
  swatchColor: text("swatch_color"),
  swatchImageSource: text("swatch_image_source"),
}, (table) => [
  foreignKey({ columns: [table.optionId, table.productId], foreignColumns: [productOptions.id, productOptions.productId] }).onDelete("restrict"),
  check("option_values_swatch_color_valid", sql`${table.swatchColor} IS NULL OR ${table.swatchColor} ~ '^#[0-9a-f]{6}$'`),
  check("option_values_swatch_image_valid", sql`${table.swatchImageSource} IS NULL OR (length(btrim(${table.swatchImageSource}))>0 AND length(${table.swatchImageSource})<=2048)`),
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
  /** 0028: fixed link of a top menu item when it is not its own /c/<slug> (e.g. Sports & Fitness opens Running). */
  menuHref: text("menu_href"),
  /** 0030: serial number at packing — "required", "none", or NULL = same as parent (owner 2026-11-25). */
  serialPolicy: text("serial_policy"),
  /** 0033: warranty length in months; null = from categories, else 12. */
  warrantyMonths: integer("warranty_months"),
}, (table) => [
  index("categories_parent_order_idx").on(table.parentId, table.position, table.id),
  check("categories_fields_valid", sql`length(btrim(${table.key}))>0 AND length(btrim(${table.name}))>0 AND ${table.position}>=0`),
  check("categories_not_self_parent", sql`${table.parentId} IS NULL OR ${table.parentId}<>${table.id}`),
  check("categories_kind_valid", sql`${table.kind} IN ('catalog','accessory','group')`),
  check("categories_slug_valid", sql`${table.slug} IS NULL OR ${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$'`),
  check("categories_preset_filters_object", sql`jsonb_typeof(${table.presetFilters})='object'`),
  check("categories_warranty_months_valid", sql`${table.warrantyMonths} IS NULL OR ${table.warrantyMonths} BETWEEN 1 AND 120`),
  check("categories_serial_policy_valid", sql`${table.serialPolicy} IS NULL OR ${table.serialPolicy} IN ('required','none')`),
]);

// Internal serialization row; its only initial record is infrastructure state.
export const catalogTaxonomyGuard = pgTable("catalog_taxonomy_guard", {
  id: integer("id").primaryKey(),
  epoch: bigint("epoch", { mode: "bigint" }).notNull().default(sql`0`),
}, (table) => [check("catalog_taxonomy_guard_singleton", sql`${table.id}=1 AND ${table.epoch}>=0`)]);

/** 0028: RU/KK names; English stays in categories.name. */
export const categoryLocales = ["ru", "kk"] as const;
export const categoryTranslations = pgTable("category_translations", {
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: categoryLocales }).notNull(),
  name: text("name").notNull(),
}, (table) => [
  primaryKey({ columns: [table.categoryId, table.locale] }),
  check("category_translations_locale_valid", sql`${table.locale} IN ('ru','kk')`),
  check("category_translations_name_present", sql`length(btrim(${table.name}))>0`),
]);

/** Optional per-placement label override, keyed by locale (en/ru/kk only). */
export type MenuPlacementLabel = Partial<Record<"en" | "ru" | "kk", string>>;

/**
 * 0028: the ordered Products group of a top menu item. One category may be placed under several top items,
 * each at its own position; href/label override the category's own /c/<slug> and name when the menu differs.
 */
export const categoryMenuPlacements = pgTable("category_menu_placements", {
  id: id(),
  menuCategoryId: uuid("menu_category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  href: text("href"),
  label: jsonb("label").$type<MenuPlacementLabel>(),
}, (table) => [
  unique("category_menu_placements_unique").on(table.menuCategoryId, table.categoryId),
  index("category_menu_placements_menu_idx").on(table.menuCategoryId, table.position),
  index("category_menu_placements_category_idx").on(table.categoryId),
  check("category_menu_placements_position_valid", sql`${table.position}>=0`),
  check("category_menu_placements_label_valid", sql`${table.label} IS NULL OR (jsonb_typeof(${table.label})='object' AND (${table.label} - 'en' - 'ru' - 'kk')='{}'::jsonb)`),
]);

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

/**
 * 0028: live "device fits every accessory of this type" links (owner 2026-11-22). The category is an accessory
 * category or a group under one (band size, charger type); a trigger enforces that. Accessories filed under it
 * later are compatible without another edit. Optionally narrowed to one device option value (e.g. 47 mm).
 */
export const productCompatibilityTypes = pgTable("product_compatibility_types", {
  id: id(),
  deviceProductId: uuid("device_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  deviceOptionValueId: uuid("device_option_value_id"),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (table) => [
  foreignKey({ name: "product_compatibility_types_option_value_fk", columns: [table.deviceOptionValueId, table.deviceProductId], foreignColumns: [optionValues.id, optionValues.productId] }).onDelete("restrict"),
  uniqueIndex("product_compatibility_types_unique").on(table.deviceProductId, sql`coalesce(${table.deviceOptionValueId},${noScope})`, table.categoryId),
  index("product_compatibility_types_category_idx").on(table.categoryId),
  index("product_compatibility_types_option_value_idx").on(table.deviceOptionValueId).where(sql`${table.deviceOptionValueId} IS NOT NULL`),
  check("product_compatibility_types_position_valid", sql`${table.position}>=0`),
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

// Task 21B follow-up (owner, 2026-11-18): the maintained offer summary for price-sorted listings.
// Derived data: one row per eligible variant and market (an active variant that chooses every option,
// with an active KZT price there), with whether a live location has free stock. Only the 0015
// functions write it, from deferred triggers on prices, variants, options, selections, balances and
// locations; catalog_rebuild_offers() rebuilds it after a bulk load that bypassed triggers.
export const catalogVariantOffers = pgTable("catalog_variant_offers", {
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  // The listing's tie-break is the variant id as text (the `chosen` order), so it is stored for the index.
  variantKey: text("variant_key").notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  available: boolean("available").notNull(),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.variantId, table.market] }),
  // The chosen offer of a product: available first, then cheapest, then variant id.
  index("catalog_variant_offers_choice_idx").on(table.productId, table.market, table.available.desc(), table.amountMinor, table.variantKey),
  check("catalog_variant_offers_valid", sql`${table.amountMinor}>=0 AND ${table.variantKey}=${table.variantId}::text`),
]);
