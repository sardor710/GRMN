CREATE TABLE "rate_limit_buckets" (
	"bucket_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_bucket_key_window_start_pk" PRIMARY KEY("bucket_key","window_start"),
	CONSTRAINT "rate_limit_buckets_valid" CHECK ("rate_limit_buckets"."bucket_key" ~ '^[0-9a-f]{64}$' AND "rate_limit_buckets"."hits">=0)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_window_idx" ON "rate_limit_buckets" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "orders_shown_at_idx" ON "orders" USING btree ((COALESCE("placed_at","created_at")) DESC,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "payment_transactions_capture_time_idx" ON "payment_transactions" USING btree ("created_at") WHERE "payment_transactions"."kind"='capture';