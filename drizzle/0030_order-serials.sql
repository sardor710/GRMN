-- Migration 0030_order-serials (owner 2026-11-25, additive): serial number per physical unit, recorded at packing for
-- warranty claims and returns, and the "needs serial" setting on categories and products
-- (plan docs/plans/2026-11-25-order-board-serials-xl.md). Older images ignore the new table and columns.
-- Idempotent on purpose: its journal "when" sits between 0029_traffic-analytics and beta5's 0029_product-code, and
-- beta5 re-applies the same SQL later (no-op where it ran). The starting category settings are written only in the
-- step that first adds categories.serial_policy, so a re-apply never overwrites what the owner chose since.
CREATE TABLE IF NOT EXISTS "order_unit_serials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"shipment_item_id" uuid NOT NULL,
	"unit_index" integer NOT NULL,
	"serial" text NOT NULL,
	"serial_key" text GENERATED ALWAYS AS (upper(regexp_replace(serial,'\s','','g'))) STORED,
	"return_item_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_unit_serials_serial_valid" CHECK ("order_unit_serials"."unit_index">=1 AND "order_unit_serials"."serial"=btrim("order_unit_serials"."serial") AND char_length("order_unit_serials"."serial") BETWEEN 1 AND 64)
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='serial_policy') THEN
    ALTER TABLE "categories" ADD COLUMN "serial_policy" text;
    ALTER TABLE "categories" ADD CONSTRAINT "categories_serial_policy_valid" CHECK ("categories"."serial_policy" IS NULL OR "categories"."serial_policy" IN ('required','none'));
    -- Starting settings (owner: every electronic device needs a serial; bands, cables, chargers and other
    -- non-electronic accessories and digital items don't). Heart-rate monitors and sensors are accessory-kind
    -- categories but electronic, so they are explicitly "needs serial".
    UPDATE "categories" SET "serial_policy"='none' WHERE "key" IN ('bands','dive-bands','marq-straps-bracelets','cables-chargers','apps','subscription-plans',
      'sports-fitness/cycling-biking-accessories','sports-fitness/indoor-training/accessories','wearables-smartwatches-accessories');
    UPDATE "categories" SET "serial_policy"='required' WHERE "key" IN ('heart-rate-monitors','sensors');
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "serial_policy" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_serial_policy_valid" CHECK ("products"."serial_policy" IS NULL OR "products"."serial_policy" IN ('required','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_unit_serials" ADD CONSTRAINT "order_unit_serials_return_item_id_return_items_id_fk" FOREIGN KEY ("return_item_id") REFERENCES "public"."return_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_unit_serials" ADD CONSTRAINT "order_unit_serials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_unit_serials" ADD CONSTRAINT "order_unit_serials_shipment_item_id_order_item_id_shipment_items_id_order_item_id_fk" FOREIGN KEY ("shipment_item_id","order_item_id") REFERENCES "public"."shipment_items"("id","order_item_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_unit_serials" ADD CONSTRAINT "order_unit_serials_order_item_id_order_id_order_items_id_order_id_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_unit_serials_unit_unique" ON "order_unit_serials" USING btree ("shipment_item_id","unit_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_unit_serials_key_idx" ON "order_unit_serials" USING btree ("serial_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_unit_serials_order_idx" ON "order_unit_serials" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_unit_serials_return_idx" ON "order_unit_serials" USING btree ("return_item_id");
