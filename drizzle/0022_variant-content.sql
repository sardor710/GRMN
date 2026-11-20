-- Task 2.1 (owner decision 2026-11-19): per-variant Specs (and grouped specs), Overview and In the box,
-- inherit-with-override. A key present in content_overrides is "Own" (even when empty); an absent key
-- inherits the product's block. Additive: existing variants inherit everything.
ALTER TABLE "product_variants" ADD COLUMN "content_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_content_overrides_object" CHECK (jsonb_typeof("product_variants"."content_overrides")='object');
