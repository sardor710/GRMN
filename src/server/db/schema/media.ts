import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { uuid } from "drizzle-orm/pg-core";

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID),
  storageNamespace: text("storage_namespace").notNull(),
  storageKey: text("storage_key").notNull(),
  sourcePath: text("source_path"),
  kind: text("kind", { enum: ["image", "video", "document", "font", "other"] }).notNull(),
  visibility: text("visibility", { enum: ["public", "private"] }).notNull().default("private"),
  status: text("status", { enum: ["pending", "ready", "quarantined", "archived"] }).notNull().default("pending"),
  mimeType: text("mime_type"),
  byteSize: bigint("byte_size", { mode: "bigint" }),
  checksumSha256: text("checksum_sha256"),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("media_assets_storage_unique").on(table.storageNamespace, table.storageKey),
  check("media_assets_storage_present", sql`length(btrim(${table.storageNamespace}))>0 AND length(btrim(${table.storageKey}))>0`),
  check("media_assets_kind_valid", sql`${table.kind} IN ('image','video','document','font','other')`),
  check("media_assets_visibility_valid", sql`${table.visibility} IN ('public','private')`),
  check("media_assets_status_valid", sql`${table.status} IN ('pending','ready','quarantined','archived')`),
  check("media_assets_size_valid", sql`${table.byteSize} IS NULL OR ${table.byteSize}>=0`),
  check("media_assets_checksum_valid", sql`${table.checksumSha256} IS NULL OR ${table.checksumSha256} ~ '^[0-9a-f]{64}$'`),
  check("media_assets_dimensions_valid", sql`(${table.width} IS NULL AND ${table.height} IS NULL) OR (${table.width} IS NOT NULL AND ${table.height} IS NOT NULL AND ${table.width}>0 AND ${table.height}>0)`),
  check("media_assets_ready_metadata", sql`${table.status}<>'ready' OR (${table.byteSize} IS NOT NULL AND ${table.checksumSha256} IS NOT NULL AND ${table.mimeType} IS NOT NULL AND length(btrim(${table.mimeType}))>0)`),
]);
