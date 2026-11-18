# Task 14B handoff: payment interface, demo adapter, verified inbox and capture

**Status: complete, 2026-11-17**, including the review fix pass. Task 14 is complete; Task **16A** is next (15 is merged into 14).

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `92b2737` (14A). See `git log` for the 14B commit.

No push, merge, deployment, real import, provider registration or backend activation has been done. **Payments stay the explicit demo mode (D03).** The application registers only the simulated demo adapter, so no order can become paid in this build and O07 stays open. The capture path is exercised in tests by a test-only sandbox adapter that lives inside `tests/integration/payments.test.mjs` and is never registered by the application.

**No migration.** The 0002–0004 guards already had `payment_attempts` (payable unique index, demo status limits), `payment_transactions`, `refunds` and `webhook_inbox`.

## Files

### New

- **`src/server/payments/provider.ts`**: the typed `PaymentProvider` interface:
  - `startSession` (stable idempotency key per attempt);
  - `verifySignature(rawBody, headers)`;
  - `parseEvent(rawBody)` (re-run from the inbox);
  - `lookup` (reconciliation).
  - It also has the normalized `PaymentEvent` and `PaymentProvenance` (provider, environment, merchant account, `simulated`). `createPaymentProviders` allows a simulated provider only as `demo/demo`.
- **`src/server/payments/demo.ts`**: the explicitly simulated demo adapter:
  - its session is `demo-session:<attemptId>` with provenance `simulated: true`;
  - it has no webhooks (verification always fails);
  - its lookup is always `pending`.
- **`src/server/payments/providers.ts`**: `paymentProviders()`, which registers the demo adapter only.
- **`src/server/payments/service.ts`**:
  - **`startPaymentSession`** calls the provider outside any transaction with the attempt's stable key. It then records the session id, moves the attempt `created → pending` and writes a `payment.session_started` event with provenance. A lost response records nothing; the retry reaches the same session. A recorded session is not requested again.
  - **`receiveWebhook`**:
    - The raw body is inserted into `webhook_inbox` first (durable receipt). Simulated or unknown providers get 404; bodies over 64 KB get 413.
    - The signature is then verified over the exact bytes. The event must be readable, valid, and in the adapter's own merchant account and environment.
    - A valid event becomes `verified/queued` with a `payments.inbox.process` job. Otherwise the receipt is kept as `rejected`.
    - A duplicate provider event id keeps its receipt, closed as rejected, and the original row stays the fact.
  - **`processInboxEvent`**: applies the event and marks the row `processed` in one transaction. A crash rolls back both, so the retry applies it once. A processed row is a no-op.
  - **`applyPaymentEvent`** (also used by reconciliation). Lock order: checkout attempt, order, payment attempt.
    - **Mismatch** (amount, currency, session, missing transaction id): an internal `payment.event_rejected` event. For a capture (review I2):
      - a KZT capture is still recorded at the event amount, with a `capture_mismatch` refund request;
      - a non-KZT capture gets a `payment.unrecorded_capture` alert;
      - either way the order is flagged `fulfillment_status='exception'` and never paid.
    - **failed / cancelled**: these only end a payable attempt. An `authorized` attempt ignores `failed` (review I3). The order goes to `payment_status='failed'` only when no other attempt is still open (M7).
    - **authorized**: an authorization transaction is recorded, and the attempt and order become `authorized`.
    - **captured**: a `capture` transaction is recorded with `ON CONFLICT DO NOTHING`, deduplicated by provider transaction id. A repeat returns `duplicate` with no effect. The order outcome is then:
      - **Already paid, or a superseded attempt:** `late_captured`, plus a `duplicate_capture` refund request. No inventory change.
      - **Explicitly cancelled** (no `order.expired` event): stays cancelled, `payment_status='paid'`, attempt `late_captured`, and a `late_capture_after_cancellation` refund request. Never reactivated.
      - **Pending, or expired-cancelled:** the other payable attempts become `superseded`, each with a `payment.void_required` event (review I4). Then the promotion is locked and stock is consumed:
        - an active hold is consumed;
        - an ended hold is re-reserved atomically and consumed.
      - **Success:** `confirmed/paid`, the coupon consumed (an ended coupon hold gives a `coupon.quota_overrun` event, never a refusal of captured money), `order.paid`, and `order.reinstated` after an expiry.
      - **Allocation refused** (no stock, or any deterministic error; review I1): the hold is released, the coupon released, the order becomes `cancelled/paid/exception`, and a refund request is made with reason `late_capture_no_stock` or `allocation_failed`. The capture fact is never rolled back.
  - **`reconcilePayments`**: real (non-simulated) providers only. Attempts that are `pending/requires_action/authorized/unknown` and have a session are looked up outside any transaction, and a reported fact is applied like a webhook.
  - **`replacePaymentAttempt`**:
    - It locks the order. The order must be `pending_payment` and `unpaid` or `failed`. Any payable attempt gives 409 `PAYMENT_ATTEMPT_ACTIVE`.
    - It then inserts the next attempt with reference `GRM-n-<seq>` and key `payment:<checkout>:<seq>`, and enqueues `payments.session.start`.
  - **`expireUnpaidOrders`**: the order-level expiry policy (below). It pages by keyset `(placed_at, id)` and never selects orders whose attempt is authorized, unknown or requires action. Failures are reported per order, not swallowed (review I5).
- **`src/server/payments/http.ts`**:
  - `handlePaymentReturn` writes nothing and drops every query value except a UUID `order`. It answers 303 to `/cart?order=<id>`.
  - `createWebhookHandler` refuses unknown or simulated providers before reading the body, and reads at most 64 KB whatever `Content-Length` says (review I6).
- **`src/server/payments/runtime.ts`**: the webhook handler, available only in PostgreSQL mode.
- **Routes:**
  - `src/app/api/payments/webhooks/[provider]/route.ts` (POST; 404 for every provider today);
  - `src/app/api/payments/return/route.ts` (GET).
- **Tests:** `tests/integration/payments.test.mjs` (18).

### Changed

- **`src/server/checkout/service.ts`:**
  - `placeOrder(..., options?: { payments })` uses a registered real provider for `kaspi`/`secondary` (order `payment_mode='live'`). Without one, they are still 409 `PAYMENT_UNAVAILABLE`, which is the only path the HTTP route has.
  - Results and status report `paymentMode` from the order, and status reads `demo` and `live` orders.
- **`src/server/inventory/reservations.ts`:** `expireReservation(client, { reservationId, asOf? })`, which expires one due hold in the caller's transaction.
- **`src/server/operations/registry.ts`:**
  - `payments.session.start` now opens the session (it replaces the 14A no-op).
  - New `payments.inbox.process`, `payments.reconcile` (every 60 s) and `orders.unpaid.expire` (on `RESERVATION_EXPIRY_INTERVAL_MS`, keyset-paged; failures are logged by code).
- **`tests/unit/operations-route.test.mjs`:** the four schedules.

## Commands and results

All gates ran from PowerShell in the worktree, one at a time. C: had 8.6 GB free.

| Gate | Result |
|---|---|
| RED `payments.test.mjs` | failed: `ERR_MODULE_NOT_FOUND` `src/server/payments/service.ts` |
| `payments.test.mjs` (first green) | 13/13 |
| Mutation check | Two mutations failed 2 tests and the source was restored: never allocate on re-reserve, and drop the already-paid refund branch. |
| RED review tests (pre-fix service swapped in, then restored) | 6 failed: mismatch/I2, I3, I1, I4, I5, I6. 12 passed. |
| `payments.test.mjs` (final) | **18/18** |
| `npm test` (final) | **486/486**: 21 legacy + 170 unit + 295 integration; boundaries pass. An earlier run was stopped mid-way because the fix pass changed files under it. That killed run left four orphaned `temp/grmn-test-postgres-*` instances; they were stopped and removed. |
| `npm run check` | **exit 0**: 0 errors, 24 warnings. The one new warning (an unused `work` parameter in `payments.test.mjs`) was then fixed, and eslint on that file is clean. Typecheck clean; build compiled, including `/api/payments/return` and `/api/payments/webhooks/[provider]`. |
| Browser smoke `node --conditions=react-server tests/ui/cms-smoke.mjs` | **exit 0** on the second run. The first run failed before any 14B code: `/admin/products` returned 500 because Turbopack could not fetch Google Fonts ("Can't resolve '@vercel/turbopack-next/internal/font/google/font'"). Systematic check: `fonts.googleapis.com` answered 200 afterwards, so the failure was a transient fetch. The rerun, with `.next/dev` cleared and about 0.8 GB free RAM, printed PASS for Task09 ×2, Task10C, Task13A and Task14A, then "Browser smoke passed". Log: `temp/14b-smoke.log` |

## Review

One read-only payments reviewer (payments-billing-engineer) found no Critical issues. It confirmed that nothing can mark a demo order paid, that the return URL is safe, that capture is deduplicated under duplicates, retries, reconciliation races and crashes, and that there is no lock cycle with checkout or the sweeps.

Important findings, all fixed test-first (RED observed against the pre-fix code):
- **I1:** an allocation error after capture rolled back the capture fact.
- **I2:** a mismatched capture dropped real money.
- **I3:** a late `failed` undid an authorization.
- **I4:** other attempts stayed payable after a capture, and `superseded` was never written.
- **I5:** the expiry sweep could stall and swallowed errors.
- **I6:** the webhook body read was unbounded, and the demo provider passed the 404 check.

**I7** (anonymous traffic grows `webhook_inbox`; rows cannot be deleted) is a ruling (below). Minor M3 (malformed `occurredAt`), M4 (lock-order comment) and M7 (stale failure flips the order) were fixed alongside.

### Deferred minors

- **M1:** reconciliation does not touch `updated_at` after a lookup, so the oldest 100 rows are re-polled. `created` attempts whose session job dead-lettered are never reconciled. Failures are counted, not logged.
- **M2:** no sweeper re-enqueues `received` inbox rows (a crash between insert and verify) or `queued` rows whose job died.
- **M5:** a sandbox provider's orders are `payment_mode='live'` and report "live". The enum has no sandbox value.
- **M6:** `cancel_requested` counts as an explicit cancellation on capture (auto refund). Task 16 should decide it.
- **M8:** duplicate deliveries are stored as `rejected`, mixed with forgeries. An event row or a counter would separate them.
- **M9:** expiry cancels attempts locally only; a live provider session stays open. A later capture goes through the late-capture path.
- **M10:** `processInboxEvent(..., { beforeCommit })` is a test seam on a production function.
- **From 14A, still open:** M2, M3, M4, M5, M7 and M8. **14A M6 is resolved:** orders placed before 14B have no session, and the demo needs none.

## Rulings

- **Order-level expiry (the 14A ruling):** an unpaid order (`pending_payment`, payment `unpaid`/`pending`/`failed`) whose stock hold has ended, and none is active or consumed, is **cancelled**:
  - payable attempts cancelled, the hold expired and the coupon released;
  - a customer-visible `order.expired` event.
  - Lock order: checkout attempt, order, payment attempts, promotion, reservation, redemption.
  - Orders with an authorized, unknown or requires-action attempt are left for reconciliation.
  - If wrong, a demo order disappears from "Awaiting payment" after 15 minutes, which matches the stock already being released.
- **Demo payment never succeeds:** no simulate-success control exists, so no demo order can be paid (O07 open, D03). If wrong, the owner decides how staff confirm manual payment (O07).
- **The capture core is tested through a test-only sandbox adapter** placed via `placeOrder(..., { payments })`. The application registers no real provider. If wrong, real adapters will need their own signature formats; the interface keeps `verifySignature` and `parseEvent` separate for that.
- **Mismatches:**
  - Merchant account or environment not matching the adapter is rejected at receipt.
  - Amount, currency or session not matching the attempt is processed as `mismatch`. A KZT capture is recorded at its own amount with a refund request and a fulfillment exception.
- **Late capture after an expiry:** re-reserve and reinstate if stock allows. Otherwise the order becomes `cancelled/paid/exception` with a refund request. The order status for "paid but cannot ship" is `cancelled`, not `confirmed`, so nothing can ship it. If wrong, Task 16 may prefer `confirmed` plus the exception.
- **Refund requests are `refunds` rows with status `reserved`**, plus an internal `payment.refund_required` event. There is no outbox event, because no consumer exists; provider refunds are in the deferred backlog. Task 16B executes or resolves them.
- **A coupon hold that ended before a successful late capture:** the quota is not re-consumed, and a `coupon.quota_overrun` event is recorded. The shopper paid the quoted price.
- **I7, rate limiting and retention of rejected webhook receipts, is deferred to Task 21** (rate limiting) and to real provider activation. Today no real provider is registered, so every webhook POST is 404 before anything is stored.
- **Ledger.** As before, the ledger is these handoff and progress docs.

## Exact next step

**Task 16A — manual fulfillment and order timeline** (15 is merged into 14).
1. Read the Task 16 section of the XL plan and this handoff's rulings, especially:
   - refund requests as `reserved` refunds;
   - `fulfillment_status='exception'` orders that must not ship;
   - M6 (`cancel_requested` on capture).
2. Fulfillment must refuse unpaid, demo-unpaid and exception orders, and must never decrement consumed stock again (allocations exist after capture).
3. Run the gates from PowerShell, one at a time. Before the smoke, remove `.next/dev`. Stop any orphaned `temp/grmn-test-postgres-*` instances left by killed runs: they hold RAM.

**STOP_AFTER is Task 22.**
