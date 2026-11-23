-- Migration 0029 (owner 2026-11-23, additive): products.product_code, the public URL key of /p/{code} and
-- /p/{code}/{sku}. Imported products keep their garmin.com product id (legacy_content.source.productId, the first
-- product by creation wins a shared id); every other product, and every new one, draws from product_code_seq, which
-- starts above all garmin.com ids. Older images ignore the column (the default fills it on their inserts).
CREATE SEQUENCE "public"."product_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 90000001 CACHE 1;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_code" text DEFAULT (nextval('product_code_seq'))::text NOT NULL;--> statement-breakpoint
WITH garmin AS (
	SELECT id, legacy_content->'source'->>'productId' AS code,
		row_number() OVER (PARTITION BY legacy_content->'source'->>'productId' ORDER BY created_at, id) AS rank
	FROM products
	WHERE legacy_content->'source'->>'productId' ~ '^[0-9]{1,8}$'
		AND (legacy_content->'source'->>'productId')::bigint < 90000001
)
UPDATE products p SET product_code = garmin.code FROM garmin WHERE garmin.id = p.id AND garmin.rank = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "products_product_code_unique" ON "products" USING btree ("product_code");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_code_valid" CHECK ("products"."product_code" ~ '^[0-9]{1,12}$');
