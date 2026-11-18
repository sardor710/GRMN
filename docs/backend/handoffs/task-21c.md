# Task 21C handoff: manual payment confirmation (owner decision O07)

**Status: complete, 2026-11-18.** Built on the VPS (branch `beta`), test-first. Purchases can now reach "paid": staff confirm the payment by hand. The rules are in [decisions.md, "O07: manual payment confirmation"](../decisions.md#o07-manual-payment-confirmation-owner-decision-2026-11-18).

No production `.env`, deployment, real import or production migration has been done. Nothing is exposed to the internet: test databases are disposable embedded PostgreSQL instances, and the smoke's dev server binds `localhost`.

## Files

### New

- **`drizzle/0013_manual-payments.sql`** (generated, plus a hand-written seed at the end):
  - the CHECK constraints of `payment_attempts`, `payment_transactions` and `refunds` allow `provider='manual'`, but only with environment `live` and account `manual`;
  - `roles_code_valid` allows `owner`;
  - `store_settings.manual_payment_instructions` (text, 1–2000 characters or null) and `manual_payment_hold_hours` (default 48, 1–168);
  - the seed adds the `payments:confirm` permission and the `super_admin` and `owner` roles if they are missing. It grants `payments:confirm` to both roles, and gives `owner` every existing permission. This is needed because bootstrap seeds roles only once, so already bootstrapped databases get the change here.
- **`src/server/payments/manual-provider.ts`**: the manual adapter. It is real money (`simulated: false`, live). Its session is local (`manual-session:<attempt>`), and it has no webhooks and no lookups. Its `refund()` is never called.
- **`src/server/payments/manual.ts`**: `createManualPaymentService({ pool, authorize })`.
  - **`confirm(headers, { orderId, method, reference, amountMinor, note? })`**, which needs `payments:confirm` with fresh MFA. Methods are `bank_transfer`, `kaspi` and `cash`. In one transaction it calls `confirmManualCapture`, then writes an internal `payment.manual_confirmed` event and an audit entry `payment.manually_confirmed` (target: the order).
  - **`completeRefund(headers, { refundId, method, reference, note? })`**, which needs `payments:refund` with fresh MFA. It records the payout of a manual refund:
    - the refund becomes `succeeded` with `provider_refund_id = reference`;
    - `refreshPayment` runs;
    - it writes `refund.manually_completed` (internal), `refund.succeeded` (customer, the same key the revenue report joins on) and an audit entry `refund.manually_completed`.
    - The same reference replays; a reference already used by another refund gives `REFERENCE_USED` (it is also unique in the database).
- **`tests/integration/manual-payments.test.mjs`** (13 tests, one or more per O07 rule).

### Changed

- **`src/server/payments/service.ts`**:
  - **`confirmManualCapture(client, provider, input)`**. Lock order: checkout attempt, order, payment attempts, then (inside capture) promotion and reservation. It checks, in this order:
    1. A reference that already exists replays when the order, method and amount all match. On another order it is `REFERENCE_USED`; with a different method or amount it is `IDEMPOTENCY_CONFLICT`.
    2. No manual attempt gives `PAYMENT_NOT_MANUAL` (this covers demo orders).
    3. An already paid order gives `ORDER_ALREADY_PAID`.
    4. A cancelled order gives `ORDER_EXPIRED` if it has an `order.expired` event, otherwise `ORDER_CANCELLED`.
    5. An order that is not awaiting payment gives `ORDER_NOT_PAYABLE`.
    6. No active, unexpired hold gives `ORDER_EXPIRED`.
    7. An amount that differs from the order total or the attempt amount gives `AMOUNT_MISMATCH`.

    It then builds a `captured` event (transaction id = reference) and calls the existing `applyPaymentEvent` with source `staff` and evidence `{ method, note, confirmedBy }`. A `duplicate` outcome means a concurrent confirmation committed the same reference first; it becomes `REFERENCE_USED` and rolls back.
  - `applyPaymentEvent` and `recordTransaction` take optional extra evidence, which never overrides `source` or `provenance`.
  - Webhooks (`receiveWebhook`, and `http.ts` before the body is read) and `reconcilePayments` skip the manual provider.
- **`src/server/payments/providers.ts`**: registers the demo and manual adapters.
- **`src/server/checkout/service.ts`**:
  - `paymentMethod: "manual"`. The order is `payment_mode='live'` and the attempt `provider='manual'`.
  - The stock and coupon holds use `store_settings.manual_payment_hold_hours` (default 48).
  - `placeOrder(..., { allowDemo: false })` refuses demo with 409 `PAYMENT_UNAVAILABLE`.
  - `readCheckoutStatus` adds `paymentMethod`, plus `paymentInstructions` and `payBy`, which are only filled while a manual order awaits payment.
- **`src/server/cart/service.ts` and `runtime.ts`**: `allowDemoPayments`. The runtime sets it to `NODE_ENV !== "production"`.
- **`src/server/inventory/reservations.ts` and `src/server/pricing/coupons.ts`**: the maximum hold is now 168 hours (it was 24).
- **`src/server/fulfillment/aftersales.ts`**: `refreshPayment` is exported, and the refund workers never submit manual refunds. `RefundDTO` gains `manual` and `payoutReference`.
- **`src/server/fulfillment/service.ts`**: the order detail gains `payment: { method, confirmable, confirmation }`.
- **`src/server/fulfillment/http.ts` and `runtime.ts`**: `/api/admin/orders` POST gains the actions `confirm_payment` and `complete_manual_refund`.
- **`src/server/settings/service.ts`**: `manualPaymentInstructions` (`""` clears them) and `manualPaymentHoldHours`, both versioned and audited.
- **Auth:**
  - `payments:confirm` is added to `Permission` and `allPermissions`, and to the fresh-MFA list in `principal.ts`;
  - bootstrap's defaults gain `owner: allPermissions`.
- **Schema:** `payments.ts`, `configuration.ts`, `identity.ts`.
- **UI:**
  - **Checkout** sends `manual`. The receipt shows "Awaiting payment", the KZT total, "How to pay" with the instructions, the hold end, and that the order is not paid until confirmed.
  - **The admin order page** has a Payment panel: method, reference, amount received (typed, never prefilled, with the expected total shown) and an optional note, then "Confirm payment". Manual refunds have "Record payout".
  - **Admin settings** has a "Manual payment" section (instructions and hold hours).
- **Tests:**
  - `tests/unit/permission-matrix.test.mjs`: `payments:confirm` is denied to the other roles and needs MFA, `owner` is defined, and `manual.ts` checks its permissions;
  - `tests/ui/cms-smoke.mjs`: the new O07 step, plus Linux process-group cleanup and an optional `CMS_TEST_CHROME_NO_SANDBOX=1`;
  - `tests/integration/operations-jobs.test.mjs`: a race fix (Step 1).

## Commands and results

On the VPS, one gate at a time (about 8 GB RAM available).

| Step | Result |
|---|---|
| RED `manual-payments.test.mjs` | 13/13 failed: `ERR_MODULE_NOT_FOUND` `src/server/payments/manual.ts` |
| First green | 11/13. Both failures were test mistakes, fixed: a fixture authorizer was given real session cookies (401), and the expectation of "refunded" ignored the unrefunded shipping |
| `manual-payments.test.mjs` | **13/13** |
| Mutation checks | Dropping the amount check, or dropping the ended-hold check, each failed the refusals test. The source was restored |
| `test:unit` | **192 pass, 1 skipped** (a Windows-only test), 193 total |
| `test:legacy` | **73/73** |
| `test:integration` | **362/362** (349 earlier + 13 new), 29 files |
| `check:boundaries`, `lint`, `typecheck` | pass; lint 0 errors (24 warnings, unchanged); typecheck clean |
| `npm run build` | **exit 0**, no warnings |
| Browser smoke | **exit 0** (Playwright's Chrome for Testing 153 with `CMS_TEST_CHROME_NO_SANDBOX=1`, because Ubuntu 24.04 AppArmor blocks Chrome's user-namespace sandbox). PASS Task09 ×2, 10C, 13A, 14A (manual order, receipt with instructions), 16A, and the new **O07 step**: staff save the instructions in admin settings, the customer's receipt shows them, staff confirm from the admin order page (amount typed, method, reference), the order becomes `confirmed/paid` with one `manual` capture and an audit entry, shipping is offered, and the customer status API reports `paid`. The first attempt failed before any test step ("Chrome did not start", the sandbox). Receipt: `temp/21c-smoke` |

## Review

One read-only reviewer found no Critical issues. It confirmed:
- no path marks a demo, unconfirmed, cancelled or expired order paid;
- a reference cannot be recorded twice, including two orders racing;
- the lock order matches the expiry sweep and staff cancel;
- migration 0013 is safe for existing rows and the 0003 guard triggers;
- manual refunds are never submitted, and their completion matches the report join.

| Finding | Severity | Outcome |
|---|---|---|
| **I1:** the admin amount field was prefilled with the total, so entering only a reference confirmed the full amount, whatever actually arrived | Important | **Fixed:** the field is empty and required, with the expected total shown; the smoke asserts it starts empty |
| **I2:** a 48-hour hold (up to 168) lets anyone hold stock without paying | Important | **Ruling, owner follow-up** (below) |
| Money arriving after expiry has no recording path | Minor | Ruling (below) |
| `allowDemoPayments` defaults to true in the service | Minor | Kept: only the runtime decides, from `NODE_ENV`. Demo orders can never be confirmed (`PAYMENT_NOT_MANUAL`), so this is not money-unsafe |
| Reference normalization also collapses inner spaces and is ASCII-only | Minor | Ruling (below) |
| The same reference with a different method or amount gives 409, not a replay | Minor | Ruling (below) |
| `owner` cannot be assigned from the admin UI | Minor | True of every role today (roles are assigned in the database). Follow-up |
| No tests for: upgrading an already-bootstrapped database to 0013, confirm racing the sweep or a cancel, two payouts racing one reference, the `NODE_ENV` wiring | Minor | Deferred. The upgrade seed is idempotent SQL (`ON CONFLICT DO NOTHING`). The reviewer checked that the races are serialized on the order lock |

## Rulings

- **Manual orders are `payment_mode='live'`.** The money is real; `provider='manual'` says how it is collected. Fulfillment, reports and DTOs therefore needed no new mode. **Cost if wrong:** a report that wants to split manual from online revenue must group by provider, not by mode.
- **References** are trimmed, have runs of spaces collapsed, are upper-cased, and must be 1–120 printable ASCII characters. A reference is unique across all manual payments, whatever the method. The same reference, order, method and amount replays; any other combination is refused. **Cost if wrong:** a cash receipt "1" and a Kaspi reference "1" collide; staff can prefix, for example "CASH-1".
- **Hold abuse (review I2), owner follow-up.** Checkout is rate-limited per trusted client address (30/min, 21A), and staff can cancel unpaid orders, but nothing caps unpaid manual orders per customer. Options for the owner: a shorter default hold, a cap per phone/account/guest of N unpaid orders, or requiring sign-in for manual checkout. **Cost if wrong:** a script can reserve sellable stock for the hold period.
- **Money that arrives after expiry** is not recorded by the confirm action, which refuses expired orders as O07 requires. Staff refund it outside the system. **Follow-up:** a "record late receipt, then refund" action through the 14B late-capture path.
- **Manual refunds** are reserved like any refund (16B), then completed by staff with a payout reference. They never go to a provider.
- **The `owner` role** holds every permission, like `super_admin`. **Cost if wrong:** if the owner should not manage staff, remove `staff:manage` from the role.

## Exact next step

1. Owner: decide the hold-abuse policy (I2) and confirm the default methods, roles and 48 hours.
2. 21B: load and failure injection on this VPS (O05), with the other services' load observed alongside.
3. Task 23 (owner-run): apply migrations 0011–0013 before importing data.
