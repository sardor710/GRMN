import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, boolean } from "drizzle-orm/pg-core";
import { user } from "./identity.ts";
import { products } from "./catalog.ts";
import { mediaAssets } from "./media.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const object = (name: string) => jsonb(name).$type<Record<string, unknown>>();

export const pages = pgTable("pages", {
  id: id(), key: text("key").notNull(), kind: text("kind").notNull(), slug: text("slug"),
  status: text("status").notNull().default("draft"), version: integer("version").notNull().default(1),
  publicationEpoch: bigint("publication_epoch", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: time("created_at").notNull().defaultNow(),
}, t => [
  unique("pages_identity_kind_unique").on(t.id, t.kind), uniqueIndex("pages_key_unique").on(t.kind, t.key), uniqueIndex("pages_slug_unique").on(t.kind, t.slug).where(sql`${t.slug} IS NOT NULL`),
  index("pages_public_idx").on(t.kind, t.status, t.id),
  check("pages_fields_valid", sql`length(btrim(${t.key}))>0 AND ${t.kind} IN ('page','blog','banner','homepage') AND ${t.status} IN ('draft','published','archived') AND ${t.version}>0 AND ${t.publicationEpoch}>=0 AND (${t.slug} IS NULL OR (length(btrim(${t.slug}))>0 AND ${t.slug}=btrim(${t.slug})))`),
]);

export const pageVersions = pgTable("page_versions", {
  id: id(), pageId: uuid("page_id").notNull(), pageKind: text("page_kind").notNull(), version: integer("version").notNull(), schemaVersion: integer("schema_version").notNull().default(1),
  title: text("title").notNull(), subtitle: text("subtitle"), summary: text("summary").notNull().default(""), body: text("body").notNull().default(""),
  blocks: jsonb("blocks").$type<Record<string, unknown>[]>().notNull().default([]), metadata: object("metadata").notNull().default({}), legacyContent: object("legacy_content").notNull().default({}),
  seoTitle: text("seo_title"), seoDescription: text("seo_description"), focusKeywords: jsonb("focus_keywords").$type<string[]>().notNull().default([]),
  canonicalUrl: text("canonical_url"), noIndex: boolean("no_index").notNull().default(false), ogImageSource: text("og_image_source"),
  authorUserId: uuid("author_user_id").references(() => user.id, { onDelete: "restrict" }), snapshotSealed: boolean("snapshot_sealed").notNull().default(false), createdAt: time("created_at").notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.pageId, t.pageKind], foreignColumns: [pages.id, pages.kind] }).onDelete("restrict"),
  unique("page_versions_identity_page_unique").on(t.id, t.pageId), unique("page_versions_identity_kind_unique").on(t.id, t.pageId, t.pageKind), uniqueIndex("page_versions_number_unique").on(t.pageId, t.version), index("page_versions_author_idx").on(t.authorUserId),
  check("page_versions_fields_valid", sql`${t.version}>0 AND ${t.schemaVersion}>0 AND length(btrim(${t.title}))>0 AND jsonb_typeof(${t.blocks})='array' AND jsonb_typeof(${t.metadata})='object' AND jsonb_typeof(${t.legacyContent})='object' AND jsonb_typeof(${t.focusKeywords})='array'`),
]);

export const pagePublications = pgTable("page_publications", {
  pageId: uuid("page_id").primaryKey(), versionId: uuid("version_id").notNull(), publishedAt: time("published_at").notNull().defaultNow(), scheduledUntil: time("scheduled_until"),
}, t => [foreignKey({ columns: [t.versionId, t.pageId], foreignColumns: [pageVersions.id, pageVersions.pageId] }).onDelete("restrict"), check("page_publications_window_valid", sql`${t.scheduledUntil} IS NULL OR ${t.scheduledUntil}>${t.publishedAt}`)]);

export const blogPosts = pgTable("blog_posts", {
  versionId: uuid("version_id").primaryKey(), pageId: uuid("page_id").notNull(), pageKind: text("page_kind").notNull().default("blog"),
  authorLabel: text("author_label"), category: text("category"), readingTime: text("reading_time"), sourcePublishedAt: time("source_published_at"),
  coverMediaId: uuid("cover_media_id").references(() => mediaAssets.id, { onDelete: "restrict" }), coverSource: text("cover_source"),
}, t => [foreignKey({ columns: [t.versionId, t.pageId, t.pageKind], foreignColumns: [pageVersions.id, pageVersions.pageId, pageVersions.pageKind] }).onDelete("restrict"), index("blog_posts_cover_idx").on(t.coverMediaId), check("blog_posts_kind_valid", sql`${t.pageKind}='blog'`)]);

export const banners = pgTable("banners", {
  versionId: uuid("version_id").primaryKey(), pageId: uuid("page_id").notNull(), pageKind: text("page_kind").notNull().default("banner"),
  position: text("position").notNull(), sortOrder: integer("sort_order").notNull().default(0), ctaLabel: text("cta_label"), ctaUrl: text("cta_url"),
  imageMediaId: uuid("image_media_id").references(() => mediaAssets.id, { onDelete: "restrict" }), imageSource: text("image_source"),
}, t => [foreignKey({ columns: [t.versionId, t.pageId, t.pageKind], foreignColumns: [pageVersions.id, pageVersions.pageId, pageVersions.pageKind] }).onDelete("restrict"), index("banners_position_idx").on(t.position, t.sortOrder), index("banners_media_idx").on(t.imageMediaId), check("banners_fields_valid", sql`${t.pageKind}='banner' AND length(btrim(${t.position}))>0 AND ${t.sortOrder}>=0`)]);

export const merchandisingCollections = pgTable("merchandising_collections", {
  id: id(), key: text("key").notNull().unique(), name: text("name").notNull(), status: text("status").notNull().default("draft"), version: integer("version").notNull().default(1),
  // Draft isolation (18A ruling I6): edits change name/collection_products; publishing copies them into
  // published_name/collection_published_products, which is all the public read sees.
  publishedName: text("published_name"), publishedAt: time("published_at"),
}, t => [check("merchandising_collections_fields_valid", sql`length(btrim(${t.key}))>0 AND length(btrim(${t.name}))>0 AND ${t.status} IN ('draft','published','archived') AND ${t.version}>0`)]);
export const collectionProducts = pgTable("collection_products", {
  collectionId: uuid("collection_id").notNull().references(() => merchandisingCollections.id, { onDelete: "restrict" }), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  position: integer("position").notNull().default(0), presentation: object("presentation").notNull().default({}),
}, t => [primaryKey({ columns: [t.collectionId, t.productId] }), index("collection_products_order_idx").on(t.collectionId, t.position, t.productId), index("collection_products_product_idx").on(t.productId), check("collection_products_fields_valid", sql`${t.position}>=0 AND jsonb_typeof(${t.presentation})='object'`)]);
export const collectionPublishedProducts = pgTable("collection_published_products", {
  collectionId: uuid("collection_id").notNull().references(() => merchandisingCollections.id, { onDelete: "restrict" }), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  position: integer("position").notNull(),
}, t => [primaryKey({ columns: [t.collectionId, t.productId] }), uniqueIndex("collection_published_products_order_idx").on(t.collectionId, t.position), index("collection_published_products_product_idx").on(t.productId), check("collection_published_products_position_valid", sql`${t.position}>=0`)]);
export const pageVersionCollections = pgTable("page_version_collections", {
  versionId: uuid("version_id").notNull().references(() => pageVersions.id, { onDelete: "restrict" }), collectionId: uuid("collection_id").notNull().references(() => merchandisingCollections.id, { onDelete: "restrict" }),
}, t => [primaryKey({ columns: [t.versionId, t.collectionId] }), index("page_version_collections_collection_idx").on(t.collectionId)]);
export const pageVersionMedia = pgTable("page_version_media", {
  versionId: uuid("version_id").notNull().references(() => pageVersions.id, { onDelete: "restrict" }), mediaId: uuid("media_id").notNull().references(() => mediaAssets.id, { onDelete: "restrict" }), role: text("role").notNull(), position: integer("position").notNull().default(0),
}, t => [primaryKey({ columns: [t.versionId, t.mediaId, t.role] }), index("page_version_media_media_idx").on(t.mediaId), check("page_version_media_fields_valid", sql`length(btrim(${t.role}))>0 AND ${t.position}>=0`)]);
export const redirects = pgTable("redirects", {
  id: id(), sourcePath: text("source_path").notNull().unique(), targetPath: text("target_path").notNull(), statusCode: integer("status_code").notNull().default(301), active: boolean("active").notNull().default(false),
}, t => [check("redirects_fields_valid", sql`left(${t.sourcePath},1)='/' AND left(${t.sourcePath},2)<>'//' AND left(${t.targetPath},1)='/' AND left(${t.targetPath},2)<>'//' AND ${t.sourcePath}<>${t.targetPath} AND ${t.statusCode} IN (301,302,307,308)`)]);
