-- Migration 0033_account-pickup-devices (owner 2026-11-26, additive and idempotent): optional customer gender, store
-- pickup (store_settings.pickup_location, orders.fulfillment_method + pickup_snapshot) and warranty months per category
-- and product (null = inherited, default 12). Plan docs/plans/2026-11-26-signup-orders-pickup-devices-xl.md.
-- The live image before this release (1d5e957) ignores every new column, so rolling back needs no down migration.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "warranty_months" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "warranty_months" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fulfillment_method" text DEFAULT 'delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "pickup_location" jsonb DEFAULT '{"enabled":true,"name":{"en":"Garmin showroom","ru":"Шоурум Garmin","kk":"Garmin шоурумы"},"address":{"en":"154 Panfilov St, Almaty","ru":"г. Алматы, ул. Панфилова, 154","kk":"Алматы қ., Панфилов к-сі, 154"},"hours":{"en":"Daily 10:00–19:00","ru":"Ежедневно 10:00–19:00","kk":"Күн сайын 10:00–19:00"},"phone":"","lat":null,"lng":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "gender" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "categories_warranty_months_valid" CHECK ("categories"."warranty_months" IS NULL OR "categories"."warranty_months" BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_warranty_months_valid" CHECK ("products"."warranty_months" IS NULL OR "products"."warranty_months" BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_method_valid" CHECK ("orders"."fulfillment_method" IN ('delivery','pickup') AND ("orders"."fulfillment_method"='delivery' OR "orders"."pickup_snapshot" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_gender_valid" CHECK ("customer_profiles"."gender" IS NULL OR "customer_profiles"."gender" IN ('male','female','unspecified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
