ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_fields_valid";--> statement-breakpoint
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_fields_valid";--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_fields_valid" CHECK ("payment_transactions"."currency"='KZT' AND "payment_transactions"."amount_minor">0 AND (("payment_transactions"."provider" IN ('kaspi','secondary') AND "payment_transactions"."environment" IN ('sandbox','live')) OR ("payment_transactions"."provider"='manual' AND "payment_transactions"."environment"='live' AND "payment_transactions"."merchant_account"='manual') OR ("payment_transactions"."provider"='demo' AND "payment_transactions"."environment"='demo' AND "payment_transactions"."merchant_account"='demo')) AND "payment_transactions"."kind" IN ('authorization','capture','void') AND length(btrim("payment_transactions"."external_id"))>0 AND length(btrim("payment_transactions"."merchant_account"))>0 AND length(btrim("payment_transactions"."dedupe_key"))>0 AND jsonb_typeof("payment_transactions"."evidence")='object' AND "payment_transactions"."refund_epoch">=0);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_fields_valid" CHECK ("refunds"."currency"='KZT' AND "refunds"."amount_minor">0 AND "refunds"."version">0 AND (("refunds"."provider" IN ('kaspi','secondary') AND "refunds"."environment" IN ('sandbox','live')) OR ("refunds"."provider"='manual' AND "refunds"."environment"='live' AND "refunds"."merchant_account"='manual') OR ("refunds"."provider"='demo' AND "refunds"."environment"='demo' AND "refunds"."merchant_account"='demo')) AND length(btrim("refunds"."merchant_account"))>0 AND ("refunds"."provider_refund_id" IS NULL OR length(btrim("refunds"."provider_refund_id"))>0) AND "refunds"."idempotency_key" ~ '^[ -~]{16,128}$' AND "refunds"."request_hash" ~ '^[0-9a-f]{64}$' AND "refunds"."status" IN ('reserved','pending','unknown','succeeded','failed','cancelled'));--> statement-breakpoint
-- Task 3.1 (owner decision 2026-11-19): "Demo checkout" is on by default on every environment until
-- launch. An existing store row is switched to demo (the column default is already 'demo'); staff
-- turn it off in Settings -> Payments, and DEMO_CHECKOUT_DISABLED=1 forces it off.
UPDATE "store_settings" SET "payment_mode"='demo',"version"="version"+1 WHERE "id"=1 AND "payment_mode"<>'demo';--> statement-breakpoint
-- Task 3.2 (owner decision 2026-11-19 "full demo", replacing D03): a demo attempt may now end
-- 'captured' (the demo capture right after checkout). Everything else is the 0003 guard unchanged:
-- a demo attempt still only belongs to a demo order, for exactly its total, and never takes the
-- real-money states (authorized, unknown, late_captured, superseded, ...).
CREATE OR REPLACE FUNCTION payments_guard_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_mode text; v_amount bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','provider_session_id','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','provider_session_id','version','updated_at']) OR
       (OLD.provider_session_id IS NOT NULL AND NEW.provider_session_id IS DISTINCT FROM OLD.provider_session_id) OR
       (OLD.status NOT IN ('created','pending','requires_action','authorized','unknown') AND NEW.status IN ('created','pending','requires_action','authorized','unknown')) THEN
      RAISE EXCEPTION 'Payment attempt identity cannot be rewritten or reopened' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT payment_mode,total_minor INTO v_mode,v_amount FROM orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payment order' USING ERRCODE='23503'; END IF;
  IF (NEW.provider='demo')<>(v_mode='demo') OR NEW.amount_minor<>v_amount OR
     (NEW.provider='demo' AND NEW.status NOT IN ('created','pending','simulated','captured','failed','cancelled')) THEN
    RAISE EXCEPTION 'Payment attempt mode or amount does not match its order' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
