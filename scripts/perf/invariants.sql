-- Task 21B: money, inventory and ownership invariants after a load or failure-injection run.
-- Every row must report ok = true.
SELECT 'no negative available stock' AS invariant, count(*)=0 AS ok, count(*) AS bad FROM inventory_balances WHERE on_hand<0 OR reserved<0 OR reserved>on_hand
UNION ALL SELECT 'reserved equals active hold lines', count(*)=0, count(*) FROM (
  SELECT b.variant_id FROM inventory_balances b LEFT JOIN (SELECT l.variant_id,sum(l.quantity) AS q FROM reservation_lines l JOIN inventory_reservations r ON r.id=l.reservation_id WHERE r.status='active' GROUP BY 1) h ON h.variant_id=b.variant_id
  WHERE b.reserved<>COALESCE(h.q,0)) x
UNION ALL SELECT 'on_hand equals the ledger', count(*)=0, count(*) FROM (
  SELECT b.variant_id FROM inventory_balances b LEFT JOIN (SELECT variant_id,location_id,sum(delta_on_hand) AS s FROM stock_movements GROUP BY 1,2) m ON m.variant_id=b.variant_id AND m.location_id=b.location_id
  WHERE b.on_hand<>COALESCE(m.s,0)) x
UNION ALL SELECT 'one order per checkout attempt', count(*)=0, count(*) FROM (SELECT checkout_attempt_id FROM orders WHERE checkout_attempt_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'one order per idempotency key', count(*)=0, count(*) FROM (SELECT actor_scope,key FROM idempotency_records WHERE operation='checkout' GROUP BY 1,2 HAVING count(*)>1) x
UNION ALL SELECT 'at most one payable attempt per order', count(*)=0, count(*) FROM (SELECT order_id FROM payment_attempts WHERE status IN ('created','pending','requires_action','authorized','unknown') GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'no capture recorded twice', count(*)=0, count(*) FROM (SELECT provider,environment,merchant_account,kind,external_id FROM payment_transactions GROUP BY 1,2,3,4,5 HAVING count(*)>1) x
UNION ALL SELECT 'no new order marked paid without a capture', count(*)=0, count(*) FROM orders o WHERE o.checkout_attempt_id IS NOT NULL AND o.payment_status='paid' AND NOT EXISTS(SELECT 1 FROM payment_transactions t WHERE t.order_id=o.id AND t.kind='capture')
UNION ALL SELECT 'no refunds over captured cash', count(*)=0, count(*) FROM (SELECT t.id FROM payment_transactions t JOIN refunds r ON r.transaction_id=t.id AND r.status IN ('reserved','pending','unknown','succeeded') GROUP BY t.id,t.amount_minor HAVING sum(r.amount_minor)>t.amount_minor) x
UNION ALL SELECT 'every converted guest cart has one owner', count(*)=0, count(*) FROM carts WHERE user_id IS NOT NULL AND guest_token_hash IS NOT NULL
UNION ALL SELECT 'the offer summary equals the live offers', count(*)=0, count(*) FROM (
  (SELECT variant_id,market,product_id,amount_minor,available FROM catalog_variant_offers
   EXCEPT SELECT variant_id,market,product_id,amount_minor,available FROM catalog_variant_offer_source)
  UNION ALL
  (SELECT variant_id,market,product_id,amount_minor,available FROM catalog_variant_offer_source
   EXCEPT SELECT variant_id,market,product_id,amount_minor,available FROM catalog_variant_offers)) x
UNION ALL SELECT 'at most 3 unpaid manual orders per customer', count(*)=0, count(*) FROM (
  SELECT o.user_id FROM orders o WHERE o.user_id IS NOT NULL AND o.order_status='pending_payment' AND o.payment_status IN ('unpaid','pending','failed') AND o.payment_mode='live'
    AND EXISTS(SELECT 1 FROM payment_attempts a WHERE a.order_id=o.id AND a.provider='manual')
    AND EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.checkout_attempt_id=o.checkout_attempt_id AND r.status='active' AND r.expires_at>clock_timestamp())
  GROUP BY 1 HAVING count(*)>3) x;
