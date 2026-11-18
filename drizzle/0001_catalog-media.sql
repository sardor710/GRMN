CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"media_id" uuid NOT NULL,
	"alt_text" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_media_position_valid" CHECK ("product_media"."position">=0)
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "activities_key_unique" UNIQUE("key"),
	CONSTRAINT "activities_fields_present" CHECK (length(btrim("activities"."key"))>0 AND length(btrim("activities"."name"))>0)
);
--> statement-breakpoint
CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"data_type" text NOT NULL,
	"unit" text,
	"filterable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "attribute_definitions_key_unique" UNIQUE("key"),
	CONSTRAINT "attribute_definitions_identity_type_unique" UNIQUE("id","data_type"),
	CONSTRAINT "attribute_definitions_fields_valid" CHECK (length(btrim("attribute_definitions"."key"))>0 AND "attribute_definitions"."key"=lower(btrim("attribute_definitions"."key")) AND length(btrim("attribute_definitions"."name"))>0 AND "attribute_definitions"."data_type" IN ('text','number','boolean','enum'))
);
--> statement-breakpoint
CREATE TABLE "attribute_enum_values" (
	"attribute_id" uuid NOT NULL,
	"data_type" text DEFAULT 'enum' NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "attribute_enum_values_attribute_id_key_pk" PRIMARY KEY("attribute_id","key"),
	CONSTRAINT "attribute_enum_values_fields_valid" CHECK ("attribute_enum_values"."data_type"='enum' AND length(btrim("attribute_enum_values"."key"))>0 AND length(btrim("attribute_enum_values"."label"))>0)
);
--> statement-breakpoint
CREATE TABLE "catalog_taxonomy_guard" (
	"id" integer PRIMARY KEY NOT NULL,
	"epoch" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "catalog_taxonomy_guard_singleton" CHECK ("catalog_taxonomy_guard"."id"=1 AND "catalog_taxonomy_guard"."epoch">=0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_key_unique" UNIQUE("key"),
	CONSTRAINT "categories_fields_valid" CHECK (length(btrim("categories"."key"))>0 AND length(btrim("categories"."name"))>0 AND "categories"."position">=0),
	CONSTRAINT "categories_not_self_parent" CHECK ("categories"."parent_id" IS NULL OR "categories"."parent_id"<>"categories"."id")
);
--> statement-breakpoint
CREATE TABLE "option_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "option_values_identity_unique" UNIQUE("id","product_id","option_id"),
	CONSTRAINT "option_values_fields_valid" CHECK (length(btrim("option_values"."key"))>0 AND length(btrim("option_values"."label"))>0 AND "option_values"."position">=0)
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"market" text DEFAULT 'default' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"compare_at_minor" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prices_amounts_valid" CHECK ("prices"."amount_minor">=0 AND ("prices"."compare_at_minor" IS NULL OR "prices"."compare_at_minor">="prices"."amount_minor")),
	CONSTRAINT "prices_currency_market_valid" CHECK ("prices"."currency"='KZT' AND length(btrim("prices"."market"))>0),
	CONSTRAINT "prices_version_valid" CHECK ("prices"."version">=1)
);
--> statement-breakpoint
CREATE TABLE "product_activities" (
	"product_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "product_activities_product_id_activity_id_pk" PRIMARY KEY("product_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "product_attribute_values" (
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"data_type" text NOT NULL,
	"text_value" text,
	"number_value" numeric(20, 6),
	"boolean_value" boolean,
	"enum_value" text,
	CONSTRAINT "product_attribute_values_product_id_attribute_id_pk" PRIMARY KEY("product_id","attribute_id"),
	CONSTRAINT "product_attribute_values_typed_payload" CHECK (("product_attribute_values"."data_type"='text' AND "product_attribute_values"."text_value" IS NOT NULL AND "product_attribute_values"."number_value" IS NULL AND "product_attribute_values"."boolean_value" IS NULL AND "product_attribute_values"."enum_value" IS NULL) OR ("product_attribute_values"."data_type"='number' AND "product_attribute_values"."number_value" IS NOT NULL AND "product_attribute_values"."text_value" IS NULL AND "product_attribute_values"."boolean_value" IS NULL AND "product_attribute_values"."enum_value" IS NULL) OR ("product_attribute_values"."data_type"='boolean' AND "product_attribute_values"."boolean_value" IS NOT NULL AND "product_attribute_values"."text_value" IS NULL AND "product_attribute_values"."number_value" IS NULL AND "product_attribute_values"."enum_value" IS NULL) OR ("product_attribute_values"."data_type"='enum' AND "product_attribute_values"."enum_value" IS NOT NULL AND "product_attribute_values"."text_value" IS NULL AND "product_attribute_values"."number_value" IS NULL AND "product_attribute_values"."boolean_value" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_options_id_product_unique" UNIQUE("id","product_id"),
	CONSTRAINT "product_options_fields_valid" CHECK (length(btrim("product_options"."key"))>0 AND "product_options"."key"=lower(btrim("product_options"."key")) AND length(btrim("product_options"."name"))>0 AND "product_options"."position">=0)
);
--> statement-breakpoint
CREATE TABLE "product_relations" (
	"source_product_id" uuid NOT NULL,
	"target_product_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_relations_source_product_id_target_product_id_relation_type_pk" PRIMARY KEY("source_product_id","target_product_id","relation_type"),
	CONSTRAINT "product_relations_valid" CHECK ("product_relations"."source_product_id"<>"product_relations"."target_product_id" AND "product_relations"."relation_type" IN ('related','compatible_accessory','upsell') AND "product_relations"."position">=0)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text,
	"barcode" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"option_signature" uuid[],
	"weight_grams" integer,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_id_product_unique" UNIQUE("id","product_id"),
	CONSTRAINT "product_variants_sku_present" CHECK (length(btrim("product_variants"."sku"))>0 AND "product_variants"."sku"=btrim("product_variants"."sku")),
	CONSTRAINT "product_variants_status_valid" CHECK ("product_variants"."status" IN ('draft','active','archived')),
	CONSTRAINT "product_variants_measurements_valid" CHECK (("product_variants"."weight_grams" IS NULL OR "product_variants"."weight_grams">0) AND ("product_variants"."length_mm" IS NULL OR "product_variants"."length_mm">0) AND ("product_variants"."width_mm" IS NULL OR "product_variants"."width_mm">0) AND ("product_variants"."height_mm" IS NULL OR "product_variants"."height_mm">0)),
	CONSTRAINT "product_variants_version_valid" CHECK ("product_variants"."version">=1)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"family" text,
	"brand" text,
	"badge" text,
	"price_suffix" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"specs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"in_the_box" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legacy_content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"focus_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canonical_url" text,
	"no_index" boolean DEFAULT false NOT NULL,
	"og_image_source" text,
	"version" integer DEFAULT 1 NOT NULL,
	"configuration_epoch" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_public_key_unique" UNIQUE("public_key"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_public_key_present" CHECK (length(btrim("products"."public_key"))>0 AND "products"."public_key"=btrim("products"."public_key")),
	CONSTRAINT "products_slug_valid" CHECK ("products"."slug" IS NULL OR (length(btrim("products"."slug"))>0 AND "products"."slug"=btrim("products"."slug"))),
	CONSTRAINT "products_name_present" CHECK (length(btrim("products"."name"))>0),
	CONSTRAINT "products_status_valid" CHECK ("products"."status" IN ('draft','published','archived')),
	CONSTRAINT "products_content_shapes" CHECK (jsonb_typeof("products"."specs")='array' AND jsonb_typeof("products"."features")='array' AND jsonb_typeof("products"."in_the_box")='array' AND jsonb_typeof("products"."focus_keywords")='array' AND jsonb_typeof("products"."legacy_content")='object'),
	CONSTRAINT "products_versions_valid" CHECK ("products"."version">=1 AND "products"."configuration_epoch">=0)
);
--> statement-breakpoint
CREATE TABLE "variant_option_values" (
	"variant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"option_value_id" uuid NOT NULL,
	CONSTRAINT "variant_option_values_variant_id_option_id_pk" PRIMARY KEY("variant_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_namespace" text NOT NULL,
	"storage_key" text NOT NULL,
	"source_path" text,
	"kind" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mime_type" text,
	"byte_size" bigint,
	"checksum_sha256" text,
	"width" integer,
	"height" integer,
	"alt_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_present" CHECK (length(btrim("media_assets"."storage_namespace"))>0 AND length(btrim("media_assets"."storage_key"))>0),
	CONSTRAINT "media_assets_kind_valid" CHECK ("media_assets"."kind" IN ('image','video','document','font','other')),
	CONSTRAINT "media_assets_visibility_valid" CHECK ("media_assets"."visibility" IN ('public','private')),
	CONSTRAINT "media_assets_status_valid" CHECK ("media_assets"."status" IN ('pending','ready','quarantined','archived')),
	CONSTRAINT "media_assets_size_valid" CHECK ("media_assets"."byte_size" IS NULL OR "media_assets"."byte_size">=0),
	CONSTRAINT "media_assets_checksum_valid" CHECK ("media_assets"."checksum_sha256" IS NULL OR "media_assets"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "media_assets_dimensions_valid" CHECK (("media_assets"."width" IS NULL AND "media_assets"."height" IS NULL) OR ("media_assets"."width" IS NOT NULL AND "media_assets"."height" IS NOT NULL AND "media_assets"."width">0 AND "media_assets"."height">0)),
	CONSTRAINT "media_assets_ready_metadata" CHECK ("media_assets"."status"<>'ready' OR ("media_assets"."byte_size" IS NOT NULL AND "media_assets"."checksum_sha256" IS NOT NULL AND "media_assets"."mime_type" IS NOT NULL AND length(btrim("media_assets"."mime_type"))>0))
);
--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_product_id_product_variants_id_product_id_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_enum_values" ADD CONSTRAINT "attribute_enum_values_attribute_id_data_type_attribute_definitions_id_data_type_fk" FOREIGN KEY ("attribute_id","data_type") REFERENCES "public"."attribute_definitions"("id","data_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_values" ADD CONSTRAINT "option_values_option_id_product_id_product_options_id_product_id_fk" FOREIGN KEY ("option_id","product_id") REFERENCES "public"."product_options"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_activities" ADD CONSTRAINT "product_activities_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_activities" ADD CONSTRAINT "product_activities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_data_type_attribute_definitions_id_data_type_fk" FOREIGN KEY ("attribute_id","data_type") REFERENCES "public"."attribute_definitions"("id","data_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_enum_value_attribute_enum_values_attribute_id_key_fk" FOREIGN KEY ("attribute_id","enum_value") REFERENCES "public"."attribute_enum_values"("attribute_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_variant_id_product_id_product_variants_id_product_id_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_option_value_id_product_id_option_id_option_values_id_product_id_option_id_fk" FOREIGN KEY ("option_value_id","product_id","option_id") REFERENCES "public"."option_values"("id","product_id","option_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_product_asset_unique" ON "product_media" USING btree ("product_id","media_id") WHERE "product_media"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_variant_asset_unique" ON "product_media" USING btree ("variant_id","media_id") WHERE "product_media"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_primary_product_unique" ON "product_media" USING btree ("product_id") WHERE "product_media"."variant_id" IS NULL AND "product_media"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_primary_variant_unique" ON "product_media" USING btree ("variant_id") WHERE "product_media"."variant_id" IS NOT NULL AND "product_media"."is_primary";--> statement-breakpoint
CREATE INDEX "product_media_media_idx" ON "product_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "product_media_gallery_idx" ON "product_media" USING btree ("product_id","variant_id","position","id");--> statement-breakpoint
CREATE INDEX "categories_parent_order_idx" ON "categories" USING btree ("parent_id","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX "option_values_key_unique" ON "option_values" USING btree ("option_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_active_unique" ON "prices" USING btree ("variant_id","market","currency") WHERE "prices"."is_active";--> statement-breakpoint
CREATE INDEX "prices_variant_history_idx" ON "prices" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "product_activities_activity_idx" ON "product_activities" USING btree ("activity_id","product_id");--> statement-breakpoint
CREATE INDEX "product_attribute_values_lookup_idx" ON "product_attribute_values" USING btree ("attribute_id","enum_value","product_id");--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" USING btree ("category_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_primary_unique" ON "product_categories" USING btree ("product_id") WHERE "product_categories"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_key_unique" ON "product_options" USING btree ("product_id","key");--> statement-breakpoint
CREATE INDEX "product_relations_target_idx" ON "product_relations" USING btree ("target_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_unique" ON "product_variants" USING btree (lower("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_default_unique" ON "product_variants" USING btree ("product_id") WHERE "product_variants"."is_default" AND "product_variants"."status"<>'archived';--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_combination_unique" ON "product_variants" USING btree ("product_id","option_signature") WHERE "product_variants"."status"<>'archived' AND "product_variants"."option_signature" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_variants_product_status_idx" ON "product_variants" USING btree ("product_id","status","id");--> statement-breakpoint
CREATE INDEX "products_published_order_idx" ON "products" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "variant_option_values_value_idx" ON "variant_option_values" USING btree ("option_value_id","product_id","option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_unique" ON "media_assets" USING btree ("storage_namespace","storage_key");
--> statement-breakpoint
-- Internal MVCC serialization row, not a business-data seed.
INSERT INTO catalog_taxonomy_guard (id,epoch) VALUES (1,0);
--> statement-breakpoint
CREATE FUNCTION catalog_configuration_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_product uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      RAISE EXCEPTION 'Catalog ownership is immutable; create a replacement' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='variant_option_values' THEN
      IF NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.option_id IS DISTINCT FROM OLD.option_id THEN
        RAISE EXCEPTION 'Selection ownership is immutable' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN v_product:=OLD.product_id; ELSE v_product:=NEW.product_id; END IF;
  -- A real row update also forces stale REPEATABLE READ writers to serialize/fail.
  UPDATE products SET configuration_epoch=configuration_epoch+1 WHERE id=v_product;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown catalog product' USING ERRCODE='23503'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER catalog_variant_lock BEFORE INSERT OR UPDATE OF product_id,status,is_default OR DELETE ON product_variants FOR EACH ROW EXECUTE FUNCTION catalog_configuration_lock();
--> statement-breakpoint
CREATE TRIGGER catalog_option_lock BEFORE INSERT OR UPDATE OR DELETE ON product_options FOR EACH ROW EXECUTE FUNCTION catalog_configuration_lock();
--> statement-breakpoint
CREATE TRIGGER catalog_value_lock BEFORE INSERT OR UPDATE OR DELETE ON option_values FOR EACH ROW EXECUTE FUNCTION catalog_configuration_lock();
--> statement-breakpoint
CREATE TRIGGER catalog_selection_lock BEFORE INSERT OR UPDATE OR DELETE ON variant_option_values FOR EACH ROW EXECUTE FUNCTION catalog_configuration_lock();
--> statement-breakpoint
CREATE FUNCTION catalog_protect_option_signature() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth()<=1 THEN
    IF TG_OP='INSERT' THEN
      IF NEW.option_signature IS NOT NULL THEN RAISE EXCEPTION 'Option signature is derived' USING ERRCODE='23514'; END IF;
    ELSIF NEW.option_signature IS DISTINCT FROM OLD.option_signature THEN
      RAISE EXCEPTION 'Option signature is derived' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER catalog_signature_readonly BEFORE INSERT OR UPDATE OF option_signature ON product_variants FOR EACH ROW EXECUTE FUNCTION catalog_protect_option_signature();
--> statement-breakpoint
CREATE FUNCTION catalog_rebuild_variant_signature(p_variant uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_product uuid; v_variant record; v_required bigint; v_selected bigint; v_signature uuid[];
BEGIN
  SELECT product_id INTO v_product FROM product_variants WHERE id=p_variant;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) INTO v_required FROM product_options WHERE product_id=v_product;
  -- Deferred callbacks after the first rebuild normally find canonical state.
  IF NOT EXISTS (
    SELECT 1 FROM product_variants v
    CROSS JOIN LATERAL (
      SELECT count(*) AS selected,coalesce(array_agg(option_value_id ORDER BY option_value_id),'{}'::uuid[]) AS signature
      FROM variant_option_values WHERE variant_id=v.id
    ) s
    WHERE v.product_id=v_product AND (
      (v.status='active' AND s.selected<>v_required) OR
      v.option_signature IS DISTINCT FROM CASE WHEN s.selected=v_required THEN s.signature ELSE NULL END
    )
  ) THEN RETURN;
  END IF;
  -- The parent epoch update serializes configuration writers. Clear the old
  -- derived set first so atomic swaps cannot collide with stale signatures.
  UPDATE product_variants SET option_signature=NULL WHERE product_id=v_product AND option_signature IS NOT NULL;
  FOR v_variant IN SELECT id,status FROM product_variants WHERE product_id=v_product ORDER BY id LOOP
    SELECT count(*),coalesce(array_agg(option_value_id ORDER BY option_value_id),'{}'::uuid[])
      INTO v_selected,v_signature FROM variant_option_values WHERE variant_id=v_variant.id;
    IF v_selected<>v_required THEN
      IF v_variant.status='active' THEN RAISE EXCEPTION 'Active variants require every defined option' USING ERRCODE='23514'; END IF;
      v_signature:=NULL;
    END IF;
    UPDATE product_variants SET option_signature=v_signature WHERE id=v_variant.id AND option_signature IS DISTINCT FROM v_signature;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION catalog_signature_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_variant uuid; v_product uuid;
BEGIN
  IF TG_TABLE_NAME='product_variants' THEN
    PERFORM catalog_rebuild_variant_signature(NEW.id);
  ELSIF TG_TABLE_NAME='variant_option_values' THEN
    IF TG_OP='DELETE' THEN v_variant:=OLD.variant_id; ELSE v_variant:=NEW.variant_id; END IF;
    PERFORM catalog_rebuild_variant_signature(v_variant);
  ELSE
    IF TG_OP='DELETE' THEN v_product:=OLD.product_id; ELSE v_product:=NEW.product_id; END IF;
    FOR v_variant IN SELECT id FROM product_variants WHERE product_id=v_product ORDER BY id LOOP
      PERFORM catalog_rebuild_variant_signature(v_variant);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_variant_insert_final AFTER INSERT ON product_variants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_signature_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_variant_status_final AFTER UPDATE ON product_variants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION catalog_signature_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_selection_final AFTER INSERT OR UPDATE OR DELETE ON variant_option_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_signature_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_options_final AFTER INSERT OR UPDATE OR DELETE ON product_options DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_signature_event();
--> statement-breakpoint
CREATE FUNCTION catalog_lock_taxonomy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE catalog_taxonomy_guard SET epoch=epoch+1 WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing taxonomy serialization state' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER catalog_taxonomy_lock BEFORE INSERT OR UPDATE OR DELETE ON categories FOR EACH STATEMENT EXECUTE FUNCTION catalog_lock_taxonomy();
--> statement-breakpoint
CREATE FUNCTION catalog_check_category_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT NEW.parent_id
      UNION
      SELECT c.parent_id FROM categories c JOIN ancestors a ON c.id=a.id WHERE c.parent_id IS NOT NULL
    ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'Category hierarchy cannot contain a cycle' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER catalog_category_cycle BEFORE INSERT OR UPDATE OF parent_id ON categories FOR EACH ROW EXECUTE FUNCTION catalog_check_category_cycle();
