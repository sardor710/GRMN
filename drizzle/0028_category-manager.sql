-- Migration 0028 (owner 2026-11-22, additive): category manager.
--   category_translations      RU/KK names (English stays in categories.name)
--   category_menu_placements   ordered Products group of a top menu item; one category may sit under several items
--   categories.menu_href       fixed link of a top menu item (Sports & Fitness opens Running)
--   product_compatibility_types live device → accessory category/type links (new accessories filed under the type fit)
-- Older images ignore all of it. Placements and translations bump the taxonomy epoch like categories do.
CREATE TABLE "category_menu_placements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_category_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"href" text,
	"label" jsonb,
	CONSTRAINT "category_menu_placements_unique" UNIQUE("menu_category_id","category_id"),
	CONSTRAINT "category_menu_placements_position_valid" CHECK ("category_menu_placements"."position">=0),
	CONSTRAINT "category_menu_placements_label_valid" CHECK ("category_menu_placements"."label" IS NULL OR (jsonb_typeof("category_menu_placements"."label")='object' AND ("category_menu_placements"."label" - 'en' - 'ru' - 'kk')='{}'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "category_translations" (
	"category_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "category_translations_category_id_locale_pk" PRIMARY KEY("category_id","locale"),
	CONSTRAINT "category_translations_locale_valid" CHECK ("category_translations"."locale" IN ('ru','kk')),
	CONSTRAINT "category_translations_name_present" CHECK (length(btrim("category_translations"."name"))>0)
);
--> statement-breakpoint
CREATE TABLE "product_compatibility_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_product_id" uuid NOT NULL,
	"device_option_value_id" uuid,
	"category_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_compatibility_types_position_valid" CHECK ("product_compatibility_types"."position">=0)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "menu_href" text;--> statement-breakpoint
ALTER TABLE "category_menu_placements" ADD CONSTRAINT "category_menu_placements_menu_category_id_categories_id_fk" FOREIGN KEY ("menu_category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_menu_placements" ADD CONSTRAINT "category_menu_placements_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compatibility_types" ADD CONSTRAINT "product_compatibility_types_device_product_id_products_id_fk" FOREIGN KEY ("device_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compatibility_types" ADD CONSTRAINT "product_compatibility_types_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_compatibility_types" ADD CONSTRAINT "product_compatibility_types_option_value_fk" FOREIGN KEY ("device_option_value_id","device_product_id") REFERENCES "public"."option_values"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_menu_placements_menu_idx" ON "category_menu_placements" USING btree ("menu_category_id","position");--> statement-breakpoint
CREATE INDEX "category_menu_placements_category_idx" ON "category_menu_placements" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_compatibility_types_unique" ON "product_compatibility_types" USING btree ("device_product_id",coalesce("device_option_value_id",'00000000-0000-0000-0000-000000000000'::uuid),"category_id");--> statement-breakpoint
CREATE INDEX "product_compatibility_types_category_idx" ON "product_compatibility_types" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "product_compatibility_types_option_value_idx" ON "product_compatibility_types" USING btree ("device_option_value_id") WHERE "product_compatibility_types"."device_option_value_id" IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER category_translations_taxonomy_lock BEFORE INSERT OR UPDATE OR DELETE ON category_translations FOR EACH STATEMENT EXECUTE FUNCTION catalog_lock_taxonomy();
--> statement-breakpoint
CREATE TRIGGER category_menu_placements_taxonomy_lock BEFORE INSERT OR UPDATE OR DELETE ON category_menu_placements FOR EACH STATEMENT EXECUTE FUNCTION catalog_lock_taxonomy();
--> statement-breakpoint
CREATE FUNCTION catalog_check_compatibility_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    WITH RECURSIVE up AS (
      SELECT c.id,c.parent_id,c.kind,0 AS depth FROM categories c WHERE c.id=NEW.category_id
      UNION ALL SELECT c.id,c.parent_id,c.kind,up.depth+1 FROM categories c JOIN up ON c.id=up.parent_id WHERE up.depth<20
    ) SELECT 1 FROM up WHERE kind='accessory'
  ) THEN
    RAISE EXCEPTION 'A compatibility type must be an accessory category or a type inside one' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_compatibility_types_category_valid BEFORE INSERT OR UPDATE OF category_id ON product_compatibility_types FOR EACH ROW EXECUTE FUNCTION catalog_check_compatibility_type();
