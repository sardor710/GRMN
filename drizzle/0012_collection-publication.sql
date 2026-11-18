CREATE TABLE "collection_published_products" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "collection_published_products_collection_id_product_id_pk" PRIMARY KEY("collection_id","product_id"),
	CONSTRAINT "collection_published_products_position_valid" CHECK ("collection_published_products"."position">=0)
);
--> statement-breakpoint
ALTER TABLE "merchandising_collections" ADD COLUMN "published_name" text;--> statement-breakpoint
ALTER TABLE "merchandising_collections" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_published_products" ADD CONSTRAINT "collection_published_products_collection_id_merchandising_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."merchandising_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_published_products" ADD CONSTRAINT "collection_published_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_published_products_order_idx" ON "collection_published_products" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX "collection_published_products_product_idx" ON "collection_published_products" USING btree ("product_id");--> statement-breakpoint
UPDATE "merchandising_collections" SET "published_name"="name","published_at"=now() WHERE "status"='published';--> statement-breakpoint
INSERT INTO "collection_published_products"("collection_id","product_id","position") SELECT cp."collection_id",cp."product_id",(row_number() OVER (PARTITION BY cp."collection_id" ORDER BY cp."position",cp."product_id"))-1 FROM "collection_products" cp JOIN "merchandising_collections" m ON m."id"=cp."collection_id" WHERE m."status"='published';--> statement-breakpoint
ALTER TABLE "merchandising_collections" ADD CONSTRAINT "merchandising_collections_published_snapshot" CHECK ("status"<>'published' OR "published_name" IS NOT NULL);
