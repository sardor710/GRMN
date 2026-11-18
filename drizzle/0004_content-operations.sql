CREATE TABLE "exchange_rate_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"kzt_per_usd" numeric(20, 8) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"editor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_versions_version_unique" UNIQUE("version"),
	CONSTRAINT "exchange_rate_versions_valid" CHECK ("exchange_rate_versions"."version">0 AND "exchange_rate_versions"."kzt_per_usd">0 AND "exchange_rate_versions"."kzt_per_usd"<>'NaN'::numeric AND "exchange_rate_versions"."source"='manual')
);
--> statement-breakpoint
CREATE TABLE "shipping_policy_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"editor_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_sealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_policy_versions_version_unique" UNIQUE("version"),
	CONSTRAINT "shipping_policy_versions_valid" CHECK ("shipping_policy_versions"."version">0 AND jsonb_typeof("shipping_policy_versions"."metadata")='object')
);
--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"key" text NOT NULL,
	"currency" text DEFAULT 'KZT' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"minimum_subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"maximum_subtotal_minor" bigint,
	"minimum_weight_grams" integer DEFAULT 0 NOT NULL,
	"maximum_weight_grams" integer,
	CONSTRAINT "shipping_rates_values_valid" CHECK (length(btrim("shipping_rates"."key"))>0 AND "shipping_rates"."currency"='KZT' AND "shipping_rates"."amount_minor">=0 AND "shipping_rates"."minimum_subtotal_minor">=0 AND ("shipping_rates"."maximum_subtotal_minor" IS NULL OR "shipping_rates"."maximum_subtotal_minor">="shipping_rates"."minimum_subtotal_minor") AND "shipping_rates"."minimum_weight_grams">=0 AND ("shipping_rates"."maximum_weight_grams" IS NULL OR "shipping_rates"."maximum_weight_grams">="shipping_rates"."minimum_weight_grams"))
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shipping_zones_key_unique" UNIQUE("key"),
	CONSTRAINT "shipping_zones_fields_valid" CHECK (length(btrim("shipping_zones"."key"))>0 AND length(btrim("shipping_zones"."name"))>0 AND jsonb_typeof("shipping_zones"."countries")='array')
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"store_name" text,
	"contact_email" text,
	"support_phone" text,
	"base_currency" text DEFAULT 'KZT' NOT NULL,
	"usd_display_enabled" boolean DEFAULT false NOT NULL,
	"active_exchange_rate_id" uuid,
	"active_shipping_policy_id" uuid,
	"active_tax_configuration_id" uuid,
	"free_shipping_threshold_minor" bigint,
	"maintenance_mode" boolean DEFAULT true NOT NULL,
	"payment_mode" text DEFAULT 'demo' NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"presentation_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "store_settings_valid" CHECK ("store_settings"."id"=1 AND "store_settings"."version">0 AND "store_settings"."base_currency"='KZT' AND (NOT "store_settings"."usd_display_enabled" OR "store_settings"."active_exchange_rate_id" IS NOT NULL) AND ("store_settings"."free_shipping_threshold_minor" IS NULL OR "store_settings"."free_shipping_threshold_minor">=0) AND "store_settings"."payment_mode" IN ('demo','live') AND jsonb_typeof("store_settings"."presentation_config")='object' AND jsonb_typeof("store_settings"."legacy_settings")='object')
);
--> statement-breakpoint
CREATE TABLE "tax_configuration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"mode" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"country_code" text,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"editor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_configuration_version_unique" UNIQUE("version"),
	CONSTRAINT "tax_configuration_fields_valid" CHECK ("tax_configuration"."version">0 AND "tax_configuration"."mode" IN ('inclusive','exclusive') AND "tax_configuration"."rate_bps" BETWEEN 0 AND 10000 AND ("tax_configuration"."country_code" IS NULL OR "tax_configuration"."country_code" ~ '^[A-Z]{2}$') AND jsonb_typeof("tax_configuration"."rules")='object')
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"page_kind" text DEFAULT 'banner' NOT NULL,
	"position" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"image_media_id" uuid,
	"image_source" text,
	CONSTRAINT "banners_fields_valid" CHECK ("banners"."page_kind"='banner' AND length(btrim("banners"."position"))>0 AND "banners"."sort_order">=0)
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"page_kind" text DEFAULT 'blog' NOT NULL,
	"author_label" text,
	"category" text,
	"reading_time" text,
	"source_published_at" timestamp with time zone,
	"cover_media_id" uuid,
	"cover_source" text,
	CONSTRAINT "blog_posts_kind_valid" CHECK ("blog_posts"."page_kind"='blog')
);
--> statement-breakpoint
CREATE TABLE "collection_products" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"presentation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "collection_products_collection_id_product_id_pk" PRIMARY KEY("collection_id","product_id"),
	CONSTRAINT "collection_products_fields_valid" CHECK ("collection_products"."position">=0 AND jsonb_typeof("collection_products"."presentation")='object')
);
--> statement-breakpoint
CREATE TABLE "merchandising_collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "merchandising_collections_key_unique" UNIQUE("key"),
	CONSTRAINT "merchandising_collections_fields_valid" CHECK (length(btrim("merchandising_collections"."key"))>0 AND length(btrim("merchandising_collections"."name"))>0 AND "merchandising_collections"."status" IN ('draft','published','archived') AND "merchandising_collections"."version">0)
);
--> statement-breakpoint
CREATE TABLE "page_publications" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_until" timestamp with time zone,
	CONSTRAINT "page_publications_window_valid" CHECK ("page_publications"."scheduled_until" IS NULL OR "page_publications"."scheduled_until">"page_publications"."published_at")
);
--> statement-breakpoint
CREATE TABLE "page_version_collections" (
	"version_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	CONSTRAINT "page_version_collections_version_id_collection_id_pk" PRIMARY KEY("version_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "page_version_media" (
	"version_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_version_media_version_id_media_id_role_pk" PRIMARY KEY("version_id","media_id","role"),
	CONSTRAINT "page_version_media_fields_valid" CHECK (length(btrim("page_version_media"."role"))>0 AND "page_version_media"."position">=0)
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"page_kind" text NOT NULL,
	"version" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"focus_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canonical_url" text,
	"no_index" boolean DEFAULT false NOT NULL,
	"og_image_source" text,
	"author_user_id" uuid,
	"snapshot_sealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_versions_identity_page_unique" UNIQUE("id","page_id"),
	CONSTRAINT "page_versions_identity_kind_unique" UNIQUE("id","page_id","page_kind"),
	CONSTRAINT "page_versions_fields_valid" CHECK ("page_versions"."version">0 AND "page_versions"."schema_version">0 AND length(btrim("page_versions"."title"))>0 AND jsonb_typeof("page_versions"."blocks")='array' AND jsonb_typeof("page_versions"."metadata")='object' AND jsonb_typeof("page_versions"."legacy_content")='object' AND jsonb_typeof("page_versions"."focus_keywords")='array')
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"publication_epoch" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_identity_kind_unique" UNIQUE("id","kind"),
	CONSTRAINT "pages_fields_valid" CHECK (length(btrim("pages"."key"))>0 AND "pages"."kind" IN ('page','blog','banner','homepage') AND "pages"."status" IN ('draft','published','archived') AND "pages"."version">0 AND "pages"."publication_epoch">=0 AND ("pages"."slug" IS NULL OR (length(btrim("pages"."slug"))>0 AND "pages"."slug"=btrim("pages"."slug"))))
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_path" text NOT NULL,
	"target_path" text NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "redirects_source_path_unique" UNIQUE("source_path"),
	CONSTRAINT "redirects_fields_valid" CHECK (left("redirects"."source_path",1)='/' AND left("redirects"."source_path",2)<>'//' AND left("redirects"."target_path",1)='/' AND left("redirects"."target_path",2)<>'//' AND "redirects"."source_path"<>"redirects"."target_path" AND "redirects"."status_code" IN (301,302,307,308))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"legacy_actor_label" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"legacy_target_label" text,
	"request_id" text,
	"dedupe_key" text NOT NULL,
	"redacted_changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "audit_events_fields_valid" CHECK (length(btrim("audit_events"."action"))>0 AND length(btrim("audit_events"."target_type"))>0 AND length(btrim("audit_events"."dedupe_key"))>0 AND jsonb_typeof("audit_events"."redacted_changes")='object')
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_media_id" uuid,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_jobs_fields_valid" CHECK ("export_jobs"."kind" IN ('orders','customers','catalog','audit') AND "export_jobs"."status" IN ('pending','running','completed','failed','expired') AND jsonb_typeof("export_jobs"."filters")='object' AND "export_jobs"."expires_at">"export_jobs"."created_at" AND ("export_jobs"."status"<>'completed' OR ("export_jobs"."result_media_id" IS NOT NULL AND "export_jobs"."completed_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_scope" text NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_fields_valid" CHECK (length(btrim("idempotency_records"."actor_scope"))>0 AND length(btrim("idempotency_records"."operation"))>0 AND "idempotency_records"."key" ~ '^[ -~]{16,128}$' AND "idempotency_records"."request_hash" ~ '^[0-9a-f]{64}$' AND "idempotency_records"."expires_at">"idempotency_records"."created_at" AND (("idempotency_records"."status"='processing' AND "idempotency_records"."result" IS NULL) OR ("idempotency_records"."status"='completed' AND "idempotency_records"."result" IS NOT NULL AND jsonb_typeof("idempotency_records"."result")='object') OR ("idempotency_records"."status"='abandoned' AND "idempotency_records"."result" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"event_id" uuid,
	"replay_of_job_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_token_hash" text,
	"leased_until" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_runs_fields_valid" CHECK (length(btrim("job_runs"."kind"))>0 AND length(btrim("job_runs"."dedupe_key"))>0 AND "job_runs"."attempts">=0 AND "job_runs"."max_attempts">0 AND "job_runs"."attempts"<="job_runs"."max_attempts" AND jsonb_typeof("job_runs"."payload")='object' AND ("job_runs"."replay_of_job_id" IS NULL OR "job_runs"."replay_of_job_id"<>"job_runs"."id")),
	CONSTRAINT "job_runs_state_valid" CHECK ((("job_runs"."status"='leased' AND "job_runs"."attempts">0 AND "job_runs"."lease_owner" IS NOT NULL AND length(btrim("job_runs"."lease_owner"))>0 AND "job_runs"."lease_token_hash" IS NOT NULL AND "job_runs"."lease_token_hash" ~ '^[0-9a-f]{64}$' AND "job_runs"."leased_until" IS NOT NULL) OR ("job_runs"."status" IN ('pending','done','dead') AND "job_runs"."lease_owner" IS NULL AND "job_runs"."lease_token_hash" IS NULL AND "job_runs"."leased_until" IS NULL)) AND (("job_runs"."status" IN ('done','dead') AND "job_runs"."finished_at" IS NOT NULL AND "job_runs"."finished_at">="job_runs"."created_at") OR ("job_runs"."status" IN ('pending','leased') AND "job_runs"."finished_at" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "legacy_id_map" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_namespace" text NOT NULL,
	"entity" text NOT NULL,
	"source_key" text NOT NULL,
	"run_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "legacy_id_map_fields_valid" CHECK (length(btrim("legacy_id_map"."source_namespace"))>0 AND length(btrim("legacy_id_map"."target_type"))>0)
);
--> statement-breakpoint
CREATE TABLE "legacy_source_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"source_key" text NOT NULL,
	"record_checksum" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_source_records_identity_unique" UNIQUE("id","run_id","entity","source_key"),
	CONSTRAINT "legacy_source_records_fields_valid" CHECK (length(btrim("legacy_source_records"."entity"))>0 AND length(btrim("legacy_source_records"."source_key"))>0 AND "legacy_source_records"."record_checksum" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("legacy_source_records"."payload")='object' AND NOT ("legacy_source_records"."entity"='admins' AND "legacy_source_records"."payload" ? 'password'))
);
--> statement-breakpoint
CREATE TABLE "migration_issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"source_key" text NOT NULL,
	"field_path" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"severity" text DEFAULT 'blocker' NOT NULL,
	"disposition" text DEFAULT 'open' NOT NULL,
	"safe_message" text NOT NULL,
	"resolution" jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_issues_fields_valid" CHECK (length(btrim("migration_issues"."entity"))>0 AND length(btrim("migration_issues"."code"))>0 AND length(btrim("migration_issues"."safe_message"))>0 AND "migration_issues"."severity" IN ('warning','blocker') AND (("migration_issues"."disposition"='open' AND "migration_issues"."resolved_at" IS NULL AND "migration_issues"."resolution" IS NULL) OR ("migration_issues"."disposition" IN ('resolved','approved_quarantine') AND "migration_issues"."resolved_at" IS NOT NULL AND "migration_issues"."resolution" IS NOT NULL AND jsonb_typeof("migration_issues"."resolution")='object')))
);
--> statement-breakpoint
CREATE TABLE "migration_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_namespace" text NOT NULL,
	"source_version" text NOT NULL,
	"source_checksum" text NOT NULL,
	"archive_media_id" uuid,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_epoch" bigint DEFAULT 0 NOT NULL,
	"source_captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "migration_runs_fields_valid" CHECK (length(btrim("migration_runs"."source_namespace"))>0 AND length(btrim("migration_runs"."source_version"))>0 AND "migration_runs"."source_checksum" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("migration_runs"."manifest")='object' AND jsonb_typeof("migration_runs"."counts")='object' AND "migration_runs"."review_epoch">=0 AND (("migration_runs"."status" IN ('pending','running') AND "migration_runs"."finished_at" IS NULL) OR ("migration_runs"."status" IN ('completed','failed','quarantined') AND "migration_runs"."finished_at" IS NOT NULL AND "migration_runs"."finished_at">="migration_runs"."created_at")))
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid,
	"recipient_user_id" uuid,
	"recipient_address" text NOT NULL,
	"purpose" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"consent_event_id" uuid,
	"dedupe_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'deferred' NOT NULL,
	"provider" text,
	"provider_reference" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "notification_deliveries_fields_valid" CHECK ("notification_deliveries"."channel"='email' AND "notification_deliveries"."purpose" IN ('transactional','marketing') AND length(btrim("notification_deliveries"."recipient_address"))>0 AND length(btrim("notification_deliveries"."dedupe_key"))>0 AND jsonb_typeof("notification_deliveries"."payload")='object' AND ("notification_deliveries"."purpose"<>'marketing' OR "notification_deliveries"."consent_event_id" IS NOT NULL) AND "notification_deliveries"."status" IN ('deferred','pending','leased','sent','failed','cancelled') AND ("notification_deliveries"."status"<>'sent' OR ("notification_deliveries"."sent_at" IS NOT NULL AND "notification_deliveries"."provider" IS NOT NULL AND "notification_deliveries"."provider_reference" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aggregate_type" text,
	"aggregate_id" uuid,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "outbox_events_fields_valid" CHECK (length(btrim("outbox_events"."topic"))>0 AND length(btrim("outbox_events"."dedupe_key"))>0 AND "outbox_events"."payload_version">0 AND jsonb_typeof("outbox_events"."payload")='object' AND (("outbox_events"."aggregate_type" IS NULL AND "outbox_events"."aggregate_id" IS NULL) OR ("outbox_events"."aggregate_type" IS NOT NULL AND "outbox_events"."aggregate_id" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"merchant_account" text NOT NULL,
	"external_event_id" text,
	"raw_body" "bytea" NOT NULL,
	"body_sha256" text NOT NULL,
	"verification_state" text DEFAULT 'unverified' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"verified_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_inbox_fields_valid" CHECK (length(btrim("webhook_inbox"."provider"))>0 AND "webhook_inbox"."environment" IN ('sandbox','live') AND length(btrim("webhook_inbox"."merchant_account"))>0 AND "webhook_inbox"."body_sha256" ~ '^[0-9a-f]{64}$' AND ("webhook_inbox"."external_event_id" IS NULL OR length(btrim("webhook_inbox"."external_event_id"))>0)),
	CONSTRAINT "webhook_inbox_state_valid" CHECK ((("webhook_inbox"."verification_state"='unverified' AND "webhook_inbox"."status"='received' AND "webhook_inbox"."verified_at" IS NULL) OR ("webhook_inbox"."verification_state"='rejected' AND "webhook_inbox"."status"='rejected' AND "webhook_inbox"."verified_at" IS NULL) OR ("webhook_inbox"."verification_state"='verified' AND "webhook_inbox"."status" IN ('queued','processed') AND "webhook_inbox"."verified_at" IS NOT NULL AND "webhook_inbox"."external_event_id" IS NOT NULL)) AND (("webhook_inbox"."status"='processed' AND "webhook_inbox"."processed_at" IS NOT NULL) OR ("webhook_inbox"."status"<>'processed' AND "webhook_inbox"."processed_at" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"wishlist_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_wishlist_id_product_id_pk" PRIMARY KEY("wishlist_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "wishlists_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_versions" ADD CONSTRAINT "exchange_rate_versions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_policy_versions" ADD CONSTRAINT "shipping_policy_versions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_policy_id_shipping_policy_versions_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."shipping_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_shipping_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_active_exchange_rate_id_exchange_rate_versions_id_fk" FOREIGN KEY ("active_exchange_rate_id") REFERENCES "public"."exchange_rate_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_active_shipping_policy_id_shipping_policy_versions_id_fk" FOREIGN KEY ("active_shipping_policy_id") REFERENCES "public"."shipping_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_active_tax_configuration_id_tax_configuration_id_fk" FOREIGN KEY ("active_tax_configuration_id") REFERENCES "public"."tax_configuration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_configuration" ADD CONSTRAINT "tax_configuration_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_image_media_id_media_assets_id_fk" FOREIGN KEY ("image_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_version_id_page_id_page_kind_page_versions_id_page_id_page_kind_fk" FOREIGN KEY ("version_id","page_id","page_kind") REFERENCES "public"."page_versions"("id","page_id","page_kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_version_id_page_id_page_kind_page_versions_id_page_id_page_kind_fk" FOREIGN KEY ("version_id","page_id","page_kind") REFERENCES "public"."page_versions"("id","page_id","page_kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_merchandising_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."merchandising_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_publications" ADD CONSTRAINT "page_publications_version_id_page_id_page_versions_id_page_id_fk" FOREIGN KEY ("version_id","page_id") REFERENCES "public"."page_versions"("id","page_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_version_collections" ADD CONSTRAINT "page_version_collections_version_id_page_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."page_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_version_collections" ADD CONSTRAINT "page_version_collections_collection_id_merchandising_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."merchandising_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_version_media" ADD CONSTRAINT "page_version_media_version_id_page_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."page_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_version_media" ADD CONSTRAINT "page_version_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_page_kind_pages_id_kind_fk" FOREIGN KEY ("page_id","page_kind") REFERENCES "public"."pages"("id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_result_media_id_media_assets_id_fk" FOREIGN KEY ("result_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_event_id_outbox_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_replay_of_job_id_job_runs_id_fk" FOREIGN KEY ("replay_of_job_id") REFERENCES "public"."job_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_id_map" ADD CONSTRAINT "legacy_id_map_record_id_run_id_entity_source_key_legacy_source_records_id_run_id_entity_source_key_fk" FOREIGN KEY ("record_id","run_id","entity","source_key") REFERENCES "public"."legacy_source_records"("id","run_id","entity","source_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_source_records" ADD CONSTRAINT "legacy_source_records_run_id_migration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_issues" ADD CONSTRAINT "migration_issues_run_id_migration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."migration_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_runs" ADD CONSTRAINT "migration_runs_archive_media_id_media_assets_id_fk" FOREIGN KEY ("archive_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_event_id_outbox_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_consent_event_id_consent_events_id_fk" FOREIGN KEY ("consent_event_id") REFERENCES "public"."consent_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rate_versions_editor_idx" ON "exchange_rate_versions" USING btree ("editor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_rates_band_unique" ON "shipping_rates" USING btree ("policy_id","zone_id","key");--> statement-breakpoint
CREATE INDEX "shipping_rates_zone_idx" ON "shipping_rates" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "banners_position_idx" ON "banners" USING btree ("position","sort_order");--> statement-breakpoint
CREATE INDEX "banners_media_idx" ON "banners" USING btree ("image_media_id");--> statement-breakpoint
CREATE INDEX "blog_posts_cover_idx" ON "blog_posts" USING btree ("cover_media_id");--> statement-breakpoint
CREATE INDEX "collection_products_order_idx" ON "collection_products" USING btree ("collection_id","position","product_id");--> statement-breakpoint
CREATE INDEX "collection_products_product_idx" ON "collection_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "page_version_collections_collection_idx" ON "page_version_collections" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "page_version_media_media_idx" ON "page_version_media" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_number_unique" ON "page_versions" USING btree ("page_id","version");--> statement-breakpoint
CREATE INDEX "page_versions_author_idx" ON "page_versions" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_key_unique" ON "pages" USING btree ("kind","key");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_unique" ON "pages" USING btree ("kind","slug") WHERE "pages"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pages_public_idx" ON "pages" USING btree ("kind","status","id");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "export_jobs_owner_idx" ON "export_jobs" USING btree ("requested_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "export_jobs_media_idx" ON "export_jobs" USING btree ("result_media_id");--> statement-breakpoint
CREATE INDEX "export_jobs_expiry_idx" ON "export_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_unique" ON "idempotency_records" USING btree ("actor_scope","operation","key");--> statement-breakpoint
CREATE INDEX "idempotency_records_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_dedupe_unique" ON "job_runs" USING btree ("kind","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_event_consumer_unique" ON "job_runs" USING btree ("kind","event_id") WHERE "job_runs"."event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "job_runs_ready_idx" ON "job_runs" USING btree ("available_at","id") WHERE "job_runs"."status"='pending';--> statement-breakpoint
CREATE INDEX "job_runs_lease_idx" ON "job_runs" USING btree ("leased_until","id") WHERE "job_runs"."status"='leased';--> statement-breakpoint
CREATE INDEX "job_runs_replay_idx" ON "job_runs" USING btree ("replay_of_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_id_map_source_unique" ON "legacy_id_map" USING btree ("source_namespace","entity","source_key");--> statement-breakpoint
CREATE INDEX "legacy_id_map_target_idx" ON "legacy_id_map" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_source_records_source_unique" ON "legacy_source_records" USING btree ("run_id","entity","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "migration_issues_source_unique" ON "migration_issues" USING btree ("run_id","entity","source_key","field_path","code");--> statement-breakpoint
CREATE INDEX "migration_issues_gate_idx" ON "migration_issues" USING btree ("run_id","severity","disposition");--> statement-breakpoint
CREATE INDEX "migration_runs_source_idx" ON "migration_runs" USING btree ("source_namespace","source_checksum");--> statement-breakpoint
CREATE INDEX "migration_runs_archive_idx" ON "migration_runs" USING btree ("archive_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_provider_unique" ON "notification_deliveries" USING btree ("provider","provider_reference") WHERE "notification_deliveries"."provider_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_deliveries_event_idx" ON "notification_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_consent_idx" ON "notification_deliveries" USING btree ("consent_event_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_ready_idx" ON "notification_deliveries" USING btree ("available_at","id") WHERE "notification_deliveries"."status"='pending';--> statement-breakpoint
CREATE INDEX "outbox_events_topic_idx" ON "outbox_events" USING btree ("topic","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_verified_identity_unique" ON "webhook_inbox" USING btree ("provider","environment","merchant_account","external_event_id") WHERE "webhook_inbox"."verification_state"='verified';--> statement-breakpoint
CREATE INDEX "webhook_inbox_queue_idx" ON "webhook_inbox" USING btree ("status","received_at","id");--> statement-breakpoint
CREATE INDEX "wishlist_items_product_idx" ON "wishlist_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_history_idx" ON "wishlist_items" USING btree ("wishlist_id","created_at","product_id");
--> statement-breakpoint
-- Custom guards below must be preserved alongside generated schema snapshots.
CREATE FUNCTION content_guard_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.snapshot_sealed THEN RAISE EXCEPTION 'Content must seal after its metadata' USING ERRCODE='23514'; END IF;
  ELSIF pg_trigger_depth()<=1 OR (to_jsonb(NEW)-'snapshot_sealed') IS DISTINCT FROM (to_jsonb(OLD)-'snapshot_sealed') OR NOT NEW.snapshot_sealed THEN
    RAISE EXCEPTION 'Content versions are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER page_versions_guard BEFORE INSERT OR UPDATE ON page_versions FOR EACH ROW EXECUTE FUNCTION content_guard_version();
--> statement-breakpoint
CREATE FUNCTION content_seal_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.page_kind='blog' AND NOT EXISTS(SELECT 1 FROM blog_posts WHERE version_id=NEW.id) OR
     NEW.page_kind='banner' AND NOT EXISTS(SELECT 1 FROM banners WHERE version_id=NEW.id) THEN
    RAISE EXCEPTION 'Typed content version metadata is missing' USING ERRCODE='23514';
  END IF;
  UPDATE page_versions SET snapshot_sealed=true WHERE id=NEW.id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER page_versions_seal AFTER INSERT ON page_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content_seal_version();
--> statement-breakpoint
CREATE FUNCTION content_guard_version_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_sealed boolean;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Version metadata is immutable' USING ERRCODE='23514'; END IF;
  SELECT snapshot_sealed INTO v_sealed FROM page_versions WHERE id=NEW.version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown content version' USING ERRCODE='23503'; END IF;
  IF v_sealed THEN RAISE EXCEPTION 'Version metadata is sealed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['blog_posts','banners','page_version_media','page_version_collections'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION content_guard_version_child()',t||'_snapshot_guard',t);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION content_guard_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_page uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.page_id IS DISTINCT FROM OLD.page_id THEN RAISE EXCEPTION 'Publication ownership is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN v_page:=OLD.page_id; ELSE v_page:=NEW.page_id; END IF;
  UPDATE pages SET publication_epoch=publication_epoch+1 WHERE id=v_page;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown page' USING ERRCODE='23503'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER page_publications_guard BEFORE INSERT OR UPDATE OR DELETE ON page_publications FOR EACH ROW EXECUTE FUNCTION content_guard_publication();
--> statement-breakpoint
CREATE FUNCTION content_check_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_page uuid;
BEGIN
  IF TG_TABLE_NAME='pages' THEN v_page:=NEW.id;
  ELSIF TG_OP='DELETE' THEN v_page:=OLD.page_id; ELSE v_page:=NEW.page_id; END IF;
  IF EXISTS(SELECT 1 FROM pages p WHERE p.id=v_page AND p.status='published' AND NOT EXISTS(SELECT 1 FROM page_publications WHERE page_id=p.id)) THEN
    RAISE EXCEPTION 'Published page requires its version pointer' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pages_publication_check AFTER INSERT OR UPDATE ON pages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content_check_publication();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER page_publications_check AFTER INSERT OR UPDATE OR DELETE ON page_publications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION content_check_publication();
--> statement-breakpoint
CREATE FUNCTION configuration_guard_shipping_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.snapshot_sealed THEN RAISE EXCEPTION 'Shipping policy starts as a draft' USING ERRCODE='23514'; END IF;
  ELSIF pg_trigger_depth()<=1 OR (to_jsonb(NEW)-'snapshot_sealed') IS DISTINCT FROM (to_jsonb(OLD)-'snapshot_sealed') OR (OLD.snapshot_sealed AND NOT NEW.snapshot_sealed) THEN
    RAISE EXCEPTION 'Shipping policy identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipping_policy_versions_guard BEFORE INSERT OR UPDATE ON shipping_policy_versions FOR EACH ROW EXECUTE FUNCTION configuration_guard_shipping_policy();
--> statement-breakpoint
CREATE FUNCTION configuration_guard_shipping_rate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_sealed boolean;
BEGIN
  UPDATE shipping_policy_versions SET snapshot_sealed=snapshot_sealed WHERE id=NEW.policy_id RETURNING snapshot_sealed INTO v_sealed;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown shipping policy' USING ERRCODE='23503'; END IF;
  IF v_sealed THEN RAISE EXCEPTION 'Activated shipping policy cannot acquire new bands' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipping_rates_guard BEFORE INSERT ON shipping_rates FOR EACH ROW EXECUTE FUNCTION configuration_guard_shipping_rate();
--> statement-breakpoint
CREATE FUNCTION configuration_activate_shipping() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_zone uuid;
BEGIN
  IF NEW.active_shipping_policy_id IS NOT NULL THEN
    UPDATE shipping_policy_versions SET snapshot_sealed=true WHERE id=NEW.active_shipping_policy_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown shipping policy' USING ERRCODE='23503'; END IF;
    IF NOT EXISTS(SELECT 1 FROM shipping_rates WHERE policy_id=NEW.active_shipping_policy_id) THEN RAISE EXCEPTION 'Shipping policy has no bands' USING ERRCODE='23514'; END IF;
    FOR v_zone IN SELECT DISTINCT zone_id FROM shipping_rates WHERE policy_id=NEW.active_shipping_policy_id ORDER BY zone_id LOOP
      UPDATE shipping_zones SET active=active WHERE id=v_zone;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER store_settings_shipping_guard BEFORE INSERT OR UPDATE ON store_settings FOR EACH ROW EXECUTE FUNCTION configuration_activate_shipping();
--> statement-breakpoint
CREATE FUNCTION configuration_guard_zone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND EXISTS(SELECT 1 FROM shipping_rates r JOIN shipping_policy_versions p ON p.id=r.policy_id WHERE r.zone_id=OLD.id AND p.snapshot_sealed) THEN
    RAISE EXCEPTION 'Zone is retained by an activated policy; create a new definition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shipping_zones_guard BEFORE UPDATE ON shipping_zones FOR EACH ROW EXECUTE FUNCTION configuration_guard_zone();
--> statement-breakpoint
CREATE FUNCTION operations_guard_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' OR NEW.attempts<>0 THEN RAISE EXCEPTION 'Job starts pending' USING ERRCODE='23514'; END IF;
  ELSE
    IF (to_jsonb(NEW)-ARRAY['status','attempts','available_at','lease_owner','lease_token_hash','leased_until','finished_at','last_error_code']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','attempts','available_at','lease_owner','lease_token_hash','leased_until','finished_at','last_error_code']) OR (OLD.status IN ('done','dead') AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'Job identity or terminal result is immutable; replay separately' USING ERRCODE='23514';
    END IF;
    IF NEW.status='leased' THEN
      IF NEW.leased_until IS NULL OR NOT isfinite(NEW.leased_until) OR NEW.leased_until<=clock_timestamp() THEN RAISE EXCEPTION 'Lease must have finite future expiry' USING ERRCODE='23514'; END IF;
      IF OLD.status='pending' THEN
        IF NEW.attempts<>OLD.attempts+1 THEN RAISE EXCEPTION 'Claim increments attempts' USING ERRCODE='23514'; END IF;
      ELSIF OLD.status='leased' THEN
        IF NEW.lease_token_hash IS DISTINCT FROM OLD.lease_token_hash THEN
          IF OLD.leased_until>clock_timestamp() OR NEW.attempts<>OLD.attempts+1 THEN RAISE EXCEPTION 'Cannot steal an unexpired lease' USING ERRCODE='23514'; END IF;
        ELSIF OLD.leased_until<=clock_timestamp() OR NEW.attempts<>OLD.attempts OR NEW.lease_owner IS DISTINCT FROM OLD.lease_owner THEN RAISE EXCEPTION 'Renewal requires a live lease and unchanged identity' USING ERRCODE='23514'; END IF;
      ELSE RAISE EXCEPTION 'Invalid claim' USING ERRCODE='23514'; END IF;
    ELSE
      IF NEW.attempts<>OLD.attempts OR (NEW.status='pending' AND NEW.attempts>=NEW.max_attempts) OR (NEW.status='done' AND (OLD.status<>'leased' OR OLD.leased_until<=clock_timestamp())) THEN RAISE EXCEPTION 'Invalid completion, exhausted retry or attempt rewrite' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_runs_guard BEFORE INSERT OR UPDATE ON job_runs FOR EACH ROW EXECUTE FUNCTION operations_guard_job();
--> statement-breakpoint
CREATE FUNCTION operations_guard_webhook() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['verification_state','status','verified_at','processed_at','external_event_id']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['verification_state','status','verified_at','processed_at','external_event_id']) OR
     (OLD.verification_state IN ('verified','rejected') AND NEW.verification_state IS DISTINCT FROM OLD.verification_state) OR
     (OLD.verification_state='verified' AND (NEW.external_event_id IS DISTINCT FROM OLD.external_event_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at)) OR
     (OLD.status='processed' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Webhook receipt and terminal verification are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER webhook_inbox_guard BEFORE UPDATE ON webhook_inbox FOR EACH ROW EXECUTE FUNCTION operations_guard_webhook();
--> statement-breakpoint
CREATE FUNCTION operations_guard_idempotency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status='processing' OR OLD.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Idempotency retention not complete' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW)-ARRAY['status','result']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','result']) OR (OLD.status<>'processing' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Idempotency request or terminal result is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER idempotency_records_guard BEFORE UPDATE OR DELETE ON idempotency_records FOR EACH ROW EXECUTE FUNCTION operations_guard_idempotency();
--> statement-breakpoint
CREATE FUNCTION operations_guard_private_asset() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_asset uuid; v_media media_assets%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='export_jobs' THEN
    IF TG_OP='UPDATE' THEN
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.filters IS DISTINCT FROM OLD.filters OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR
         (OLD.result_media_id IS NOT NULL AND NEW.result_media_id IS DISTINCT FROM OLD.result_media_id) OR
         (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) OR
         (OLD.status IN ('completed','failed') AND NEW.status NOT IN (OLD.status,'expired')) OR (OLD.status='expired' AND NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION 'Export scope, result and terminal history are immutable' USING ERRCODE='23514';
      END IF;
    END IF;
    v_asset:=NEW.result_media_id;
  ELSE v_asset:=NEW.archive_media_id; END IF;
  IF v_asset IS NOT NULL THEN
    -- A real write fences concurrent RR attempts to publish the same asset.
    UPDATE media_assets SET updated_at=updated_at WHERE id=v_asset RETURNING * INTO v_media;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown private result asset' USING ERRCODE='23503'; END IF;
    IF v_media.visibility<>'private' OR v_media.status<>'ready' THEN RAISE EXCEPTION 'Result/archive must be private and ready' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER export_jobs_private_guard BEFORE INSERT OR UPDATE ON export_jobs FOR EACH ROW EXECUTE FUNCTION operations_guard_private_asset();
--> statement-breakpoint
CREATE TRIGGER migration_runs_private_guard BEFORE INSERT OR UPDATE ON migration_runs FOR EACH ROW EXECUTE FUNCTION operations_guard_private_asset();
--> statement-breakpoint
CREATE FUNCTION operations_keep_media_private() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility<>'private' AND (EXISTS(SELECT 1 FROM export_jobs WHERE result_media_id=NEW.id) OR EXISTS(SELECT 1 FROM migration_runs WHERE archive_media_id=NEW.id)) THEN
    RAISE EXCEPTION 'Export/archive asset cannot become public' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER operations_media_privacy BEFORE UPDATE OF visibility ON media_assets FOR EACH ROW EXECUTE FUNCTION operations_keep_media_private();
--> statement-breakpoint
CREATE FUNCTION operations_guard_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['status','provider','provider_reference','available_at','sent_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','provider','provider_reference','available_at','sent_at']) OR
      (OLD.status IN ('sent','cancelled') AND NEW IS DISTINCT FROM OLD) OR (OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference)) THEN
    RAISE EXCEPTION 'Notification identity or terminal outcome is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.purpose='marketing' AND NEW.consent_event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM consent_events c JOIN customer_profiles p ON p.id=c.profile_id
    WHERE c.id=NEW.consent_event_id AND c.action='granted' AND c.channel='email' AND c.purpose IN ('marketing','newsletter')
      AND p.user_id IS NOT DISTINCT FROM NEW.recipient_user_id AND p.email=lower(btrim(NEW.recipient_address))
  ) THEN
    RAISE EXCEPTION 'Marketing grant must match recipient and purpose' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notification_deliveries_guard BEFORE INSERT OR UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION operations_guard_notification();
--> statement-breakpoint
CREATE FUNCTION operations_guard_migration_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' THEN RAISE EXCEPTION 'Import run starts pending' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.source_namespace IS DISTINCT FROM OLD.source_namespace OR NEW.source_version IS DISTINCT FROM OLD.source_version OR NEW.source_checksum IS DISTINCT FROM OLD.source_checksum OR NEW.created_at IS DISTINCT FROM OLD.created_at OR
       (OLD.status IN ('completed','failed','quarantined') AND (to_jsonb(NEW)-'review_epoch') IS DISTINCT FROM (to_jsonb(OLD)-'review_epoch')) OR
       (OLD.archive_media_id IS NOT NULL AND NEW.archive_media_id IS DISTINCT FROM OLD.archive_media_id) OR
       (NEW.review_epoch IS DISTINCT FROM OLD.review_epoch AND pg_trigger_depth()<=1) THEN
      RAISE EXCEPTION 'Import source identity or finished run is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='completed' AND EXISTS(SELECT 1 FROM migration_issues WHERE run_id=NEW.id AND severity='blocker' AND disposition='open') THEN
    RAISE EXCEPTION 'Import has unresolved blocking issues' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER migration_runs_guard BEFORE INSERT OR UPDATE ON migration_runs FOR EACH ROW EXECUTE FUNCTION operations_guard_migration_run();
--> statement-breakpoint
CREATE FUNCTION operations_guard_stage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_run migration_runs%ROWTYPE;
BEGIN
  UPDATE migration_runs SET review_epoch=review_epoch+1 WHERE id=NEW.run_id RETURNING * INTO v_run;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown import run' USING ERRCODE='23503'; END IF;
  IF v_run.status NOT IN ('pending','running') THEN RAISE EXCEPTION 'Import run is finished' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='legacy_id_map' THEN
    IF NEW.source_namespace IS DISTINCT FROM v_run.source_namespace THEN RAISE EXCEPTION 'Import namespace mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='migration_issues' AND TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['disposition','resolution','resolved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['disposition','resolution','resolved_at']) OR
       (OLD.disposition<>'open' AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Issue evidence is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER page_publications_no_truncate BEFORE TRUNCATE ON page_publications FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER idempotency_records_no_truncate BEFORE TRUNCATE ON idempotency_records FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER legacy_source_records_stage BEFORE INSERT ON legacy_source_records FOR EACH ROW EXECUTE FUNCTION operations_guard_stage();
--> statement-breakpoint
CREATE TRIGGER legacy_id_map_stage BEFORE INSERT ON legacy_id_map FOR EACH ROW EXECUTE FUNCTION operations_guard_stage();
--> statement-breakpoint
CREATE TRIGGER migration_issues_stage BEFORE INSERT OR UPDATE ON migration_issues FOR EACH ROW EXECUTE FUNCTION operations_guard_stage();
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_events','outbox_events','exchange_rate_versions','shipping_rates','tax_configuration','legacy_source_records','legacy_id_map'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation()',t||'_immutable',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pages','page_versions','blog_posts','banners','page_version_media','page_version_collections','exchange_rate_versions','shipping_policy_versions','shipping_rates','tax_configuration','audit_events','outbox_events','job_runs','webhook_inbox','export_jobs','notification_deliveries','migration_runs','legacy_source_records','legacy_id_map','migration_issues'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION commerce_reject_mutation()',t||'_no_delete',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation()',t||'_no_truncate',t);
  END LOOP;
END;
$$;
