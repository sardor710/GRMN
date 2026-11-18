# Task 21B follow-up handoff: offer summary, listing cap and the unpaid-order limit

**Status: complete, 2026-11-18.** Built on the VPS (branch `beta`), test-first, approved by the owner the same day:
- build the price-sort fixes where the store is noticeably slow;
- allow at most 3 unpaid orders per customer and per IP.

The shared cache was **not** built. After the offer summary, the store is fast at the forecast traffic; the remaining 100/500 rps gap is app render CPU, which is an infrastructure choice. See [performance-report.md, "21B follow-up re-run"](../performance-report.md#21b-follow-up-re-run-2026-11-18-after-the-offer-summary).

No production `.env`, deployment, real import or production migration has been done. The perf stack is private (loopback only) and is now stopped; its volume is kept.

## Files

### New

- **`drizzle/0014_unpaid-order-limit.sql`**: `checkout_attempts.client_address_hash` (a keyed HMAC-SHA-256 of the trusted client address, or null), with a format CHECK and an index.
- **`drizzle/0015_catalog-offer-summary.sql`**:
  - the `catalog_variant_offers` table, with PK `(variant_id, market)` and the choice index `(product_id, market, available DESC, amount_minor, variant_key)`;
  - the view `catalog_variant_offer_source`, which is the live definition;
  - the functions `catalog_refresh_variant_offer(uuid)` (per-variant advisory lock, upsert or delete), `catalog_rebuild_offers()` and `catalog_offer_event()`;
  - deferred constraint triggers on `prices`, `product_variants`, `product_options`, `variant_option_values`, `inventory_balances` (UPDATE only when a balance crosses between free and not free) and `stock_locations` (archive changes);
  - a backfill.
- **`drizzle/0016_unpaid-limit-index.sql`**: the address index becomes `(client_address_hash, created_at)`.
- **`src/server/catalog/limit.ts`**: `createConcurrencyLimit({ max, waitMs })`. It admits tasks in arrival order; a task still waiting after `waitMs` gets 503 `CATALOG_BUSY` with Retry-After 1 and never runs.
- **Tests:**
  - `tests/integration/catalog-offers.test.mjs` (5);
  - `tests/unit/concurrency-limit.test.mjs` (3);
  - the env test in `tests/unit/backend-env.test.mjs` (1);
  - 4 hold-limit tests in `tests/integration/manual-payments.test.mjs`.

### Changed

- **`src/server/checkout/service.ts`:**
  - `MAX_UNPAID_MANUAL_ORDERS = 3`;
  - `enforceUnpaidLimit` runs after the cart lock, for the manual method only. It takes advisory locks (customer, then address) and counts through a `MATERIALIZED` CTE bounded to the last 168 h;
  - `placeOrder` takes an optional `clientAddress` and stores its hash on the attempt.
- **Cart:** `src/server/cart/service.ts` takes a `clientAddress(headers)` option, and `src/server/cart/runtime.ts` passes `trustedClientAddress`.
- **`src/server/catalog/service.ts`:**
  - paging and sorting read the summary (`chosenOffer`, `hasOffer`);
  - the selected page's prices and offers are still built live;
  - an optional `listingLimit` wraps `listProducts` only.
- **`src/server/catalog/runtime.ts`:** one listing limit per module instance.
- **`src/server/config/env.ts`:**
  - `CATALOG_LISTING_CONCURRENCY` (default half of `DATABASE_POOL_MAX`, at least 1);
  - `CATALOG_LISTING_WAIT_MS` (default 2000).
- **Schema:** `src/server/db/schema/catalog.ts` and `commerce.ts`.
- **Perf scripts and docs:**
  - `scripts/perf/load-seed.mjs` and `catalog-explain.mjs` call `catalog_rebuild_offers()` after their trigger-bypassing bulk load;
  - `scripts/perf/invariants.sql` has two new checks;
  - `.env.example` and `docs/backend/local-development.md` document the settings;
  - `docs/backend/decisions.md` records the hold-abuse rule.

## Test-first evidence

| Step | Result |
|---|---|
| Hold-limit tests before the change | 3 of 4 failed ("Missing expected rejection"; 6 orders where 3 were allowed) |
| Concurrency mutation: drop the address advisory lock | the concurrent test fails, 6 !== 3 |
| Offer-summary tests before migration 0015 | 4 of 5 failed (`catalog_variant_offers` does not exist). The listing-order test already passed on the live query and guards the behaviour the summary must keep |
| Race mutation: drop the per-variant advisory lock | the race test fails in 3 of 3 runs |

## Rulings

- **Deferred triggers, a per-variant advisory lock.** Refreshes run at commit and under READ COMMITTED, so after the lock they see the previous holder's committed state. Without the lock, a concurrent price change and stock flip could each leave out the other's change (the mutation test shows it). A deadlock between an admin multi-variant edit and a checkout is possible in principle; both transaction wrappers already retry 40P01.
- **Hot path.** A reservation, release or receipt writes the summary only when the balance crosses zero free stock. Every balance has free stock >= 0, so a variant's state can change only then. Checkout p95 is unchanged or better (230 ms).
- **Trigger bypass.** Any bulk load with `session_replication_role=replica` must call `SELECT catalog_rebuild_offers()` afterwards. The perf invariant "the offer summary equals the live offers" detects a stale summary.
- **The unpaid limit counts only live holds:** `pending_payment`, unpaid, a manual attempt, and an active reservation that has not expired. Without a trusted proxy (development) only the per-customer limit applies.
- **The query plan must not depend on statistics.** The first version cost 414 ms per checkout at 1M orders with stale statistics (see the report). The identity-first `MATERIALIZED` CTE is 0.3 ms.
- **Cost if wrong:** shoppers behind one address (an office, or mobile-carrier NAT) share 3 unpaid orders. Raise `MAX_UNPAID_MANUAL_ORDERS`, or split the per-address number from the per-customer one, if staff see real refusals.

## Gates

Unit 201, legacy 73/73, integration **371/371**, boundaries, lint 0 errors, typecheck, build, and the browser smoke.

## Open

1. Owner, only if the Section 3 stress envelope (100/500 rps) must be met: a shared page/data cache, or more app instances/vCPU.
2. Watch item: the `expireUnpaidOrders` sweep takes about 3.6 s per run at 1M orders (worker only). Add a partial index on unpaid orders.
