-- Task 10A: saved-address invariants enforced by the database, not only by services.
-- Every address write serializes on the owning user row, so concurrent requests cannot
-- exceed five addresses, move an address to another owner, or leave a nonempty book
-- without exactly one primary (the partial unique index from 0000 already forbids two).
-- The limit/primary counts rely on READ COMMITTED taking a fresh snapshot after the owner lock
-- wait; under REPEATABLE READ/SERIALIZABLE they could read a stale count, so writes fail closed.
-- Lock order for every writer: owning users row first, then address rows (as the service does).
ALTER TABLE "customer_profiles" ADD COLUMN "email_verified_at" timestamp with time zone;
--> statement-breakpoint
CREATE FUNCTION customer_addresses_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Saved address writes require READ COMMITTED' USING ERRCODE='23514', CONSTRAINT='customer_addresses_isolation';
  END IF;
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Saved address ownership is immutable' USING ERRCODE='23514', CONSTRAINT='customer_addresses_owner_immutable';
  END IF;
  PERFORM 1 FROM users WHERE id=NEW.user_id FOR NO KEY UPDATE;
  IF TG_OP='INSERT' THEN
    SELECT count(*) INTO v_count FROM customer_addresses WHERE user_id=NEW.user_id;
    IF v_count>=5 THEN
      RAISE EXCEPTION 'A customer can save at most five addresses' USING ERRCODE='23514', CONSTRAINT='customer_addresses_limit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customer_addresses_guard BEFORE INSERT OR UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION customer_addresses_guard();
--> statement-breakpoint
CREATE FUNCTION customer_addresses_check_primary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_user uuid; v_total integer; v_primary integer;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Saved address writes require READ COMMITTED' USING ERRCODE='23514', CONSTRAINT='customer_addresses_isolation';
  END IF;
  IF TG_OP='DELETE' THEN v_user:=OLD.user_id; ELSE v_user:=NEW.user_id; END IF;
  PERFORM 1 FROM users WHERE id=v_user FOR NO KEY UPDATE;
  SELECT count(*),count(*) FILTER (WHERE is_primary) INTO v_total,v_primary FROM customer_addresses WHERE user_id=v_user;
  IF v_total>0 AND v_primary<>1 THEN
    RAISE EXCEPTION 'A nonempty address book needs exactly one primary address' USING ERRCODE='23514', CONSTRAINT='customer_addresses_primary_required';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER customer_addresses_primary_required AFTER INSERT OR UPDATE OR DELETE ON customer_addresses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION customer_addresses_check_primary();
