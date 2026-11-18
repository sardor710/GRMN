ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_valid";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_opening_valid" CHECK ("stock_movements"."reason"<>'opening' OR ("stock_movements"."delta_on_hand">0 AND "stock_movements"."delta_reserved"=0 AND "stock_movements"."source_reference" IS NOT NULL AND length(btrim("stock_movements"."source_reference"))>0));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_valid" CHECK (("stock_movements"."delta_on_hand"<>0 OR "stock_movements"."delta_reserved"<>0) AND "stock_movements"."reason" IN ('opening','receive','adjust','reserve','release','consume','compensate','return') AND length(btrim("stock_movements"."dedupe_key"))>0);--> statement-breakpoint
-- Task 11A: balances are derived from the append-only stock movement ledger.
-- Before 0008 counters and ledger rows were written independently. Each existing balance gets
-- a provenance movement for the residual only (counter minus existing ledger sum), before the
-- apply trigger exists, so the ledger reconciles with the counters it already holds. A negative
-- residual means the ledger already exceeds the counter; that needs a human decision, so stop.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM inventory_balances b LEFT JOIN (SELECT variant_id,location_id,sum(delta_on_hand) AS on_hand,sum(delta_reserved) AS reserved FROM stock_movements GROUP BY variant_id,location_id) m USING (variant_id,location_id)
            WHERE b.on_hand-COALESCE(m.on_hand,0)<0 OR b.reserved-COALESCE(m.reserved,0)<0)
     OR EXISTS(SELECT 1 FROM stock_movements m WHERE NOT EXISTS(SELECT 1 FROM inventory_balances b WHERE b.variant_id=m.variant_id AND b.location_id=m.location_id)) THEN
    RAISE EXCEPTION 'Existing stock movements exceed inventory balances; reconcile before migration 0008' USING ERRCODE='23514';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference)
SELECT gen_random_uuid(),b.variant_id,b.location_id,b.on_hand-COALESCE(m.on_hand,0),0,'opening','opening-backfill:'||b.variant_id||':'||b.location_id,'migration:0008-existing-balance'
FROM inventory_balances b LEFT JOIN (SELECT variant_id,location_id,sum(delta_on_hand) AS on_hand FROM stock_movements GROUP BY variant_id,location_id) m USING (variant_id,location_id)
WHERE b.on_hand-COALESCE(m.on_hand,0)>0;--> statement-breakpoint
INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference)
SELECT gen_random_uuid(),b.variant_id,b.location_id,0,b.reserved-COALESCE(m.reserved,0),'reserve','reserve-backfill:'||b.variant_id||':'||b.location_id,'migration:0008-existing-balance'
FROM inventory_balances b LEFT JOIN (SELECT variant_id,location_id,sum(delta_reserved) AS reserved FROM stock_movements GROUP BY variant_id,location_id) m USING (variant_id,location_id)
WHERE b.reserved-COALESCE(m.reserved,0)>0;--> statement-breakpoint
CREATE FUNCTION inventory_apply_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('grmn.inventory_movement',NEW.id::text,true);
  UPDATE inventory_balances SET on_hand=on_hand+NEW.delta_on_hand,reserved=reserved+NEW.delta_reserved,version=version+1,updated_at=clock_timestamp()
    WHERE variant_id=NEW.variant_id AND location_id=NEW.location_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown inventory balance' USING ERRCODE='23503'; END IF;
  PERFORM set_config('grmn.inventory_movement','',true);
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER stock_movements_apply AFTER INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION inventory_apply_movement();--> statement-breakpoint
CREATE FUNCTION inventory_guard_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.on_hand<>0 OR NEW.reserved<>0 OR NEW.version<>1 THEN
      RAISE EXCEPTION 'Inventory balances start at zero; record a stock movement instead' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inventory balances cannot be deleted' USING ERRCODE='23514'; END IF;
  IF NEW.variant_id<>OLD.variant_id OR NEW.location_id<>OLD.location_id THEN
    RAISE EXCEPTION 'Inventory balance identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.on_hand,NEW.reserved,NEW.version) IS DISTINCT FROM (OLD.on_hand,OLD.reserved,OLD.version)
     AND (pg_trigger_depth()<2 OR coalesce(current_setting('grmn.inventory_movement',true),'')='') THEN
    RAISE EXCEPTION 'Inventory counters change only through stock movements' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER inventory_balances_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_balances FOR EACH ROW EXECUTE FUNCTION inventory_guard_balance();--> statement-breakpoint
CREATE TRIGGER inventory_balances_no_truncate BEFORE TRUNCATE ON inventory_balances FOR EACH STATEMENT EXECUTE FUNCTION commerce_reject_mutation();
