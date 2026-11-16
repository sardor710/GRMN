import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { products, productVariants } from "./catalog.ts";
import { mediaAssets } from "./media.ts";

export const productMedia = pgTable("product_media", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id"),
  mediaId: uuid("media_id").notNull().references(() => mediaAssets.id, { onDelete: "restrict" }),
  altText: text("alt_text"), position: integer("position").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (table) => [
  foreignKey({ columns: [table.variantId, table.productId], foreignColumns: [productVariants.id, productVariants.productId] }).onDelete("restrict"),
  uniqueIndex("product_media_product_asset_unique").on(table.productId, table.mediaId).where(sql`${table.variantId} IS NULL`),
  uniqueIndex("product_media_variant_asset_unique").on(table.variantId, table.mediaId).where(sql`${table.variantId} IS NOT NULL`),
  uniqueIndex("product_media_primary_product_unique").on(table.productId).where(sql`${table.variantId} IS NULL AND ${table.isPrimary}`),
  uniqueIndex("product_media_primary_variant_unique").on(table.variantId).where(sql`${table.variantId} IS NOT NULL AND ${table.isPrimary}`),
  index("product_media_media_idx").on(table.mediaId),
  index("product_media_gallery_idx").on(table.productId, table.variantId, table.position, table.id),
  check("product_media_position_valid", sql`${table.position}>=0`),
]);
