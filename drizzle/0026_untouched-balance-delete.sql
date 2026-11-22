-- Migration 0026 (beta5 merge, additive behaviour). The catalog writer (merge/backend-into-cms-variants) creates a
-- zero inventory balance for every new variant, while beta's permanent delete (owner 2026-11-19: "?permanent=1
-- deletes a never-sold product for good") removes a never-stocked product's balances. The 0008 guard refused every
-- balance delete, so that delete always failed. A balance that was never moved (on_hand 0, reserved 0, version 1:
-- every stock movement bumps the version) may now be deleted; any balance with history still cannot. The service
-- also refuses the delete when stock_movements exist. Drizzle snapshots do not model functions, so 0026 has the
-- same snapshot as 0025.
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
