CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"action" text NOT NULL,
	"policy_version" text NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_events_channel_valid" CHECK ("consent_events"."channel" IN ('email','sms')),
	CONSTRAINT "consent_events_action_valid" CHECK ("consent_events"."action" IN ('granted','withdrawn')),
	CONSTRAINT "consent_events_evidence_present" CHECK (length(btrim("consent_events"."purpose"))>0 AND length(btrim("consent_events"."policy_version"))>0 AND length(btrim("consent_events"."source"))>0)
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"recipient_name" text NOT NULL,
	"phone" text NOT NULL,
	"country_code" text NOT NULL,
	"city" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"region" text,
	"postal_code" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_addresses_required_fields" CHECK (length(btrim("customer_addresses"."label"))>0 AND length(btrim("customer_addresses"."recipient_name"))>0 AND length(btrim("customer_addresses"."city"))>0 AND length(btrim("customer_addresses"."line1"))>0),
	CONSTRAINT "customer_addresses_phone_format" CHECK ("customer_addresses"."phone" ~ '^[+][1-9][0-9]{7,14}$'),
	CONSTRAINT "customer_addresses_country_format" CHECK ("customer_addresses"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "customer_addresses_version_valid" CHECK ("customer_addresses"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "customer_completion_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid,
	"phone_number" text NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text DEFAULT 'complete_profile' NOT NULL,
	"phone_verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_completion_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "customer_completion_sessions_phone_format" CHECK ("customer_completion_sessions"."phone_number" ~ '^[+][1-9][0-9]{7,14}$'),
	CONSTRAINT "customer_completion_sessions_hash_format" CHECK ("customer_completion_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "customer_completion_sessions_scope" CHECK ("customer_completion_sessions"."purpose" = 'complete_profile'),
	CONSTRAINT "customer_completion_sessions_expiry_valid" CHECK ("customer_completion_sessions"."expires_at">"customer_completion_sessions"."created_at" AND "customer_completion_sessions"."phone_verified_at"<="customer_completion_sessions"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "customer_preferences" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"locale" text,
	"marketing_email_requested" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_preferences_locale_valid" CHECK ("customer_preferences"."locale" IS NULL OR "customer_preferences"."locale" IN ('kk','ru','en')),
	CONSTRAINT "customer_preferences_version_valid" CHECK ("customer_preferences"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "customer_private_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"author_user_id" uuid,
	"legacy_author_label" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"legacy_client_id" text,
	"name" text NOT NULL,
	"email" text,
	"entered_phone" text NOT NULL,
	"normalized_phone" text,
	"country_code" text,
	"birth_date" date,
	"avatar" text,
	"status" text DEFAULT 'active' NOT NULL,
	"profile_state" text DEFAULT 'provisional' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_legacy_client_id_unique" UNIQUE("legacy_client_id"),
	CONSTRAINT "customer_profiles_name_present" CHECK (length(btrim("customer_profiles"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "customer_profiles_phone_present" CHECK (length(btrim("customer_profiles"."entered_phone")) BETWEEN 1 AND 64),
	CONSTRAINT "customer_profiles_email_normalized" CHECK ("customer_profiles"."email" IS NULL OR ("customer_profiles"."email"=lower(btrim("customer_profiles"."email")) AND length("customer_profiles"."email")>0)),
	CONSTRAINT "customer_profiles_phone_format" CHECK ("customer_profiles"."normalized_phone" IS NULL OR "customer_profiles"."normalized_phone" ~ '^[+][1-9][0-9]{7,14}$'),
	CONSTRAINT "customer_profiles_country_format" CHECK ("customer_profiles"."country_code" IS NULL OR "customer_profiles"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "customer_profiles_state_valid" CHECK ("customer_profiles"."profile_state" IN ('provisional','complete')),
	CONSTRAINT "customer_profiles_status_valid" CHECK ("customer_profiles"."status" IN ('active','vip','pending','suspended')),
	CONSTRAINT "customer_profiles_complete_fields" CHECK ("customer_profiles"."profile_state"<>'complete' OR ("customer_profiles"."user_id" IS NOT NULL AND "customer_profiles"."email" IS NOT NULL AND "customer_profiles"."normalized_phone" IS NOT NULL)),
	CONSTRAINT "customer_profiles_version_valid" CHECK ("customer_profiles"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code"),
	CONSTRAINT "permissions_code_present" CHECK (length(btrim("permissions"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key"),
	CONSTRAINT "auth_rate_limits_nonnegative" CHECK ("auth_rate_limits"."count" >= 0 AND "auth_rate_limits"."last_request" >= 0)
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code"),
	CONSTRAINT "roles_code_valid" CHECK ("roles"."code" IN ('super_admin','editor','product_manager','support'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_two_factors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "auth_two_factors_attempts_valid" CHECK ("auth_two_factors"."failed_verification_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(btrim("users"."email")) AND length("users"."email") > 0),
	CONSTRAINT "users_name_present" CHECK (length(btrim("users"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "users_status_valid" CHECK ("users"."status" IN ('active','suspended','disabled')),
	CONSTRAINT "users_verified_phone_only" CHECK (("users"."phone_number" IS NULL AND NOT "users"."phone_number_verified") OR ("users"."phone_number" IS NOT NULL AND "users"."phone_number" ~ '^[+][1-9][0-9]{7,14}$' AND "users"."phone_number_verified"))
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_profile_id_customer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_completion_sessions" ADD CONSTRAINT "customer_completion_sessions_profile_id_customer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_profile_id_customer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_private_notes" ADD CONSTRAINT "customer_private_notes_profile_id_customer_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_private_notes" ADD CONSTRAINT "customer_private_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_two_factors" ADD CONSTRAINT "auth_two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_events_profile_time_idx" ON "consent_events" USING btree ("profile_id","occurred_at");--> statement-breakpoint
CREATE INDEX "consent_events_actor_idx" ON "consent_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_user_idx" ON "customer_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_primary_unique" ON "customer_addresses" USING btree ("user_id") WHERE "customer_addresses"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "customer_completion_sessions_profile_idx" ON "customer_completion_sessions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "customer_completion_sessions_expiry_idx" ON "customer_completion_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_private_notes_profile_idx" ON "customer_private_notes" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "customer_private_notes_author_idx" ON "customer_private_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_profiles_user_unique" ON "customer_profiles" USING btree ("user_id") WHERE "customer_profiles"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_profiles_phone_lookup_idx" ON "customer_profiles" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_unique" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_last_request_idx" ON "auth_rate_limits" USING btree ("last_request");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_two_factors_user_idx" ON "auth_two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_two_factors_secret_idx" ON "auth_two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "auth_verifications_expiry_idx" ON "auth_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE VIEW "public"."phone_identities" AS (SELECT id AS user_id, phone_number FROM users WHERE phone_number_verified = true);
--> statement-breakpoint
-- Custom append-only evidence rule; retention/anonymization requires a separately reviewed migration.
CREATE FUNCTION reject_consent_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Consent events are append-only; append a new event' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER consent_events_append_only BEFORE UPDATE OR DELETE ON consent_events FOR EACH ROW EXECUTE FUNCTION reject_consent_event_mutation();
