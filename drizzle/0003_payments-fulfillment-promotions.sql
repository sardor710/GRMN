CREATE TABLE "return_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"return_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"shipment_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"accepted_quantity" integer DEFAULT 0 NOT NULL,
	"restocked_quantity" integer DEFAULT 0 NOT NULL,
	"restock_decision" text DEFAULT 'undecided' NOT NULL,
	"restock_location_id" uuid,
	"inspected_at" timestamp with time zone,
	CONSTRAINT "return_items_quantities_valid" CHECK ("return_items"."quantity">0 AND "return_items"."received_quantity" BETWEEN 0 AND "return_items"."quantity" AND "return_items"."accepted_quantity" BETWEEN 0 AND "return_items"."received_quantity" AND "return_items"."restocked_quantity" BETWEEN 0 AND "return_items"."accepted_quantity"),
	CONSTRAINT "return_items_inspection_valid" CHECK ("return_items"."restock_decision" IN ('undecided','restock','quarantine','dispose') AND ("return_items"."accepted_quantity"=0 OR "return_items"."inspected_at" IS NOT NULL) AND ("return_items"."restocked_quantity"=0 OR ("return_items"."restock_decision"='restock' AND "return_items"."inspected_at" IS NOT NULL AND "return_items"."restock_location_id" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"received_at" timestamp with time zone,
	"inspected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "returns_identity_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "returns_fields_valid" CHECK ("returns"."status" IN ('requested','authorized','received','inspected','rejected','cancelled','closed') AND "returns"."version">0 AND length(btrim("returns"."reason"))>0 AND "returns"."idempotency_key" ~ '^[ -~]{16,128}$'),
	CONSTRAINT "returns_times_valid" CHECK (("returns"."status" NOT IN ('received','inspected','closed') OR "returns"."received_at" IS NOT NULL) AND ("returns"."status" NOT IN ('inspected','closed') OR ("returns"."inspected_at" IS NOT NULL AND "returns"."inspected_at">="returns"."received_at")))
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"dedupe_key" text NOT NULL,
	"actor_user_id" uuid,
	"occurred_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"internal_note" text,
	CONSTRAINT "shipment_events_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "shipment_events_fields_valid" CHECK (length(btrim("shipment_events"."type"))>0 AND length(btrim("shipment_events"."source"))>0 AND length(btrim("shipment_events"."dedupe_key"))>0 AND ("shipment_events"."source_event_id" IS NULL OR length(btrim("shipment_events"."source_event_id"))>0))
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"return_epoch" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "shipment_items_identity_item_unique" UNIQUE("id","order_item_id"),
	CONSTRAINT "shipment_items_quantity_valid" CHECK ("shipment_items"."quantity">0 AND "shipment_items"."return_epoch">=0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_namespace" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"carrier" text,
	"tracking_reference" text,
	"internal_notes" text,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_identity_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "shipments_fields_valid" CHECK ("shipments"."mode"='manual' AND "shipments"."version">0 AND length(btrim("shipments"."source_namespace"))>0 AND ("shipments"."external_id" IS NULL OR length(btrim("shipments"."external_id"))>0) AND "shipments"."status" IN ('draft','ready','dispatched','delivered','cancelled')),
	CONSTRAINT "shipments_times_valid" CHECK (("shipments"."status" NOT IN ('dispatched','delivered') OR "shipments"."dispatched_at" IS NOT NULL) AND ("shipments"."status"<>'delivered' OR ("shipments"."delivered_at" IS NOT NULL AND "shipments"."delivered_at">="shipments"."dispatched_at")))
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"merchant_account" text NOT NULL,
	"merchant_reference" text NOT NULL,
	"provider_session_id" text,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_identity_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "payment_attempts_context_valid" CHECK ((("payment_attempts"."provider"='demo' AND "payment_attempts"."environment"='demo') OR ("payment_attempts"."provider" IN ('kaspi','secondary') AND "payment_attempts"."environment" IN ('sandbox','live'))) AND length(btrim("payment_attempts"."merchant_account"))>0 AND length(btrim("payment_attempts"."merchant_reference"))>0 AND ("payment_attempts"."provider_session_id" IS NULL OR length(btrim("payment_attempts"."provider_session_id"))>0)),
	CONSTRAINT "payment_attempts_fields_valid" CHECK ("payment_attempts"."currency"='KZT' AND "payment_attempts"."amount_minor">=0 AND "payment_attempts"."version">0 AND "payment_attempts"."request_hash" ~ '^[0-9a-f]{64}$' AND "payment_attempts"."idempotency_key" ~ '^[ -~]{16,128}$' AND "payment_attempts"."status" IN ('created','pending','requires_action','authorized','unknown','captured','failed','voided','cancelled','superseded','simulated','late_captured'))
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"merchant_account" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"dedupe_key" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refund_epoch" bigint DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "payment_transactions_identity_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "payment_transactions_fields_valid" CHECK ("payment_transactions"."currency"='KZT' AND "payment_transactions"."amount_minor">0 AND "payment_transactions"."provider" IN ('kaspi','secondary') AND "payment_transactions"."environment" IN ('sandbox','live') AND "payment_transactions"."kind" IN ('authorization','capture','void') AND length(btrim("payment_transactions"."external_id"))>0 AND length(btrim("payment_transactions"."merchant_account"))>0 AND length(btrim("payment_transactions"."dedupe_key"))>0 AND jsonb_typeof("payment_transactions"."evidence")='object' AND "payment_transactions"."refund_epoch">=0)
);
--> statement-breakpoint
CREATE TABLE "refund_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"refund_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"kind" text NOT NULL,
	"quantity" integer,
	"net_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "refund_items_shape_valid" CHECK (("refund_items"."kind"='item' AND "refund_items"."order_item_id" IS NOT NULL AND "refund_items"."quantity" IS NOT NULL AND "refund_items"."quantity">0) OR ("refund_items"."kind" IN ('shipping','adjustment') AND "refund_items"."order_item_id" IS NULL AND "refund_items"."quantity" IS NULL)),
	CONSTRAINT "refund_items_amounts_valid" CHECK ("refund_items"."net_minor">=0 AND "refund_items"."discount_minor" BETWEEN 0 AND "refund_items"."net_minor" AND "refund_items"."tax_minor">=0 AND "refund_items"."amount_minor"="refund_items"."net_minor"-"refund_items"."discount_minor"+"refund_items"."tax_minor")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"merchant_account" text NOT NULL,
	"provider_refund_id" text,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_identity_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "refunds_fields_valid" CHECK ("refunds"."currency"='KZT' AND "refunds"."amount_minor">0 AND "refunds"."version">0 AND "refunds"."provider" IN ('kaspi','secondary') AND "refunds"."environment" IN ('sandbox','live') AND length(btrim("refunds"."merchant_account"))>0 AND ("refunds"."provider_refund_id" IS NULL OR length(btrim("refunds"."provider_refund_id"))>0) AND "refunds"."idempotency_key" ~ '^[ -~]{16,128}$' AND "refunds"."request_hash" ~ '^[0-9a-f]{64}$' AND "refunds"."status" IN ('reserved','pending','unknown','succeeded','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "price_adjustment_categories" (
	"rule_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "price_adjustment_categories_rule_id_category_id_pk" PRIMARY KEY("rule_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "price_adjustment_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"fixed_minor" bigint,
	"percentage_bps" integer,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_adjustment_rules_fields_valid" CHECK (length(btrim("price_adjustment_rules"."name"))>0 AND "price_adjustment_rules"."currency"='KZT' AND "price_adjustment_rules"."scope" IN ('all','categories','variants') AND "price_adjustment_rules"."status" IN ('draft','active','archived') AND "price_adjustment_rules"."version">0 AND ("price_adjustment_rules"."starts_at" IS NULL OR "price_adjustment_rules"."ends_at" IS NULL OR "price_adjustment_rules"."ends_at">"price_adjustment_rules"."starts_at")),
	CONSTRAINT "price_adjustment_rules_value_valid" CHECK (("price_adjustment_rules"."kind"='fixed' AND "price_adjustment_rules"."fixed_minor" IS NOT NULL AND "price_adjustment_rules"."fixed_minor">0 AND "price_adjustment_rules"."percentage_bps" IS NULL) OR ("price_adjustment_rules"."kind"='percentage' AND "price_adjustment_rules"."percentage_bps" IS NOT NULL AND "price_adjustment_rules"."percentage_bps" BETWEEN 1 AND 10000 AND "price_adjustment_rules"."fixed_minor" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "price_adjustment_variants" (
	"rule_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	CONSTRAINT "price_adjustment_variants_rule_id_variant_id_pk" PRIMARY KEY("rule_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_categories" (
	"promotion_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "promotion_categories_promotion_id_category_id_pk" PRIMARY KEY("promotion_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"promotion_id" uuid NOT NULL,
	"checkout_attempt_id" uuid NOT NULL,
	"order_id" uuid,
	"user_id" uuid,
	"subject_hash" text,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_redemptions_fields_valid" CHECK ("promotion_redemptions"."amount_minor">=0 AND "promotion_redemptions"."currency"='KZT' AND ("promotion_redemptions"."subject_hash" IS NULL OR "promotion_redemptions"."subject_hash" ~ '^[0-9a-f]{64}$') AND NOT ("promotion_redemptions"."user_id" IS NOT NULL AND "promotion_redemptions"."subject_hash" IS NOT NULL) AND "promotion_redemptions"."expires_at">"promotion_redemptions"."created_at"),
	CONSTRAINT "promotion_redemptions_state_valid" CHECK (("promotion_redemptions"."status"='reserved' AND "promotion_redemptions"."ended_at" IS NULL) OR ("promotion_redemptions"."status" IN ('used','released','expired') AND "promotion_redemptions"."ended_at" IS NOT NULL AND "promotion_redemptions"."ended_at">="promotion_redemptions"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "promotion_variants" (
	"promotion_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	CONSTRAINT "promotion_variants_promotion_id_variant_id_pk" PRIMARY KEY("promotion_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"legacy_code" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"fixed_minor" bigint,
	"percentage_bps" integer,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"minimum_spend_minor" bigint DEFAULT 0 NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"per_customer_limit" integer,
	"legacy_used_count" integer DEFAULT 0 NOT NULL,
	"usage_epoch" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_code_unique" UNIQUE("code"),
	CONSTRAINT "promotions_fields_valid" CHECK (length(btrim("promotions"."code"))>0 AND "promotions"."code"=lower(btrim("promotions"."code")) AND length(btrim("promotions"."name"))>0 AND "promotions"."currency"='KZT' AND "promotions"."minimum_spend_minor">=0 AND "promotions"."status" IN ('draft','active','archived') AND "promotions"."scope" IN ('all','categories','variants') AND "promotions"."version">0 AND "promotions"."usage_epoch">=0),
	CONSTRAINT "promotions_value_valid" CHECK (("promotions"."kind"='fixed' AND "promotions"."fixed_minor" IS NOT NULL AND "promotions"."fixed_minor">0 AND "promotions"."percentage_bps" IS NULL) OR ("promotions"."kind"='percentage' AND "promotions"."percentage_bps" IS NOT NULL AND "promotions"."percentage_bps" BETWEEN 1 AND 10000 AND "promotions"."fixed_minor" IS NULL)),
	CONSTRAINT "promotions_limits_valid" CHECK ("promotions"."legacy_used_count">=0 AND ("promotions"."usage_limit" IS NULL OR "promotions"."usage_limit">0) AND ("promotions"."per_customer_limit" IS NULL OR "promotions"."per_customer_limit">0) AND ("promotions"."starts_at" IS NULL OR "promotions"."ends_at" IS NULL OR "promotions"."ends_at">"promotions"."starts_at"))
);
--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_restock_location_id_stock_locations_id_fk" FOREIGN KEY ("restock_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_order_id_returns_id_order_id_fk" FOREIGN KEY ("return_id","order_id") REFERENCES "public"."returns"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_order_id_order_items_id_order_id_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_shipment_item_id_order_item_id_shipment_items_id_order_item_id_fk" FOREIGN KEY ("shipment_item_id","order_item_id") REFERENCES "public"."shipment_items"("id","order_item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_allocation_id_inventory_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."inventory_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_order_id_shipments_id_order_id_fk" FOREIGN KEY ("shipment_id","order_id") REFERENCES "public"."shipments"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_id_order_id_order_items_id_order_id_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_attempt_id_order_id_payment_attempts_id_order_id_fk" FOREIGN KEY ("attempt_id","order_id") REFERENCES "public"."payment_attempts"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_order_id_refunds_id_order_id_fk" FOREIGN KEY ("refund_id","order_id") REFERENCES "public"."refunds"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_order_item_id_order_id_order_items_id_order_id_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_transaction_id_order_id_payment_transactions_id_order_id_fk" FOREIGN KEY ("transaction_id","order_id") REFERENCES "public"."payment_transactions"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_categories" ADD CONSTRAINT "price_adjustment_categories_rule_id_price_adjustment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."price_adjustment_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_categories" ADD CONSTRAINT "price_adjustment_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_variants" ADD CONSTRAINT "price_adjustment_variants_rule_id_price_adjustment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."price_adjustment_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_variants" ADD CONSTRAINT "price_adjustment_variants_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_checkout_attempt_id_checkout_attempts_id_fk" FOREIGN KEY ("checkout_attempt_id") REFERENCES "public"."checkout_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_order_id_checkout_attempt_id_orders_id_checkout_attempt_id_fk" FOREIGN KEY ("order_id","checkout_attempt_id") REFERENCES "public"."orders"("id","checkout_attempt_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_variants" ADD CONSTRAINT "promotion_variants_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_variants" ADD CONSTRAINT "promotion_variants_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "return_items_shipment_unique" ON "return_items" USING btree ("return_id","shipment_item_id");--> statement-breakpoint
CREATE INDEX "return_items_shipment_idx" ON "return_items" USING btree ("shipment_item_id");--> statement-breakpoint
CREATE INDEX "return_items_order_idx" ON "return_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "return_items_location_idx" ON "return_items" USING btree ("restock_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "returns_request_unique" ON "returns" USING btree ("order_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "returns_queue_idx" ON "returns" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "returns_requester_idx" ON "returns" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_events_source_unique" ON "shipment_events" USING btree ("source","source_event_id") WHERE "shipment_events"."source_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shipment_events_history_idx" ON "shipment_events" USING btree ("shipment_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "shipment_events_actor_idx" ON "shipment_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_items_allocation_unique" ON "shipment_items" USING btree ("shipment_id","allocation_id");--> statement-breakpoint
CREATE INDEX "shipment_items_allocation_idx" ON "shipment_items" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "shipment_items_order_idx" ON "shipment_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_external_unique" ON "shipments" USING btree ("source_namespace","external_id") WHERE "shipments"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_queue_idx" ON "shipments" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_payable_unique" ON "payment_attempts" USING btree ("order_id") WHERE "payment_attempts"."status" IN ('created','pending','requires_action','authorized','unknown');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_session_unique" ON "payment_attempts" USING btree ("provider","environment","merchant_account","provider_session_id") WHERE "payment_attempts"."provider_session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_reference_unique" ON "payment_attempts" USING btree ("provider","environment","merchant_account","merchant_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_key_unique" ON "payment_attempts" USING btree ("provider","environment","merchant_account","idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_external_unique" ON "payment_transactions" USING btree ("provider","environment","merchant_account","kind","external_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_order_idx" ON "payment_transactions" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_attempt_idx" ON "payment_transactions" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "refund_items_refund_idx" ON "refund_items" USING btree ("refund_id");--> statement-breakpoint
CREATE INDEX "refund_items_order_item_idx" ON "refund_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_key_unique" ON "refunds" USING btree ("order_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_unique" ON "refunds" USING btree ("provider","environment","merchant_account","provider_refund_id") WHERE "refunds"."provider_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "refunds_balance_idx" ON "refunds" USING btree ("transaction_id","status");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "price_adjustment_categories_category_idx" ON "price_adjustment_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "price_adjustment_rules_schedule_idx" ON "price_adjustment_rules" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "price_adjustment_variants_variant_idx" ON "price_adjustment_variants" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "promotion_categories_category_idx" ON "promotion_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_redemptions_checkout_unique" ON "promotion_redemptions" USING btree ("promotion_id","checkout_attempt_id");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_subject_idx" ON "promotion_redemptions" USING btree ("promotion_id","user_id","subject_hash","status");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_order_idx" ON "promotion_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_checkout_idx" ON "promotion_redemptions" USING btree ("checkout_attempt_id");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_expiry_idx" ON "promotion_redemptions" USING btree ("expires_at","id") WHERE "promotion_redemptions"."status"='reserved';--> statement-breakpoint
CREATE INDEX "promotion_variants_variant_idx" ON "promotion_variants" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "promotions_schedule_idx" ON "promotions" USING btree ("status","starts_at","ends_at");
--> statement-breakpoint
-- Custom guards are not represented by the Drizzle snapshot; retain them.
CREATE FUNCTION payments_guard_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_mode text; v_amount bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','provider_session_id','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','provider_session_id','version','updated_at']) OR
       (OLD.provider_session_id IS NOT NULL AND NEW.provider_session_id IS DISTINCT FROM OLD.provider_session_id) OR
       (OLD.status NOT IN ('created','pending','requires_action','authorized','unknown') AND NEW.status IN ('created','pending','requires_action','authorized','unknown')) THEN
      RAISE EXCEPTION 'Payment attempt identity cannot be rewritten or reopened' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT payment_mode,total_minor INTO v_mode,v_amount FROM orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payment order' USING ERRCODE='23503'; END IF;
  IF (NEW.provider='demo')<>(v_mode='demo') OR NEW.amount_minor<>v_amount OR
     (NEW.provider='demo' AND NEW.status NOT IN ('created','pending','simulated','failed','cancelled')) THEN
    RAISE EXCEPTION 'Payment attempt mode or amount does not match its order' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payment_attempts_guard BEFORE INSERT OR UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION payments_guard_attempt();
--> statement-breakpoint
CREATE FUNCTION payments_guard_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_attempt payment_attempts%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF pg_trigger_depth()<=1 OR (to_jsonb(NEW)-'refund_epoch') IS DISTINCT FROM (to_jsonb(OLD)-'refund_epoch') OR NEW.refund_epoch<OLD.refund_epoch THEN
      RAISE EXCEPTION 'Payment facts are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v_attempt FROM payment_attempts WHERE id=NEW.attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payment attempt' USING ERRCODE='23503'; END IF;
  IF NEW.provider IS DISTINCT FROM v_attempt.provider OR NEW.environment IS DISTINCT FROM v_attempt.environment OR NEW.merchant_account IS DISTINCT FROM v_attempt.merchant_account OR NEW.refund_epoch<>0 THEN
    RAISE EXCEPTION 'Payment transaction context mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payment_transactions_guard BEFORE INSERT OR UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION payments_guard_transaction();
--> statement-breakpoint
CREATE FUNCTION payments_guard_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_capture payment_transactions%ROWTYPE; v_committed numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','provider_refund_id','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','provider_refund_id','version','updated_at']) OR
       (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id) OR
       (OLD.status IN ('succeeded','failed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'Refund request or terminal result is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  UPDATE payment_transactions SET refund_epoch=refund_epoch+1 WHERE id=NEW.transaction_id AND kind='capture' RETURNING * INTO v_capture;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund requires a capture' USING ERRCODE='23514'; END IF;
  IF NEW.provider IS DISTINCT FROM v_capture.provider OR NEW.environment IS DISTINCT FROM v_capture.environment OR NEW.merchant_account IS DISTINCT FROM v_capture.merchant_account OR NEW.amount_minor>v_capture.amount_minor THEN
    RAISE EXCEPTION 'Refund capture context or amount mismatch' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(amount_minor),0) INTO v_committed FROM refunds
    WHERE transaction_id=NEW.transaction_id AND id<>NEW.id AND status IN ('reserved','pending','unknown','succeeded');
  IF NEW.status IN ('reserved','pending','unknown','succeeded') AND v_committed+NEW.amount_minor>v_capture.amount_minor THEN
    RAISE EXCEPTION 'Refund reservations exceed captured cash' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER refunds_guard BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION payments_guard_refund();
--> statement-breakpoint
CREATE FUNCTION payments_guard_refund_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM refunds WHERE id=NEW.refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown refund' USING ERRCODE='23503'; END IF;
  IF v_status<>'reserved' THEN RAISE EXCEPTION 'Refund allocations must precede submission' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER refund_items_guard BEFORE INSERT ON refund_items FOR EACH ROW EXECUTE FUNCTION payments_guard_refund_item();
--> statement-breakpoint
CREATE TRIGGER refund_items_immutable BEFORE UPDATE ON refund_items FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION fulfillment_guard_shipment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_allocation uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' THEN RAISE EXCEPTION 'Shipment begins as a draft' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR
       (OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at) OR
       (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at) THEN
      RAISE EXCEPTION 'Shipment ownership and actual timestamps are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT ((OLD.status='draft' AND NEW.status IN ('ready','cancelled')) OR (OLD.status='ready' AND NEW.status IN ('dispatched','cancelled')) OR (OLD.status='dispatched' AND NEW.status='delivered')) THEN
        RAISE EXCEPTION 'Invalid shipment transition' USING ERRCODE='23514';
      END IF;
      FOR v_allocation IN SELECT allocation_id FROM shipment_items WHERE shipment_id=OLD.id ORDER BY allocation_id LOOP
        UPDATE inventory_allocations SET version=version+1 WHERE id=v_allocation;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipments_guard BEFORE INSERT OR UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION fulfillment_guard_shipment();
--> statement-breakpoint
CREATE FUNCTION fulfillment_guard_shipment_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text; v_allocation inventory_allocations%ROWTYPE; v_claimed bigint; v_returned bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF pg_trigger_depth()<=1 OR (to_jsonb(NEW)-'return_epoch') IS DISTINCT FROM (to_jsonb(OLD)-'return_epoch') OR NEW.return_epoch<OLD.return_epoch THEN
      RAISE EXCEPTION 'Shipment item is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM shipments WHERE id=NEW.shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown shipment' USING ERRCODE='23503'; END IF;
  IF v_status<>'draft' THEN RAISE EXCEPTION 'Shipment items require a draft' USING ERRCODE='23514'; END IF;
  UPDATE inventory_allocations SET version=version+1 WHERE id=NEW.allocation_id RETURNING * INTO v_allocation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown allocation' USING ERRCODE='23503'; END IF;
  IF v_allocation.order_item_id<>NEW.order_item_id THEN RAISE EXCEPTION 'Shipment allocation belongs to another item' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(i.quantity),0) INTO v_claimed FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id
    WHERE i.allocation_id=NEW.allocation_id AND s.status<>'cancelled';
  SELECT coalesce(sum(r.restocked_quantity),0) INTO v_returned FROM return_items r JOIN shipment_items i ON i.id=r.shipment_item_id
    WHERE i.allocation_id=NEW.allocation_id;
  -- Keep the gross cap too: returned stock must never be dispatched again
  -- through its original allocation, even before restoration counters catch up.
  IF v_claimed+NEW.quantity>v_allocation.quantity OR
     v_claimed-v_returned+NEW.quantity>v_allocation.quantity-v_allocation.restored_quantity THEN
    RAISE EXCEPTION 'Shipment claims exceed allocation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipment_items_guard BEFORE INSERT OR UPDATE ON shipment_items FOR EACH ROW EXECUTE FUNCTION fulfillment_guard_shipment_item();
--> statement-breakpoint
CREATE TRIGGER shipment_events_immutable BEFORE UPDATE ON shipment_events FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION fulfillment_guard_return() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'requested' THEN RAISE EXCEPTION 'Return begins as a request' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.created_at IS DISTINCT FROM OLD.created_at OR
       (OLD.received_at IS NOT NULL AND NEW.received_at IS DISTINCT FROM OLD.received_at) OR (OLD.inspected_at IS NOT NULL AND NEW.inspected_at IS DISTINCT FROM OLD.inspected_at) THEN
      RAISE EXCEPTION 'Return ownership and actual evidence are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='requested' AND NEW.status IN ('authorized','rejected','cancelled')) OR
      (OLD.status='authorized' AND NEW.status IN ('received','rejected','cancelled')) OR
      (OLD.status='received' AND NEW.status='inspected') OR (OLD.status='inspected' AND NEW.status='closed')
    ) THEN RAISE EXCEPTION 'Invalid return transition' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER returns_guard BEFORE INSERT OR UPDATE ON returns FOR EACH ROW EXECUTE FUNCTION fulfillment_guard_return();
--> statement-breakpoint
CREATE FUNCTION fulfillment_guard_return_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_return_status text; v_shipment_status text; v_line shipment_items%ROWTYPE; v_claimed bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['received_quantity','accepted_quantity','restocked_quantity','restock_decision','restock_location_id','inspected_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['received_quantity','accepted_quantity','restocked_quantity','restock_decision','restock_location_id','inspected_at']) OR
       NEW.received_quantity<OLD.received_quantity OR NEW.accepted_quantity<OLD.accepted_quantity OR NEW.restocked_quantity<OLD.restocked_quantity OR
       (OLD.inspected_at IS NOT NULL AND NEW.inspected_at IS DISTINCT FROM OLD.inspected_at) OR
       (OLD.restocked_quantity>0 AND (NEW.restock_location_id IS DISTINCT FROM OLD.restock_location_id OR NEW.restock_decision IS DISTINCT FROM OLD.restock_decision)) THEN
      RAISE EXCEPTION 'Return item identity and recorded quantities are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT status INTO v_return_status FROM returns WHERE id=NEW.return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown return' USING ERRCODE='23503'; END IF;
  IF (TG_OP='INSERT' AND v_return_status NOT IN ('requested','authorized')) OR v_return_status IN ('rejected','cancelled') THEN
    RAISE EXCEPTION 'Return is not open for these quantities' USING ERRCODE='23514';
  END IF;
  IF NEW.restocked_quantity>0 AND v_return_status NOT IN ('inspected','closed') THEN
    RAISE EXCEPTION 'Restock requires completed inspection' USING ERRCODE='23514';
  END IF;
  UPDATE shipment_items SET return_epoch=return_epoch+1 WHERE id=NEW.shipment_item_id RETURNING * INTO v_line;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown shipped item' USING ERRCODE='23503'; END IF;
  SELECT status INTO v_shipment_status FROM shipments WHERE id=v_line.shipment_id;
  IF v_shipment_status NOT IN ('dispatched','delivered') THEN RAISE EXCEPTION 'Only dispatched units can be returned' USING ERRCODE='23514'; END IF;
  UPDATE inventory_allocations SET version=version+1 WHERE id=v_line.allocation_id;
  SELECT coalesce(sum(i.quantity),0) INTO v_claimed FROM return_items i JOIN returns r ON r.id=i.return_id
    WHERE i.shipment_item_id=NEW.shipment_item_id AND i.id<>NEW.id AND r.status NOT IN ('rejected','cancelled');
  IF v_claimed+NEW.quantity>v_line.quantity THEN RAISE EXCEPTION 'Return claims exceed shipped quantity' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER return_items_guard BEFORE INSERT OR UPDATE ON return_items FOR EACH ROW EXECUTE FUNCTION fulfillment_guard_return_item();
--> statement-breakpoint
CREATE FUNCTION fulfillment_guard_restoration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_claimed bigint; v_returned bigint;
BEGIN
  IF NEW.restored_quantity>OLD.restored_quantity THEN
    SELECT coalesce(sum(i.quantity),0) INTO v_claimed FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id
      WHERE i.allocation_id=NEW.id AND s.status<>'cancelled';
    SELECT coalesce(sum(r.restocked_quantity),0) INTO v_returned FROM return_items r JOIN shipment_items i ON i.id=r.shipment_item_id
      WHERE i.allocation_id=NEW.id;
    IF NEW.restored_quantity+v_claimed-v_returned>NEW.quantity THEN
      RAISE EXCEPTION 'Restoration overlaps shipment claims without inspected returns' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fulfillment_allocation_restoration BEFORE UPDATE ON inventory_allocations FOR EACH ROW EXECUTE FUNCTION fulfillment_guard_restoration();
--> statement-breakpoint
CREATE FUNCTION promotions_guard_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.legacy_used_count<OLD.legacy_used_count OR (NEW.usage_epoch IS DISTINCT FROM OLD.usage_epoch AND pg_trigger_depth()<=1) THEN
    RAISE EXCEPTION 'Promotion usage evidence cannot be reset' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER promotions_baseline_guard BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION promotions_guard_baseline();
--> statement-breakpoint
CREATE FUNCTION promotions_guard_redemption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_promotion promotions%ROWTYPE; v_global bigint; v_subject bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','ended_at','order_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','ended_at','order_id']) OR
       (OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id) OR
       (OLD.status<>'reserved' AND NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'Redemption identity and terminal usage are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  UPDATE promotions SET usage_epoch=usage_epoch+1 WHERE id=NEW.promotion_id RETURNING * INTO v_promotion;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown promotion' USING ERRCODE='23503'; END IF;
  IF TG_OP='INSERT' AND (NEW.status<>'reserved' OR v_promotion.status<>'active' OR v_promotion.starts_at>now() OR v_promotion.ends_at<=now()) THEN
    RAISE EXCEPTION 'Promotion is not available for a new reservation' USING ERRCODE='23514';
  END IF;
  IF NEW.status IN ('reserved','used') THEN
    SELECT count(*) INTO v_global FROM promotion_redemptions WHERE promotion_id=NEW.promotion_id AND id<>NEW.id AND status IN ('reserved','used');
    IF v_promotion.usage_limit IS NOT NULL AND v_promotion.legacy_used_count::bigint+v_global+1>v_promotion.usage_limit THEN
      RAISE EXCEPTION 'Promotion usage limit reached' USING ERRCODE='23514';
    END IF;
    IF v_promotion.per_customer_limit IS NOT NULL THEN
      IF NEW.user_id IS NULL AND NEW.subject_hash IS NULL THEN RAISE EXCEPTION 'Subject proof required for limited promotion' USING ERRCODE='23514'; END IF;
      SELECT count(*) INTO v_subject FROM promotion_redemptions WHERE promotion_id=NEW.promotion_id AND id<>NEW.id AND status IN ('reserved','used')
        AND user_id IS NOT DISTINCT FROM NEW.user_id AND subject_hash IS NOT DISTINCT FROM NEW.subject_hash;
      IF v_subject+1>v_promotion.per_customer_limit THEN RAISE EXCEPTION 'Promotion subject limit reached' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER promotion_redemptions_guard BEFORE INSERT OR UPDATE ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION promotions_guard_redemption();
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_attempts','payment_transactions','refunds','refund_items','shipments','shipment_items','shipment_events','returns','return_items','promotion_redemptions','promotions','price_adjustment_rules'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation()',t||'_no_delete',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation()',t||'_no_truncate',t);
  END LOOP;
END;
$$;
