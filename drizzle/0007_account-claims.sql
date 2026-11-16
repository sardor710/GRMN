CREATE TABLE "order_claim_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"phone_number" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"consumed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_claim_approvals_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "order_claim_approvals_valid" CHECK ("order_claim_approvals"."token_hash" ~ '^[0-9a-f]{64}$' AND "order_claim_approvals"."phone_number" ~ '^[+][1-9][0-9]{7,14}$' AND length(btrim("order_claim_approvals"."reason")) BETWEEN 1 AND 500 AND "order_claim_approvals"."expires_at">"order_claim_approvals"."created_at" AND ("order_claim_approvals"."consumed_at" IS NULL) = ("order_claim_approvals"."consumed_by" IS NULL) AND ("order_claim_approvals"."consumed_at" IS NULL OR "order_claim_approvals"."revoked_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "phone_challenges" ADD COLUMN "purpose" text DEFAULT 'sign_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_claim_approvals" ADD CONSTRAINT "order_claim_approvals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_claim_approvals" ADD CONSTRAINT "order_claim_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_claim_approvals" ADD CONSTRAINT "order_claim_approvals_consumed_by_users_id_fk" FOREIGN KEY ("consumed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_claim_approvals_open_unique" ON "order_claim_approvals" USING btree ("order_id") WHERE "order_claim_approvals"."consumed_at" IS NULL AND "order_claim_approvals"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "phone_challenges" ADD CONSTRAINT "phone_challenges_purpose_valid" CHECK ("phone_challenges"."purpose" IN ('sign_in','phone_change_current','phone_change_new','order_claim'));