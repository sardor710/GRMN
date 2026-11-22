-- Migration 0027 (owner 2026-11-22, admin bin delete). Deleting a never-ordered product or SKU from the admin removes
-- its manual stock history too. The ledger stays append-only except for one transaction-local door: when the
-- catalog delete sets grmn.catalog_purge='1' (set_config(...,true)), manual movements (opening, receive, adjust)
-- without a reservation line or allocation, and balances with nothing reserved, may be deleted. Reservations,
-- consumption, returns and every UPDATE stay immutable. Drizzle snapshots do not model functions, so 0027 has the
-- same snapshot as 0026.
CREATE OR REPLACE FUNCTION inventory_guard_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.on_hand<>0 OR NEW.reserved<>0 OR NEW.version<>1 THEN
      RAISE EXCEPTION 'Inventory balances start at zero; record a stock movement instead' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.on_hand=0 AND OLD.reserved=0 AND OLD.version=1 THEN RETURN OLD; END IF;
    IF coalesce(current_setting('grmn.catalog_purge',true),'')='1' AND OLD.reserved=0 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Inventory balances cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF NEW.variant_id<>OLD.variant_id OR NEW.location_id<>OLD.location_id THEN
    RAISE EXCEPTION 'Inventory balance identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.on_hand,NEW.reserved,NEW.version) IS DISTINCT FROM (OLD.on_hand,OLD.reserved,OLD.version)
     AND (pg_trigger_depth()<2 OR coalesce(current_setting('grmn.inventory_movement',true),'')='') THEN
    RAISE EXCEPTION 'Inventory counters change only through stock movements' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION stock_movement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE'
     AND coalesce(current_setting('grmn.catalog_purge',true),'')='1'
     AND OLD.reason IN ('opening','receive','adjust')
     AND OLD.reservation_line_id IS NULL AND OLD.allocation_id IS NULL THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Immutable commerce history' USING ERRCODE='23514';
END $$;
--> statement-breakpoint
DROP TRIGGER stock_movements_immutable ON stock_movements;
--> statement-breakpoint
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION stock_movement_guard();
