-- Migration 0030 (owner 2026-11-23, additive): product_variants.seo — a variant page's own SEO title/description per
-- language ({en|ru|kk: {title?, description?}}); absent = generated. Older images ignore the column.
ALTER TABLE "product_variants" ADD COLUMN "seo" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_seo_object" CHECK (jsonb_typeof("product_variants"."seo")='object');