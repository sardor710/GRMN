CREATE SEQUENCE "public"."order_number_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000001 CACHE 1;--> statement-breakpoint
CREATE TABLE "cart_items" (
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_id_variant_id_pk" PRIMARY KEY("cart_id","variant_id"),
	CONSTRAINT "cart_items_quantity_valid" CHECK ("cart_items"."quantity" BETWEEN 1 AND 99)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"guest_token_hash" text,
	"market" text DEFAULT 'default' NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"line_epoch" bigint DEFAULT 0 NOT NULL,
	"merged_into_cart_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_guest_token_hash_unique" UNIQUE("guest_token_hash"),
	CONSTRAINT "carts_actor_valid" CHECK (("carts"."user_id" IS NOT NULL AND "carts"."guest_token_hash" IS NULL) OR ("carts"."user_id" IS NULL AND "carts"."guest_token_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "carts_actor_present" CHECK ("carts"."user_id" IS NOT NULL OR "carts"."guest_token_hash" IS NOT NULL),
	CONSTRAINT "carts_fields_valid" CHECK ("carts"."currency"='KZT' AND length(btrim("carts"."market"))>0 AND "carts"."version">0 AND "carts"."line_epoch">=0 AND "carts"."expires_at">"carts"."created_at" AND "carts"."status" IN ('active','converted','merged','expired')),
	CONSTRAINT "carts_merge_valid" CHECK (("carts"."status"='merged' AND "carts"."merged_into_cart_id" IS NOT NULL AND "carts"."merged_into_cart_id"<>"carts"."id") OR ("carts"."status"<>'merged' AND "carts"."merged_into_cart_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "checkout_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"cart_version" integer NOT NULL,
	"quote_id" uuid NOT NULL,
	"actor_scope" text NOT NULL,
	"operation" text DEFAULT 'checkout' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_attempts_fields_valid" CHECK ("checkout_attempts"."cart_version">0 AND length(btrim("checkout_attempts"."actor_scope"))>0 AND "checkout_attempts"."operation"='checkout' AND "checkout_attempts"."idempotency_key" ~ '^[ -~]{16,128}$' AND "checkout_attempts"."request_hash" ~ '^[0-9a-f]{64}$' AND "checkout_attempts"."status" IN ('pending','committed','failed'))
);
--> statement-breakpoint
CREATE TABLE "checkout_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"cart_version" integer NOT NULL,
	"cart_hash" text,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"display_currency" text DEFAULT 'KZT' NOT NULL,
	"contact_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lines_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usd_snapshot" jsonb,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"shipping_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_quotes_revision_unique" UNIQUE("id","cart_id","cart_version"),
	CONSTRAINT "checkout_quotes_amounts_valid" CHECK ("checkout_quotes"."subtotal_minor">=0 AND "checkout_quotes"."discount_minor" BETWEEN 0 AND "checkout_quotes"."subtotal_minor" AND "checkout_quotes"."shipping_minor">=0 AND "checkout_quotes"."tax_minor">=0 AND "checkout_quotes"."total_minor"="checkout_quotes"."subtotal_minor"-"checkout_quotes"."discount_minor"+"checkout_quotes"."shipping_minor"+"checkout_quotes"."tax_minor"),
	CONSTRAINT "checkout_quotes_fields_valid" CHECK ("checkout_quotes"."currency"='KZT' AND "checkout_quotes"."display_currency" IN ('KZT','USD') AND "checkout_quotes"."cart_version">0 AND "checkout_quotes"."expires_at">"checkout_quotes"."created_at" AND ("checkout_quotes"."cart_hash" IS NULL OR "checkout_quotes"."cart_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "checkout_quotes_json_valid" CHECK (jsonb_typeof("checkout_quotes"."contact_snapshot")='object' AND jsonb_typeof("checkout_quotes"."delivery_snapshot")='object' AND jsonb_typeof("checkout_quotes"."lines_snapshot")='array' AND jsonb_typeof("checkout_quotes"."policy_versions")='object' AND ("checkout_quotes"."usd_snapshot" IS NULL OR jsonb_typeof("checkout_quotes"."usd_snapshot")='object'))
);
--> statement-breakpoint
CREATE TABLE "order_access_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"scope" text DEFAULT 'order_status' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_access_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "order_access_tokens_valid" CHECK ("order_access_tokens"."token_hash" ~ '^[0-9a-f]{64}$' AND "order_access_tokens"."scope" IN ('order_status','order_receipt') AND "order_access_tokens"."expires_at">"order_access_tokens"."created_at" AND ("order_access_tokens"."revoked_at" IS NULL OR "order_access_tokens"."revoked_at">="order_access_tokens"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "order_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipient_name" text,
	"phone" text,
	"country_code" text,
	"city" text,
	"line1" text,
	"line2" text,
	"region" text,
	"postal_code" text,
	"legacy_raw" text,
	CONSTRAINT "order_addresses_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "order_addresses_shape_valid" CHECK (("order_addresses"."kind"='structured' AND "order_addresses"."recipient_name" IS NOT NULL AND length(btrim("order_addresses"."recipient_name"))>0 AND "order_addresses"."phone" IS NOT NULL AND length(btrim("order_addresses"."phone"))>0 AND "order_addresses"."country_code" IS NOT NULL AND "order_addresses"."country_code" ~ '^[A-Z]{2}$' AND "order_addresses"."city" IS NOT NULL AND length(btrim("order_addresses"."city"))>0 AND "order_addresses"."line1" IS NOT NULL AND length(btrim("order_addresses"."line1"))>0 AND "order_addresses"."legacy_raw" IS NULL) OR ("order_addresses"."kind"='legacy_unstructured' AND "order_addresses"."legacy_raw" IS NOT NULL AND length(btrim("order_addresses"."legacy_raw"))>0 AND "order_addresses"."recipient_name" IS NULL AND "order_addresses"."phone" IS NULL AND "order_addresses"."country_code" IS NULL AND "order_addresses"."city" IS NULL AND "order_addresses"."line1" IS NULL AND "order_addresses"."line2" IS NULL AND "order_addresses"."region" IS NULL AND "order_addresses"."postal_code" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "order_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"kind" text NOT NULL,
	"code" text,
	"label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "order_adjustments_valid" CHECK ("order_adjustments"."kind" IN ('discount','tax','shipping') AND "order_adjustments"."amount_minor">=0 AND length(btrim("order_adjustments"."label"))>0 AND jsonb_typeof("order_adjustments"."source_snapshot")='object')
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" uuid,
	"dedupe_key" text NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"occurred_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "order_events_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "order_events_valid" CHECK (length(btrim("order_events"."type"))>0 AND length(btrim("order_events"."source"))>0 AND length(btrim("order_events"."dedupe_key"))>0 AND "order_events"."visibility" IN ('internal','customer') AND jsonb_typeof("order_events"."payload")='object')
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"product_key" text,
	"sku" text,
	"name" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_source" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	CONSTRAINT "order_items_identity_variant_unique" UNIQUE("id","variant_id"),
	CONSTRAINT "order_items_identity_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "order_items_fields_valid" CHECK ("order_items"."quantity">0 AND length(btrim("order_items"."name"))>0 AND ("order_items"."variant_id" IS NULL OR "order_items"."product_id" IS NOT NULL) AND jsonb_typeof("order_items"."options")='object' AND jsonb_typeof("order_items"."legacy_source")='object'),
	CONSTRAINT "order_items_amounts_valid" CHECK ("order_items"."unit_price_minor">=0 AND "order_items"."discount_minor" BETWEEN 0 AND "order_items"."unit_price_minor"::numeric*"order_items"."quantity" AND "order_items"."tax_minor">=0 AND "order_items"."total_minor"::numeric="order_items"."unit_price_minor"::numeric*"order_items"."quantity"-"order_items"."discount_minor"+"order_items"."tax_minor")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_number" text DEFAULT 'GRM-' || nextval('order_number_sequence')::text NOT NULL,
	"checkout_attempt_id" uuid,
	"user_id" uuid,
	"profile_id" uuid,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"data_quality" text DEFAULT 'complete' NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"subtotal_minor" bigint,
	"discount_minor" bigint,
	"shipping_minor" bigint,
	"tax_minor" bigint,
	"shipping_tax_minor" bigint,
	"total_minor" bigint NOT NULL,
	"usd_snapshot" jsonb,
	"policy_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"order_status" text DEFAULT 'pending_payment' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"fulfillment_status" text DEFAULT 'unfulfilled' NOT NULL,
	"payment_mode" text DEFAULT 'demo' NOT NULL,
	"snapshot_sealed" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"placed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_checkout_attempt_id_unique" UNIQUE("checkout_attempt_id"),
	CONSTRAINT "orders_attempt_identity_unique" UNIQUE("id","checkout_attempt_id"),
	CONSTRAINT "orders_fields_valid" CHECK (length(btrim("orders"."order_number"))>0 AND length(btrim("orders"."contact_name"))>0 AND "orders"."currency"='KZT' AND "orders"."data_quality" IN ('complete','legacy_incomplete') AND "orders"."version">0),
	CONSTRAINT "orders_statuses_valid" CHECK ("orders"."order_status" IN ('pending_payment','confirmed','cancel_requested','cancelled','closed') AND "orders"."payment_status" IN ('unpaid','pending','authorized','paid','partially_refunded','refunded','failed') AND "orders"."fulfillment_status" IN ('unfulfilled','processing','partially_shipped','shipped','delivered','exception') AND "orders"."payment_mode" IN ('demo','live','legacy_unknown')),
	CONSTRAINT "orders_amounts_valid" CHECK ("orders"."total_minor">=0 AND ("orders"."subtotal_minor" IS NULL OR "orders"."subtotal_minor">=0) AND ("orders"."discount_minor" IS NULL OR "orders"."discount_minor">=0) AND ("orders"."shipping_minor" IS NULL OR "orders"."shipping_minor">=0) AND ("orders"."tax_minor" IS NULL OR "orders"."tax_minor">=0) AND ("orders"."shipping_tax_minor" IS NULL OR "orders"."shipping_tax_minor" BETWEEN 0 AND "orders"."tax_minor") AND ("orders"."subtotal_minor" IS NULL OR "orders"."discount_minor" IS NULL OR "orders"."discount_minor"<="orders"."subtotal_minor")),
	CONSTRAINT "orders_complete_fields" CHECK ("orders"."data_quality"<>'complete' OR ("orders"."contact_phone" IS NOT NULL AND length(btrim("orders"."contact_phone"))>0 AND "orders"."placed_at" IS NOT NULL AND "orders"."subtotal_minor" IS NOT NULL AND "orders"."discount_minor" IS NOT NULL AND "orders"."shipping_minor" IS NOT NULL AND "orders"."tax_minor" IS NOT NULL AND "orders"."total_minor"="orders"."subtotal_minor"-"orders"."discount_minor"+"orders"."shipping_minor"+"orders"."tax_minor")),
	CONSTRAINT "orders_json_valid" CHECK (jsonb_typeof("orders"."policy_versions")='object' AND jsonb_typeof("orders"."legacy_summary")='object' AND ("orders"."usd_snapshot" IS NULL OR jsonb_typeof("orders"."usd_snapshot")='object'))
);
--> statement-breakpoint
CREATE TABLE "inventory_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"reservation_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"restored_quantity" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_allocations_reservation_line_id_unique" UNIQUE("reservation_line_id"),
	CONSTRAINT "inventory_allocations_valid" CHECK ("inventory_allocations"."quantity">0 AND "inventory_allocations"."restored_quantity" BETWEEN 0 AND "inventory_allocations"."quantity" AND "inventory_allocations"."version">0)
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_variant_id_location_id_pk" PRIMARY KEY("variant_id","location_id"),
	CONSTRAINT "inventory_balances_counts_valid" CHECK ("inventory_balances"."on_hand">=0 AND "inventory_balances"."reserved" BETWEEN 0 AND "inventory_balances"."on_hand" AND "inventory_balances"."version">0)
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_attempt_id" uuid NOT NULL,
	"order_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_valid" CHECK ("inventory_reservations"."version">0 AND "inventory_reservations"."expires_at">"inventory_reservations"."created_at" AND (("inventory_reservations"."status"='active' AND "inventory_reservations"."ended_at" IS NULL) OR ("inventory_reservations"."status" IN ('consumed','released','expired') AND "inventory_reservations"."ended_at" IS NOT NULL AND "inventory_reservations"."ended_at">="inventory_reservations"."created_at")))
);
--> statement-breakpoint
CREATE TABLE "reservation_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reservation_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "reservation_lines_identity_stock_unique" UNIQUE("id","variant_id","location_id","quantity"),
	CONSTRAINT "reservation_lines_quantity_valid" CHECK ("reservation_lines"."quantity">0)
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_locations_key_unique" UNIQUE("key"),
	CONSTRAINT "stock_locations_fields_valid" CHECK (length(btrim("stock_locations"."key"))>0 AND length(btrim("stock_locations"."name"))>0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"delta_on_hand" integer NOT NULL,
	"delta_reserved" integer NOT NULL,
	"reason" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"source_reference" text,
	"reservation_line_id" uuid,
	"allocation_id" uuid,
	"actor_user_id" uuid,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "stock_movements_valid" CHECK (("stock_movements"."delta_on_hand"<>0 OR "stock_movements"."delta_reserved"<>0) AND "stock_movements"."reason" IN ('receive','adjust','reserve','release','consume','compensate','return') AND length(btrim("stock_movements"."dedupe_key"))>0)
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_merged_into_cart_id_carts_id_fk" FOREIGN KEY ("merged_into_cart_id") REFERENCES "public"."carts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_quote_id_cart_id_cart_version_checkout_quotes_id_cart_id_cart_version_fk" FOREIGN KEY ("quote_id","cart_id","cart_version") REFERENCES "public"."checkout_quotes"("id","cart_id","cart_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_access_tokens" ADD CONSTRAINT "order_access_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_item_id_order_id_order_items_id_order_id_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_id_product_variants_id_product_id_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_attempt_id_checkout_attempts_id_fk" FOREIGN KEY ("checkout_attempt_id") REFERENCES "public"."checkout_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_profile_id_customer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_order_item_id_variant_id_order_items_id_variant_id_fk" FOREIGN KEY ("order_item_id","variant_id") REFERENCES "public"."order_items"("id","variant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_variant_id_location_id_inventory_balances_variant_id_location_id_fk" FOREIGN KEY ("variant_id","location_id") REFERENCES "public"."inventory_balances"("variant_id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_reservation_line_id_variant_id_location_id_quantity_reservation_lines_id_variant_id_location_id_quantity_fk" FOREIGN KEY ("reservation_line_id","variant_id","location_id","quantity") REFERENCES "public"."reservation_lines"("id","variant_id","location_id","quantity") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_checkout_attempt_id_checkout_attempts_id_fk" FOREIGN KEY ("checkout_attempt_id") REFERENCES "public"."checkout_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_checkout_attempt_id_orders_id_checkout_attempt_id_fk" FOREIGN KEY ("order_id","checkout_attempt_id") REFERENCES "public"."orders"("id","checkout_attempt_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_reservation_id_inventory_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_variant_id_location_id_inventory_balances_variant_id_location_id_fk" FOREIGN KEY ("variant_id","location_id") REFERENCES "public"."inventory_balances"("variant_id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reservation_line_id_reservation_lines_id_fk" FOREIGN KEY ("reservation_line_id") REFERENCES "public"."reservation_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_allocation_id_inventory_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."inventory_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_location_id_inventory_balances_variant_id_location_id_fk" FOREIGN KEY ("variant_id","location_id") REFERENCES "public"."inventory_balances"("variant_id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_variant_idx" ON "cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_active_user_unique" ON "carts" USING btree ("user_id","market","currency") WHERE "carts"."status"='active' AND "carts"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "carts_expiry_idx" ON "carts" USING btree ("expires_at","id") WHERE "carts"."status"='active';--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_key_unique" ON "checkout_attempts" USING btree ("actor_scope","operation","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_attempts_revision_winner_unique" ON "checkout_attempts" USING btree ("cart_id","cart_version") WHERE "checkout_attempts"."status"<>'failed';--> statement-breakpoint
CREATE INDEX "checkout_quotes_cart_idx" ON "checkout_quotes" USING btree ("cart_id","cart_version");--> statement-breakpoint
CREATE INDEX "checkout_quotes_expiry_idx" ON "checkout_quotes" USING btree ("expires_at","id");--> statement-breakpoint
CREATE INDEX "order_access_tokens_order_idx" ON "order_access_tokens" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_access_tokens_expiry_idx" ON "order_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "order_adjustments_order_idx" ON "order_adjustments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_adjustments_item_idx" ON "order_adjustments" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "order_events_history_idx" ON "order_events" USING btree ("order_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "order_events_actor_idx" ON "order_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id","id");--> statement-breakpoint
CREATE INDEX "order_items_catalog_idx" ON "order_items" USING btree ("product_id","variant_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_customer_history_idx" ON "orders" USING btree ("user_id","placed_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_profile_idx" ON "orders" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "orders_fulfillment_queue_idx" ON "orders" USING btree ("fulfillment_status","placed_at","id");--> statement-breakpoint
CREATE INDEX "orders_payment_queue_idx" ON "orders" USING btree ("payment_status","placed_at","id");--> statement-breakpoint
CREATE INDEX "inventory_allocations_item_idx" ON "inventory_allocations" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "inventory_allocations_stock_idx" ON "inventory_allocations" USING btree ("variant_id","location_id");--> statement-breakpoint
CREATE INDEX "inventory_balances_location_idx" ON "inventory_balances" USING btree ("location_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_active_unique" ON "inventory_reservations" USING btree ("checkout_attempt_id") WHERE "inventory_reservations"."status"='active';--> statement-breakpoint
CREATE INDEX "inventory_reservations_expiry_idx" ON "inventory_reservations" USING btree ("expires_at","id") WHERE "inventory_reservations"."status"='active';--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_idx" ON "inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_lines_stock_unique" ON "reservation_lines" USING btree ("reservation_id","variant_id","location_id");--> statement-breakpoint
CREATE INDEX "reservation_lines_balance_idx" ON "reservation_lines" USING btree ("variant_id","location_id");--> statement-breakpoint
CREATE INDEX "stock_movements_ledger_idx" ON "stock_movements" USING btree ("variant_id","location_id","created_at","id");--> statement-breakpoint
CREATE INDEX "stock_movements_reservation_idx" ON "stock_movements" USING btree ("reservation_line_id");--> statement-breakpoint
CREATE INDEX "stock_movements_allocation_idx" ON "stock_movements" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "stock_movements_actor_idx" ON "stock_movements" USING btree ("actor_user_id");
--> statement-breakpoint
-- Custom guards below are intentionally retained alongside generated DDL.
CREATE FUNCTION commerce_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable commerce history' USING ERRCODE='23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER checkout_quotes_immutable BEFORE UPDATE OR DELETE ON checkout_quotes FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER checkout_quotes_no_truncate BEFORE TRUNCATE ON checkout_quotes FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_truncate BEFORE TRUNCATE ON stock_movements FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER order_events_immutable BEFORE UPDATE OR DELETE ON order_events FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER order_events_no_truncate BEFORE TRUNCATE ON order_events FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION commerce_lock_cart_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_cart uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.cart_id IS DISTINCT FROM OLD.cart_id OR NEW.variant_id IS DISTINCT FROM OLD.variant_id) THEN
    RAISE EXCEPTION 'Cart line ownership is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN v_cart:=OLD.cart_id; ELSE v_cart:=NEW.cart_id; END IF;
  UPDATE carts SET line_epoch=line_epoch+1 WHERE id=v_cart;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown cart' USING ERRCODE='23503'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cart_items_lock BEFORE INSERT OR UPDATE OR DELETE ON cart_items FOR EACH ROW EXECUTE FUNCTION commerce_lock_cart_lines();
--> statement-breakpoint
CREATE FUNCTION commerce_check_cart_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM cart_items WHERE cart_id=NEW.cart_id)>100 THEN
    RAISE EXCEPTION 'Cart exceeds 100 lines' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER cart_items_limit AFTER INSERT ON cart_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commerce_check_cart_limit();
--> statement-breakpoint
CREATE FUNCTION commerce_guard_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at']) OR
     (OLD.status<>'pending' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Checkout identity and terminal result are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.status='failed' AND EXISTS(SELECT 1 FROM orders WHERE checkout_attempt_id=OLD.id) THEN
    RAISE EXCEPTION 'An order already consumed this checkout' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER checkout_attempts_guard BEFORE UPDATE ON checkout_attempts FOR EACH ROW EXECUTE FUNCTION commerce_guard_attempt();
--> statement-breakpoint
CREATE TRIGGER checkout_attempts_no_delete BEFORE DELETE ON checkout_attempts FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER checkout_attempts_no_truncate BEFORE TRUNCATE ON checkout_attempts FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION commerce_guard_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.snapshot_sealed THEN RAISE EXCEPTION 'Order must validate snapshots before sealing' USING ERRCODE='23514'; END IF;
  ELSE
    IF (to_jsonb(NEW)-ARRAY['user_id','profile_id','order_status','payment_status','fulfillment_status','version','updated_at','snapshot_sealed']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['user_id','profile_id','order_status','payment_status','fulfillment_status','version','updated_at','snapshot_sealed']) OR
       (OLD.snapshot_sealed AND NOT NEW.snapshot_sealed) OR
       (NEW.snapshot_sealed IS DISTINCT FROM OLD.snapshot_sealed AND pg_trigger_depth()<=1) THEN
      RAISE EXCEPTION 'Order purchase snapshot is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER orders_snapshot_guard BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION commerce_guard_order();
--> statement-breakpoint
CREATE TRIGGER orders_no_delete BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER orders_no_truncate BEFORE TRUNCATE ON orders FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION commerce_guard_snapshot_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_sealed boolean;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Order snapshot rows are immutable' USING ERRCODE='23514'; END IF;
  SELECT snapshot_sealed INTO v_sealed FROM orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown order' USING ERRCODE='23503'; END IF;
  IF v_sealed THEN RAISE EXCEPTION 'Order snapshot is already sealed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_addresses_guard BEFORE INSERT OR UPDATE OR DELETE ON order_addresses FOR EACH ROW EXECUTE FUNCTION commerce_guard_snapshot_child();
--> statement-breakpoint
CREATE TRIGGER order_items_guard BEFORE INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION commerce_guard_snapshot_child();
--> statement-breakpoint
CREATE TRIGGER order_adjustments_guard BEFORE INSERT OR UPDATE OR DELETE ON order_adjustments FOR EACH ROW EXECUTE FUNCTION commerce_guard_snapshot_child();
--> statement-breakpoint
CREATE TRIGGER order_addresses_no_truncate BEFORE TRUNCATE ON order_addresses FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER order_items_no_truncate BEFORE TRUNCATE ON order_items FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER order_adjustments_no_truncate BEFORE TRUNCATE ON order_adjustments FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION commerce_seal_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_order orders%ROWTYPE; v_count bigint; v_subtotal numeric; v_discount numeric; v_tax numeric;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=NEW.id FOR UPDATE;
  IF v_order.snapshot_sealed THEN RETURN NULL; END IF;
  IF v_order.data_quality='complete' THEN
    SELECT count(*),coalesce(sum(unit_price_minor::numeric*quantity),0),coalesce(sum(discount_minor),0),coalesce(sum(tax_minor),0)
      INTO v_count,v_subtotal,v_discount,v_tax FROM order_items WHERE order_id=NEW.id;
    IF v_count=0 OR v_subtotal<>v_order.subtotal_minor OR v_discount<>v_order.discount_minor OR
       v_tax+coalesce(v_order.shipping_tax_minor,0)<>v_order.tax_minor OR
       NOT EXISTS(SELECT 1 FROM order_addresses WHERE order_id=NEW.id AND kind='structured') THEN
      RAISE EXCEPTION 'Order lines, address and totals must reconcile before commit' USING ERRCODE='23514';
    END IF;
  END IF;
  IF v_order.checkout_attempt_id IS NOT NULL THEN
    UPDATE checkout_attempts SET status='committed',updated_at=now()
      WHERE id=v_order.checkout_attempt_id AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Checkout is not pending' USING ERRCODE='23514'; END IF;
  END IF;
  UPDATE orders SET snapshot_sealed=true WHERE id=NEW.id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER orders_seal AFTER INSERT ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commerce_seal_order();
--> statement-breakpoint
CREATE FUNCTION inventory_guard_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'active' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Reservation already ended' USING ERRCODE='23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.checkout_attempt_id IS DISTINCT FROM OLD.checkout_attempt_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR
     (OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id) THEN
    RAISE EXCEPTION 'Reservation ownership is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_reservations_guard BEFORE UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION inventory_guard_reservation();
--> statement-breakpoint
CREATE TRIGGER inventory_reservations_no_delete BEFORE DELETE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER inventory_reservations_no_truncate BEFORE TRUNCATE ON inventory_reservations FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION inventory_guard_reservation_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Reservation lines are immutable' USING ERRCODE='23514'; END IF;
  SELECT status INTO v_status FROM inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reservation' USING ERRCODE='23503'; END IF;
  IF v_status<>'active' THEN RAISE EXCEPTION 'Cannot extend ended reservation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reservation_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON reservation_lines FOR EACH ROW EXECUTE FUNCTION inventory_guard_reservation_line();
--> statement-breakpoint
CREATE TRIGGER reservation_lines_no_truncate BEFORE TRUNCATE ON reservation_lines FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION inventory_guard_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_order uuid; v_reservation uuid; v_status text; v_reserved_order uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['restored_quantity','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['restored_quantity','version']) OR NEW.restored_quantity<OLD.restored_quantity THEN
      RAISE EXCEPTION 'Allocation identity and restoration history are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT order_id INTO v_order FROM order_items WHERE id=NEW.order_item_id;
  SELECT reservation_id INTO v_reservation FROM reservation_lines WHERE id=NEW.reservation_line_id;
  SELECT status,order_id INTO v_status,v_reserved_order FROM inventory_reservations WHERE id=v_reservation FOR UPDATE;
  IF v_status IS DISTINCT FROM 'consumed' OR v_reserved_order IS DISTINCT FROM v_order OR v_order IS NULL THEN
    RAISE EXCEPTION 'Allocation requires consumed reservation for this order' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_allocations_guard BEFORE INSERT OR UPDATE ON inventory_allocations FOR EACH ROW EXECUTE FUNCTION inventory_guard_allocation();
--> statement-breakpoint
CREATE TRIGGER inventory_allocations_no_delete BEFORE DELETE ON inventory_allocations FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER inventory_allocations_no_truncate BEFORE TRUNCATE ON inventory_allocations FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION inventory_guard_movement_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reservation_line_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reservation_lines WHERE id=NEW.reservation_line_id AND variant_id=NEW.variant_id AND location_id=NEW.location_id) THEN
    RAISE EXCEPTION 'Movement reservation belongs to different stock' USING ERRCODE='23514';
  END IF;
  IF NEW.allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_allocations WHERE id=NEW.allocation_id AND variant_id=NEW.variant_id AND location_id=NEW.location_id) THEN
    RAISE EXCEPTION 'Movement allocation belongs to different stock' USING ERRCODE='23514';
  END IF;
  IF NEW.allocation_id IS NOT NULL AND NEW.reservation_line_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM inventory_allocations WHERE id=NEW.allocation_id AND reservation_line_id=NEW.reservation_line_id
  ) THEN
    RAISE EXCEPTION 'Movement reservation and allocation must share provenance' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_source_guard BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION inventory_guard_movement_source();
