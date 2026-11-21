-- Migration 0013 (additive): category kinds/slugs/presets, product_compatibility, saved-address
-- map pin and typed in_the_box items. Moved ahead of the generated FKs: product_compatibility's
-- composite device-option FK needs this option_values (id,product_id) key to exist first.
ALTER TABLE "option_values" ADD CONSTRAINT "option_values_id_product_unique" UNIQUE("id","product_id");--> statement-breakpoint
CREATE TABLE "product_compatibility" (
	"id" uuid PRIMARY KEY NOT NULL,
	"accessory_product_id" uuid NOT NULL,
	"accessory_variant_id" uuid,
	"device_product_id" uuid NOT NULL,
	"device_option_value_id" uuid,
	"device_variant_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_compatibility_not_self" CHECK ("product_compatibility"."accessory_product_id"<>"product_compatibility"."device_product_id"),
	CONSTRAINT "product_compatibility_single_device_scope" CHECK ("product_compatibility"."device_option_value_id" IS NULL OR "product_compatibility"."device_variant_id" IS NULL),
	CONSTRAINT "product_compatibility_position_valid" CHECK ("product_compatibility"."position">=0)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "kind" text DEFAULT 'catalog' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "preset_filters" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "nav_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "geo_precision" text;--> statement-breakpoint
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_accessory_product_id_products_id_fk" FOREIGN KEY ("accessory_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_device_product_id_products_id_fk" FOREIGN KEY ("device_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_accessory_variant_fk" FOREIGN KEY ("accessory_variant_id","accessory_product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_device_option_value_fk" FOREIGN KEY ("device_option_value_id","device_product_id") REFERENCES "public"."option_values"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_device_variant_fk" FOREIGN KEY ("device_variant_id","device_product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_compatibility_link_unique" ON "product_compatibility" USING btree ("accessory_product_id",coalesce("accessory_variant_id",'00000000-0000-0000-0000-000000000000'::uuid),"device_product_id",coalesce("device_option_value_id",'00000000-0000-0000-0000-000000000000'::uuid),coalesce("device_variant_id",'00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "product_compatibility_device_idx" ON "product_compatibility" USING btree ("device_product_id","position");--> statement-breakpoint
CREATE INDEX "product_compatibility_accessory_idx" ON "product_compatibility" USING btree ("accessory_product_id","position");--> statement-breakpoint
CREATE INDEX "product_compatibility_accessory_variant_idx" ON "product_compatibility" USING btree ("accessory_variant_id") WHERE "product_compatibility"."accessory_variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_compatibility_device_option_value_idx" ON "product_compatibility" USING btree ("device_option_value_id") WHERE "product_compatibility"."device_option_value_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_compatibility_device_variant_idx" ON "product_compatibility" USING btree ("device_variant_id") WHERE "product_compatibility"."device_variant_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_kind_valid" CHECK ("categories"."kind" IN ('catalog','accessory','group'));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_valid" CHECK ("categories"."slug" IS NULL OR "categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$');--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_preset_filters_object" CHECK (jsonb_typeof("categories"."preset_filters")='object');--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_geo_pair" CHECK (("customer_addresses"."latitude" IS NULL)=("customer_addresses"."longitude" IS NULL));--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_geo_range" CHECK (("customer_addresses"."latitude" IS NULL OR "customer_addresses"."latitude" BETWEEN -90 AND 90) AND ("customer_addresses"."longitude" IS NULL OR "customer_addresses"."longitude" BETWEEN -180 AND 180));--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_geo_precision_valid" CHECK ("customer_addresses"."geo_precision" IS NULL OR ("customer_addresses"."geo_precision" IN ('exact','street','locality','manual') AND "customer_addresses"."latitude" IS NOT NULL));
--> statement-breakpoint
-- Custom SQL (not modeled in the Drizzle snapshot; preserve when appending migrations).
-- in_the_box items: any JSON string (legacy plain text, kept as-is) or an object with exactly the
-- keys label (non-blank string) and optional image (string). products_content_shapes still requires
-- the container to be an array; this function returns false for a non-array so it can stand alone.
CREATE FUNCTION catalog_in_the_box_valid(p_items jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN jsonb_typeof(p_items)<>'array' THEN false ELSE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    -- CASE pins evaluation order (jsonb_object_keys rejects scalars); IS NOT TRUE makes a NULL
    -- result (missing label) count as invalid.
    WHERE (CASE jsonb_typeof(item.value)
      WHEN 'string' THEN true
      WHEN 'object' THEN
        jsonb_typeof(item.value->'label')='string'
        AND length(btrim(item.value->>'label'))>0
        AND (NOT (item.value ? 'image') OR jsonb_typeof(item.value->'image')='string')
        AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(item.value) AS k(name) WHERE k.name NOT IN ('label','image'))
      ELSE false
    END) IS NOT TRUE
  ) END
$$;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_in_the_box_items" CHECK (catalog_in_the_box_valid("in_the_box"));