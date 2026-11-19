CREATE TABLE "page_version_translations" (
	"version_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_version_translations_version_id_locale_pk" PRIMARY KEY("version_id","locale"),
	CONSTRAINT "page_version_translations_valid" CHECK ("page_version_translations"."locale" IN ('ru','kk') AND jsonb_typeof("page_version_translations"."content")='object' AND "page_version_translations"."content"<>'{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "product_translations" (
	"product_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "product_translations_product_id_locale_pk" PRIMARY KEY("product_id","locale"),
	CONSTRAINT "product_translations_valid" CHECK ("product_translations"."locale" IN ('ru','kk') AND jsonb_typeof("product_translations"."content")='object' AND "product_translations"."content"<>'{}'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "page_version_translations" ADD CONSTRAINT "page_version_translations_version_id_page_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."page_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;