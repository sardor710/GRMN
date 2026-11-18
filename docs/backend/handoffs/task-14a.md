# Task 14A handoff: idempotent checkout and pending order

**Status: complete, 2026-11-17**, including the review fix pass. Task 14B is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `d98cc92` (13B). 14A is committed on the same branch; see `git log`.

No push, merge, deployment, real import or backend activation has been done. **Payments are the explicit demo mode (D03).** Every new order stays `pending_payment` / `unpaid`. No UI or API ever shows it as paid, and O07 (manual orders before real payment) stays open.

**No migration.** The 0002–0004 schema already had every table, sequence and guard 14A needs:
- `checkout_attempts`, with the key-unique and revision-winner indexes;
- `orders`, with the `GRM-` sequence and the deferred `orders_seal` reconcile trigger;
- the `order_*` snapshot guards, `payment_attempts`, `order_access_tokens`, `idempotency_records` and `outbox_events`.

## Files

### New

- **`src/server/checkout/service.ts`**
  - **`placeOrder(pool, secret, actor, idempotencyKey, input)`** runs in ONE `withInventoryTransaction` (READ COMMITTED, retried on 40P01/40001) with no network call. Lock order: attempt, cart, promotion, stock.
    1. Replay first. A completed `idempotency_records` row for (actor scope, `checkout`, key) returns the original order (`replayed: true`). The same key with a different request hash is 409 `IDEMPOTENCY_CONFLICT`.
    2. The quote must belong to the actor's own cart: the account cart for a session, the capability cart for a guest. Otherwise 404. The cart version must match (409 `QUOTE_STALE`).
    3. Claim the key: `INSERT checkout_attempts … ON CONFLICT (actor_scope,operation,idempotency_key) DO NOTHING`.
       - A concurrent request with the same key waits, then replays.
       - A different key on the same cart revision hits `checkout_attempts_revision_winner_unique`, which is 409 `CHECKOUT_CONFLICT`.
    4. Lock the cart row. It must still be active at the quoted version. Then:
       - `revalidateQuote` (with `checkoutAttemptId`);
       - `reserveCouponQuota`;
       - `reserveStock` from the quote's line snapshot.
    5. Write the order snapshot:
       - the order (sequence `GRM-` number, `payment_mode='demo'`, `placed_at`; contact name and phone from the delivery snapshot per D06, optional email; totals, USD snapshot, and the quote's `policy_versions` plus `quoteId` and `markdownLines`);
       - `order_items` (product key, SKU, name, variant option, unit/discount/tax/total);
       - `order_adjustments`: coupon discount, exclusive tax, **inclusive tax** (`source_snapshot.included=true`), and shipping;
       - the structured `order_addresses` row.
    6. Link the stock reservation and the coupon redemption to the order (`order_id`).
    7. Write the rest of the transaction:
       - the demo `payment_attempts` row (`created`, key `payment:<attemptId>`);
       - an `order.placed` `order_events` row;
       - an `order.placed` outbox event, consumed by `payments.session.start`;
       - for guests, an `order_access_tokens` row holding only the sha256 of the status token;
       - the cart set to `converted`;
       - the `idempotency_records` result (kept 30 days).
    8. The deferred seal checks at COMMIT that lines, address and totals reconcile, and marks the attempt `committed`. Any error rolls everything back, so the key can simply be retried.
  - **`readCheckoutStatus(pool, actor, input)`**: `{ orderId, statusToken? }`. It answers the owning session (`orders.user_id`) or an unexpired, unrevoked `order_status` token hash. Anything else is 404.
- **`src/app/api/cart/checkout/route.ts`** and **`…/checkout/status/route.ts`** (POST only):
  - Both sit under `/api/cart` so the `Path=/api/cart` guest capability cookie is sent.
  - The key comes from the `Idempotency-Key` header (16–128 printable ASCII).
- **`src/lib/checkout-client.ts`** (browser):
  - `createCheckoutClient` (quote, placeOrder with the header, status).
  - `checkoutRecovery` maps a failure to one of three outcomes:
    - `retry`: a 5xx or network failure; resend with the same key;
    - `requote`: a stale/expired quote, stock, coupon, policy or shipping change;
    - `fail`: anything else.
  - `beginCheckout` stores the whole command with its key in session storage, with a memory fallback.
  - `resumePendingCheckout` resends a pending command after a reload. Also `rememberOrder`/`lastOrder` and `pollOrderStatus` (5 s, 24 reads, stops when the order leaves pending/unpaid).
- **`src/components/CheckoutPanel.tsx`**:
  - `CheckoutPanel`: delivery contact (name, phone, country code, city, address, optional email, optional promo code), then **Review order**, which shows the server quote in KZT. **Place order** shows "Retry placing order" while the outcome is unknown.
  - `OrderReceived`: the receipt with polled status and an explicit "no payment has been taken, the order is not paid".
  - `resumeCheckout()` is called on cart page load.
- **Tests:**
  - `tests/integration/checkout.test.mjs` (11);
  - `tests/unit/checkout-client.test.mjs` (5).

### Changed

- **`src/server/cart/service.ts`:**
  - `checkout(headers, key, input)` and `checkoutStatus(headers, input)`.
  - `getCart` keeps the guest capability cookie for a day after its cart was converted, so a same-key retry after a lost response still identifies the guest (review I1).
- **`src/server/cart/http.ts`:** the `checkout` and `checkout/status` resources (POST only; other subpaths 404).
- **`src/server/operations/registry.ts`:**
  - `COUPON_EXPIRY_KIND` (`promotions.reservations.expire`) runs `expireDueCouponReservations` in short transactions. It is scheduled on the same `RESERVATION_EXPIRY_INTERVAL_MS` as stock expiry.
  - The `payments.session.start` consumer only completes in 14A (see the rulings).
- **`src/contracts/commerce.ts`:**
  - `CheckoutCommand` is now `{ quoteId, cartVersion, paymentMethod, contactEmail? }`.
  - `CheckoutResultDTO` gains `total`, `statusToken` and `replayed`.
  - New `CheckoutStatusDTO`.
- **`src/lib/cart.tsx`:** `refresh()` on the cart context.
- **`src/components/CartView.tsx`:**
  - Server mode renders `CheckoutPanel`. It is disabled while a line is unavailable or a price change is unaccepted.
  - After placement it shows `OrderReceived` and re-reads the server cart instead of clearing it.
  - Legacy (browser-only) mode: the fake "Thank you for your order" screen, the invented 7.25% tax/total and the clear-on-checkout are removed. Checkout there is disabled with "not available yet".
- **Tests:**
  - `tests/unit/cart-view.test.mjs` (5), `tests/unit/cart-route.test.mjs` (checkout routes and header passthrough), `tests/unit/operations-route.test.mjs` (two schedules);
  - `tests/ui/cms-smoke.mjs`: a new Task14A block with a real browser checkout.

## Commands and results

All gates were run from PowerShell in the worktree, one at a time. C: had 7.7 GB free.

| Gate | Result |
|---|---|
| RED `checkout.test.mjs` (8 tests) | 8/8 failed: "Task 14A requires cart checkout and checkoutStatus" and "Task 14A schedules coupon hold expiry" |
| RED `checkout-client.test.mjs` | failed: module missing |
| RED `cart-view.test.mjs` | 3/4 failed (no panel; legacy fake checkout present) |
| RED review tests I1–I3 | 3/3 failed for the intended reasons, verified by temporarily disabling each fix: cookie cleared, `order_id` null, no inclusive tax adjustment. The `checkout-client` resume test failed on the missing API. The CartView resume test was written after its effect and was not seen failing. |
| `checkout.test.mjs` (final) | **11/11** |
| `npm test` (final) | **468/468**: 21 legacy + 170 unit + 277 integration; boundaries pass |
| `npm run check` | **exit 0**: 0 errors, 23 warnings (all pre-existing), typecheck clean, build compiled. The first run failed on one new lint error (`useMemo` needs an inline function in `CheckoutPanel`), fixed. A later run failed only because the temporary RED backups under `temp/red` were typechecked; they were removed. |
| Browser smoke `node --conditions=react-server tests/ui/cms-smoke.mjs` | **exit 0** (`.next/dev` cleared, about 1 GB free RAM): PASS Task09 ×2, Task10C, Task13A, **Task14A**, "Browser smoke passed". The first run failed because `.g-btn`/`.g-heading` are `text-transform: uppercase` and `innerText` returned "REVIEW ORDER"; the smoke text checks are now case-insensitive. Log: `temp/14a-smoke.log` |

## Review

One read-only reviewer (code-reviewer) covered the slice and found no Critical issues. It confirmed:
- idempotency under concurrency, including same-key waiting, the revision winner and clean re-runs after a deadlock retry;
- no partial state survives a failure;
- lock order is safe against cart mutations and both expiry sweeps;
- authorization is actor-scoped, with the token in the POST body and `no-store` responses;
- totals reconcile with the seal;
- there is no fake paid state.

Important findings, re-graded and fixed test-first:
1. **I1 — lost-response recovery was not wired.** After a reload, `getCart` cleared the guest cookie and nothing resent the attempt, so a guest could lose the order number and token. Fixed in two places:
   - the converted cart keeps its capability for a day;
   - the browser keeps the whole command with its key and resends it on load (`resumeCheckout`), then shows the receipt.
2. **I2 — the holds of a pending order expire and the order is not touched.** Partly fixed: the coupon redemption is now linked to its order (`order_id`), like the stock reservation. The order-level policy is a ruling for 14B (below).
3. **I3 — inclusive tax was not stored on the order.** Fixed: a `kind='tax'` adjustment per line with `included: true`.

### Deferred minors

- **M2:** two tabs placing the same quote get different keys. The second gets `CHECKOUT_CONFLICT` and is not pointed to the winning order.
- **M3:** replay reads only `idempotency_records`, which are kept 30 days. After they are purged, the same key is 409 "already in progress" forever. A fallback to `checkout_attempts` → `orders` is needed before any purge job exists.
- **M4:** the guest status token is HMAC(auth secret, order id). Rotating the secret breaks replayed tokens. A revoked token cannot be reissued for the same order.
- **M5:** the order `policy_versions` copies the quote's `request` (market, display currency, raw coupon input). The delivery address itself is not in `policy_versions`; it is in `order_addresses`.
- **M6:** the 14A `payments.session.start` handler completes `order.placed` jobs with no effect. 14B cannot re-drive orders placed before it. Acceptable for demo orders.
- **M7:** a deterministic error at COMMIT (the seal) surfaces as 500, which the UI treats as "retry". It would loop on the same key until the shopper re-quotes.
- **M8:** the panel says "This total is held until …". It is the quote's validity, not a hold.
- **M9 (test gaps):**
  - no test forces a 40P01 mid-closure;
  - expiry after placement is not tested end to end.

## Rulings

- **The checkout key is a header and the contact comes from the quote.** `Idempotency-Key` carries the key. Contact name and phone come from the quote's delivery snapshot (D06); only an optional email is added at checkout. If wrong, the contract gains a separate contact block, compared against the delivery snapshot.
- **Only `paymentMethod: "demo"` is accepted.** `kaspi` and `secondary` are 409 `PAYMENT_UNAVAILABLE` (D03).
- **The guest status token is derived, not stored.** HMAC(secret, order id), so a retried key returns the same token. Only its sha256 is stored, valid for 90 days. If wrong, store an encrypted token or issue a new one per replay.
- **The guest cookie outlives conversion by a day.** The converted guest cart keeps its capability for that day; the cart view is empty. If wrong, a lost response after a day cannot be recovered by the guest except through the receipt in session storage.
- **The `payments.session.start` consumer is a no-op in 14A.** A demo order needs no provider session; 14B replaces the handler. Leaving the kind unregistered would leave ready jobs that inflate the job-lag metric.
- **Order-level expiry is 14B.** In 14A a pending order keeps `pending_payment` when its 15-minute stock and coupon holds expire; both are released by the sweeps, and the order still records them by `order_id`. Section 6 assigns the "expiry racing capture" policy (re-reserve or fulfillment exception plus refund) to the payment and capture work, and 14B's test list includes it. **14B must decide and implement** what an expired, unpaid demo order becomes (for example cancelled with an `order_events` row, or kept with a visible "hold expired" state), locking attempt, order, reservation and redemption in that order. If wrong, a stale demo order shows "Awaiting payment" after its stock was released.
- **Admin markdowns stay in the unit price.** The pre-markdown prices are kept in `orders.policy_versions.markdownLines`, not as discount adjustments, so discount sums are not double-counted.
- **Legacy browser cart mode has no checkout.** Real orders need PostgreSQL + auth mode.
- **Ledger.** As in 13A/13B, the ledger is these handoff and progress docs, not the SDD workspace script.

## Exact next step

**Task 14B — payment interface, demo adapter, verified inbox and capture.**
1. Read the Task 14 section of the XL plan, Section 6 "Checkout, inventory, and payment", decisions D03 and O07, and this handoff's rulings (order-level expiry above, M6, M7).
2. Read the internal APIs this task builds on:
   - `src/server/checkout/service.ts` (`PAYMENT_START_KIND`, the payment attempt row);
   - `src/server/operations/registry.ts`;
   - `src/server/inventory/reservations.ts` (`consumeReservation`);
   - `src/server/pricing/coupons.ts` (`consumeCouponQuota`, `releaseCouponQuota`);
   - the `payment_attempts`, `payment_transactions` and `webhook_inbox` guards in `drizzle/0003` and `0004`. The demo provider may only use the statuses `created`, `pending`, `simulated`, `failed` and `cancelled`.
3. Build:
   - a typed provider interface;
   - an explicitly simulated demo adapter, whose results carry environment and provenance and never create real-capture facts;
   - the verified inbox;
   - idempotent capture → `consumeReservation` and quota consume;
   - one active payable attempt per order;
   - a reconciliation job on the worker;
   - a browser return URL that can never mark an order paid.
   - Also the order-level expiry policy.
4. Cover the 14B test list in the plan.
5. Run the gates from PowerShell, one at a time, with the smoke alone. Remove `.next/dev` before the smoke and keep the smoke's text checks case-insensitive. Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`.

**STOP_AFTER is Task 22.**
