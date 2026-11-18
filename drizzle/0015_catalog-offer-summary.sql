CREATE TABLE "catalog_variant_offers" (
	"variant_id" uuid NOT NULL,
	"market" text NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_key" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"available" boolean NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_variant_offers_variant_id_market_pk" PRIMARY KEY("variant_id","market"),
	CONSTRAINT "catalog_variant_offers_valid" CHECK ("catalog_variant_offers"."amount_minor">=0 AND "catalog_variant_offers"."variant_key"="catalog_variant_offers"."variant_id"::text)
);
--> statement-breakpoint
ALTER TABLE "catalog_variant_offers" ADD CONSTRAINT "catalog_variant_offers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variant_offers" ADD CONSTRAINT "catalog_variant_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_variant_offers_choice_idx" ON "catalog_variant_offers" USING btree ("product_id","market","available" DESC NULLS LAST,"amount_minor","variant_key");--> statement-breakpoint
-- The live definition of an offer: the same eligibility as catalog/service.ts (an active variant that
-- chooses every option of its product, with an active KZT price in the market), and whether any
-- non-archived location has free stock (the listing's 'available' state).
CREATE VIEW catalog_variant_offer_source AS
SELECT v.id AS variant_id,pr.market,v.product_id,v.id::text AS variant_key,pr.amount_minor,
  EXISTS(SELECT 1 FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL
         WHERE ib.variant_id=v.id AND ib.on_hand>ib.reserved) AS available
FROM product_variants v JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT'
WHERE v.status='active' AND NOT EXISTS(SELECT 1 FROM product_options po WHERE po.product_id=v.product_id
  AND NOT EXISTS(SELECT 1 FROM variant_option_values vo WHERE vo.variant_id=v.id AND vo.option_id=po.id));
--> statement-breakpoint
-- Recomputes one variant's rows from the live definition. A transaction-scoped advisory lock per
-- variant serialises refreshers: the triggers are deferred to commit, so under READ COMMITTED the
-- statements after the lock see everything the previous holder committed, and two transactions that
-- change a variant's price and its stock at once cannot leave either change out.
CREATE FUNCTION catalog_refresh_variant_offer(p_variant uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_variant IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('catalog-offer:'||p_variant::text,0));
  DELETE FROM catalog_variant_offers o WHERE o.variant_id=p_variant
    AND NOT EXISTS(SELECT 1 FROM catalog_variant_offer_source s WHERE s.variant_id=p_variant AND s.market=o.market);
  INSERT INTO catalog_variant_offers(variant_id,market,product_id,variant_key,amount_minor,available,refreshed_at)
    SELECT variant_id,market,product_id,variant_key,amount_minor,available,clock_timestamp() FROM catalog_variant_offer_source WHERE variant_id=p_variant
  ON CONFLICT (variant_id,market) DO UPDATE SET product_id=EXCLUDED.product_id,amount_minor=EXCLUDED.amount_minor,available=EXCLUDED.available,refreshed_at=EXCLUDED.refreshed_at
    WHERE (catalog_variant_offers.product_id,catalog_variant_offers.amount_minor,catalog_variant_offers.available)
      IS DISTINCT FROM (EXCLUDED.product_id,EXCLUDED.amount_minor,EXCLUDED.available);
END;
$$;
--> statement-breakpoint
-- Rebuilds the whole summary (backfill, and after a bulk load with session_replication_role=replica).
CREATE FUNCTION catalog_rebuild_offers() RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_rows bigint;
BEGIN
  LOCK TABLE catalog_variant_offers IN EXCLUSIVE MODE;
  DELETE FROM catalog_variant_offers;
  INSERT INTO catalog_variant_offers(variant_id,market,product_id,variant_key,amount_minor,available,refreshed_at)
    SELECT variant_id,market,product_id,variant_key,amount_minor,available,clock_timestamp() FROM catalog_variant_offer_source;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION catalog_offer_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_variant uuid;
BEGIN
  IF TG_TABLE_NAME IN ('prices','inventory_balances','variant_option_values') THEN
    IF TG_OP<>'INSERT' THEN PERFORM catalog_refresh_variant_offer(OLD.variant_id); END IF;
    IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.variant_id IS DISTINCT FROM OLD.variant_id) THEN PERFORM catalog_refresh_variant_offer(NEW.variant_id); END IF;
  ELSIF TG_TABLE_NAME='product_variants' THEN
    PERFORM catalog_refresh_variant_offer(NEW.id);
  ELSIF TG_TABLE_NAME='product_options' THEN
    FOR v_variant IN SELECT id FROM product_variants WHERE product_id=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END ORDER BY id LOOP
      PERFORM catalog_refresh_variant_offer(v_variant);
    END LOOP;
  ELSIF TG_TABLE_NAME='stock_locations' THEN
    FOR v_variant IN SELECT variant_id FROM inventory_balances WHERE location_id=NEW.id ORDER BY variant_id LOOP
      PERFORM catalog_refresh_variant_offer(v_variant);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_price AFTER INSERT OR DELETE ON prices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_price_change AFTER UPDATE ON prices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN ((OLD.variant_id,OLD.market,OLD.currency,OLD.amount_minor,OLD.is_active) IS DISTINCT FROM (NEW.variant_id,NEW.market,NEW.currency,NEW.amount_minor,NEW.is_active))
  EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_variant AFTER INSERT ON product_variants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_variant_status AFTER UPDATE ON product_variants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_option AFTER INSERT OR DELETE ON product_options DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_selection AFTER INSERT OR UPDATE OR DELETE ON variant_option_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_balance AFTER INSERT OR DELETE ON inventory_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
-- Hot path: a reservation, release or receipt rewrites the summary only when this balance crosses
-- between free and not free. With every balance's free stock >= 0 (inventory_balances_counts_valid),
-- a variant's 'available' can only change when one of its balances crosses.
CREATE CONSTRAINT TRIGGER catalog_offers_balance_change AFTER UPDATE ON inventory_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN ((OLD.on_hand>OLD.reserved) IS DISTINCT FROM (NEW.on_hand>NEW.reserved) OR OLD.variant_id IS DISTINCT FROM NEW.variant_id OR OLD.location_id IS DISTINCT FROM NEW.location_id)
  EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER catalog_offers_location AFTER UPDATE ON stock_locations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.archived_at IS DISTINCT FROM NEW.archived_at) EXECUTE FUNCTION catalog_offer_event();
--> statement-breakpoint
SELECT catalog_rebuild_offers();
