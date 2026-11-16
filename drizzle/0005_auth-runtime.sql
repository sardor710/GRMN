CREATE TABLE "auth_request_budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_request_budgets_key_unique" UNIQUE("key"),
	CONSTRAINT "auth_request_budgets_valid" CHECK ("auth_request_budgets"."key" ~ '^grmn:[a-f0-9]{64}$' AND "auth_request_budgets"."count">0 AND isfinite("auth_request_budgets"."expires_at") AND "auth_request_budgets"."expires_at">"auth_request_budgets"."created_at")
);
--> statement-breakpoint
CREATE TABLE "phone_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_number" text NOT NULL,
	"code_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_challenges_valid" CHECK ("phone_challenges"."phone_number" ~ '^[+][1-9][0-9]{7,14}$' AND "phone_challenges"."code_hash" ~ '^[0-9a-f]{64}$' AND "phone_challenges"."failed_attempts" BETWEEN 0 AND 5 AND "phone_challenges"."expires_at">"phone_challenges"."created_at" AND ("phone_challenges"."consumed_at" IS NULL OR "phone_challenges"."consumed_at">="phone_challenges"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "staff_session_grants" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_session_grants_method_valid" CHECK ("staff_session_grants"."method" IN ('totp','backup_code'))
);
--> statement-breakpoint
ALTER TABLE "staff_session_grants" ADD CONSTRAINT "staff_session_grants_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_session_grants" ADD CONSTRAINT "staff_session_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_request_budgets_expiry_idx" ON "auth_request_budgets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "phone_challenges_phone_idx" ON "phone_challenges" USING btree ("phone_number","created_at");--> statement-breakpoint
CREATE INDEX "phone_challenges_expiry_idx" ON "phone_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "staff_session_grants_user_idx" ON "staff_session_grants" USING btree ("user_id");
--> statement-breakpoint
CREATE FUNCTION auth_guard_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['failed_attempts','consumed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['failed_attempts','consumed_at']) OR
     NEW.failed_attempts<OLD.failed_attempts OR (OLD.consumed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Challenge identity and consumed proof are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER phone_challenges_guard BEFORE UPDATE ON phone_challenges FOR EACH ROW EXECUTE FUNCTION auth_guard_challenge();
--> statement-breakpoint
CREATE FUNCTION auth_guard_staff_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.verified_at<OLD.verified_at THEN RAISE EXCEPTION 'MFA session ownership is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=NEW.session_id AND u.id=NEW.user_id AND u.status='active' AND s.expires_at>clock_timestamp() AND u.two_factor_enabled AND EXISTS(SELECT 1 FROM auth_two_factors f WHERE f.user_id=u.id AND f.verified) AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id)) THEN
    RAISE EXCEPTION 'Staff grant requires matching live session and enrolled MFA' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER staff_session_grants_guard BEFORE INSERT OR UPDATE ON staff_session_grants FOR EACH ROW EXECUTE FUNCTION auth_guard_staff_grant();
