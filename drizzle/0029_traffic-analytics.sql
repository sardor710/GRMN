-- Migration 0029_traffic-analytics (owner 2026-11-25, additive): visits, page views and campaign links
-- (plan docs/plans/2026-11-25-traffic-analytics-xl.md). Older images ignore these tables.
-- Idempotent on purpose: its journal "when" sits between 0028 and beta5's 0029_product-code so both
-- deploy orders work, and beta5 re-applies the same SQL as a later migration after 0030 (no-op where it ran).
CREATE TABLE IF NOT EXISTS "traffic_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"medium" text NOT NULL,
	"campaign" text NOT NULL,
	"target_path" text NOT NULL,
	"label" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "traffic_links_valid" CHECK (char_length("traffic_links"."platform") BETWEEN 1 AND 40 AND char_length("traffic_links"."medium") BETWEEN 1 AND 80
    AND "traffic_links"."campaign" ~ '^[a-z0-9][a-z0-9-]{0,59}$' AND char_length("traffic_links"."target_path") BETWEEN 1 AND 512
    AND ("traffic_links"."label" IS NULL OR char_length("traffic_links"."label") BETWEEN 1 AND 120))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "traffic_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"platform" text NOT NULL,
	"medium" text,
	"campaign" text,
	"referrer_host" text,
	"landing_path" text NOT NULL,
	"locale" text,
	"os" text NOT NULL,
	"device_type" text NOT NULL,
	"browser" text,
	"views" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "traffic_sessions_valid" CHECK (char_length("traffic_sessions"."platform") BETWEEN 1 AND 40
    AND ("traffic_sessions"."medium" IS NULL OR char_length("traffic_sessions"."medium") BETWEEN 1 AND 80)
    AND ("traffic_sessions"."campaign" IS NULL OR char_length("traffic_sessions"."campaign") BETWEEN 1 AND 80)
    AND ("traffic_sessions"."referrer_host" IS NULL OR char_length("traffic_sessions"."referrer_host") BETWEEN 1 AND 253)
    AND char_length("traffic_sessions"."landing_path") BETWEEN 1 AND 512
    AND ("traffic_sessions"."locale" IS NULL OR "traffic_sessions"."locale" IN ('en','ru','kk'))
    AND char_length("traffic_sessions"."os") BETWEEN 1 AND 20
    AND "traffic_sessions"."device_type" IN ('mobile','tablet','desktop')
    AND ("traffic_sessions"."browser" IS NULL OR char_length("traffic_sessions"."browser") BETWEEN 1 AND 40)
    AND "traffic_sessions"."views">=1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "traffic_views" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"product_id" uuid,
	"locale" text,
	CONSTRAINT "traffic_views_valid" CHECK (char_length("traffic_views"."path") BETWEEN 1 AND 512 AND ("traffic_views"."locale" IS NULL OR "traffic_views"."locale" IN ('en','ru','kk')))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "traffic_views" ADD CONSTRAINT "traffic_views_session_id_traffic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."traffic_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "traffic_links_active_unique" ON "traffic_links" USING btree ("platform","medium","campaign","target_path") WHERE "traffic_links"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_sessions_started_idx" ON "traffic_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_sessions_platform_started_idx" ON "traffic_sessions" USING btree ("platform","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_sessions_visitor_idx" ON "traffic_sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_views_occurred_idx" ON "traffic_views" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_views_product_occurred_idx" ON "traffic_views" USING btree ("product_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_views_session_idx" ON "traffic_views" USING btree ("session_id");