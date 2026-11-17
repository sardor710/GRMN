# Task 16B handoff: cancellation, returns and refunds

**Status:** complete on 2026-11-18. It absorbs Task 17, so Task 16 is complete. Two items remain open:
- the browser smoke for 16A and 16B (it was not run because RAM was short);
- Task **18A** is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `9afd247` (16A). The 16B commit is in `git log`.

Nothing was pushed, merged or deployed. No provider was registered and no real refund was issued. **No migration:** the 0003 schema already has `refunds`, `refund_items`, `returns`, `return_items`, the refundable-balance trigger and the restoration and return guards.

## Files

### New

**`src/server/fulfillment/aftersales.ts`**

`createAfterSalesService({ pool, authorize, providers })` provides four staff actions.

- **`cancelOrder`** (`orders:fulfill`): `{ orderId, expectedOrderVersion, idempotencyKey, reason }`.
  - **Unpaid** (payment not `paid` or `partially_refunded`): the open payment attempts are cancelled, and an `unknown` or `requires_action` attempt gives 409 `PAYMENT_PENDING`. The promotion is locked, active stock holds are released and the coupon quota is released. An authorization also gets an internal `payment.void_required` event.
  - **Paid and unshipped:** this path also needs `payments:refund`.
    1. Ready shipments are cancelled.
    2. Every allocation's unshipped units are restored. Each restoration is one `compensate` movement (`+on_hand`, `allocation_id`, dedupe `compensate:<allocationId>:cancel:<orderId>`) plus `restored_quantity`.
    3. The paying capture's remaining balance is reserved as a refund. Each item's unrefunded quantity gets its own line (cumulative shares), plus shipping if it was not refunded. A positive residual becomes an adjustment line. If the lines exceed the balance, the balance is refunded as one adjustment.
  - **Shipped** (anything dispatched or delivered): 409 `ORDER_SHIPPED`.
  - Already cancelled or closed orders give 409 `ORDER_NOT_CANCELLABLE`. Legacy orders give 409 `LEGACY_ORDER`.
  - Every cancellation writes a customer `order.cancelled` event and an audit row.
- **`refund`** (`payments:refund`, which needs fresh MFA): `{ orderId, idempotencyKey, reason, items?[{orderItemId, quantity}], shipping?: true, adjustmentMinor?, restock?: boolean }`.
  - The refund is against the **paying capture**: the capture that has no 14B `refund:<transactionId>` request.
  - **Item lines:** for `quantity` more units after `done` units already refunded, `share(x) = floor(x·(done+q)/Q) − floor(x·done/Q)`, for both discount and tax. More units than were bought gives 409 `REFUND_EXCEEDS_ITEM`.
  - **Shipping line:** `shipping_minor` plus `shipping_tax_minor`, once. A second request gives 409 `SHIPPING_ALREADY_REFUNDED`.
  - **Balance:** committed refunds (reserved, pending, unknown, succeeded) plus this refund must stay within the capture, else 409 `REFUND_EXCEEDS_BALANCE`. The 0003 trigger error maps to the same 409.
  - **Restock of unshipped units** (unless `restock: false`):
    - Units restored = `clamp(min(done + q, owed + R) − R, 0, q)`, where `owed` is the units not dispatched and `R` is the units already restored by refunds (review C1).
    - If those units are claimed by a ready shipment, the result is 409 `SHIPMENT_PENDING`: cancel that shipment first.
- **`createReturn`** (`orders:fulfill`): `{ orderId, idempotencyKey, reason, lines[{orderItemId, quantity}] }`.
  - Lines are spread over dispatched or delivered shipment items that are not already claimed by an open return.
  - More units than that gives 409 `RETURN_EXCEEDS_SHIPPED`.
  - `returns.idempotency_key` is `sha256(staff:key)`.
- **`updateReturn`** (`orders:fulfill`): `{ returnId, expectedVersion, idempotencyKey, action, lines? }`.
  - `authorize`, `reject` and `cancel`.
  - `receive` takes every line with `receivedQuantity ≤ quantity`.
  - `inspect` takes every line with `acceptedQuantity ≤ received` and a decision of `restock`, `quarantine` or `dispose`.
    - Status `inspected` is set first. For `restock` only, `restocked_quantity = accepted`, `restored_quantity += accepted`, and one `return` movement is written (dedupe `return:<returnItemId>`).
  - `close`.
  - A wrong state gives 409 `INVALID_TRANSITION`.
- **`submitRefund(pool, providers, refundId)`** runs outside the caller's transactions:
  1. It locks the order and marks the refund `pending`.
  2. It calls `provider.refund` with the refund's stable `idempotency_key`.
  3. It locks again and applies the answer:
     - succeeded: the refund is recorded with its provider id, the payment summary is refreshed, and a customer `refund.succeeded` event is written once;
     - failed: the reservation is released and an internal `payment.refund_failed` event is written;
     - pending: the refund stays pending;
     - thrown: the refund becomes `unknown` and the reservation is kept.

   A refund that is already finished is not sent again.
- **`processRefunds(pool, providers, { limit })`:** the worker sweep over `reserved`, `pending` and `unknown` refunds of real (non-simulated) providers.
- **`readRefunds` / `readReturns`:** the staff DTOs.

**Tests**
- `tests/integration/aftersales.test.mjs` (15 tests).
- `tests/unit/operations-route.test.mjs` now expects the refund schedule.

### Changed

- **`src/server/payments/provider.ts`:** `RefundRequest`, `RefundResult` and `PaymentProvider.refund`.
- **`src/server/payments/demo.ts`:** the demo adapter's `refund` answers `failed`. It has no captures (D03).
- **`src/server/fulfillment/service.ts`:**
  - It exports the shared helpers (`lockOrder`, `refreshOrder`, `inTransaction`, `orderEvent`, `requestHash`, `isLegacy`, `OrderRow`).
  - `getOrder` now returns `refunds` and `returns`.
- **`src/server/fulfillment/http.ts`:** POST actions `cancel_order`, `refund`, `create_return` and `update_return`. The `update_return` body uses `returnAction` for its own action.
- **`src/server/fulfillment/runtime.ts`:** builds the after-sales service with `paymentProviders()`.
- **`src/server/operations/registry.ts`:** `REFUND_PROCESS_KIND = "payments.refunds.process"`, scheduled every 60 s.
- **`src/contracts/commerce.ts`:** `RefundDTO`, `ReturnDTO`, `CancelResultDTO`, and `AdminOrderDetailDTO.refunds` and `.returns`.
- **`src/server/account/service.ts`:** customer labels `refund.succeeded` ("Refund issued") and `order.reinstated` (this fixes 16A M14).
- **`src/app/admin/orders/_components/FulfillmentScreen.tsx`:** a "Cancel order" button that asks for a reason, plus read-only refund and return lists.

## Commands and results

All runs were from PowerShell in the worktree, one at a time. C: had more than 9 GB free. Free RAM was 84–312 MB throughout, out of 8 GB in total. About 26 Claude processes and 13 Node processes outside this task held roughly 15 GB of private memory.

| Gate | Result |
|---|---|
| RED: `aftersales.test.mjs` | 10/10 failed: `ERR_MODULE_NOT_FOUND src/server/fulfillment/aftersales.ts`. |
| RED: `operations-route.test.mjs` | 1 failed, the schedule without `payments.refunds.process`. |
| First green | aftersales 10/10. operations-route 3/3. |
| Mutation check | Replacing cumulative-share rounding with per-refund `floor(x·q/Q)` at first **survived**: with price 3333 the discount (999) and tax (1080) divide by 3. The fixture was changed to 3334, after which the mutation failed the reconciliation test (0/1) and the restored code passes. |
| RED: review tests | 5 failed against the pre-fix code:<br>• C1: `restored_quantity` was 2, expected 1.<br>• I4: `restock` was `INVALID_INPUT`.<br>• I2: status was `partially_refunded`, expected `paid`.<br>• I1/I3: `FORBIDDEN` (the wrong branch).<br>• I5: an adjustment line instead of item lines. |
| `aftersales.test.mjs` (final) | **15/15**. `fulfillment.test.mjs` passes **11/11** after the `getOrder` change. |
| `npm test`, run 1 | 321/322. `auth-foundation.test.mjs` failed at file level ("Cannot confirm temporary PostgreSQL status; files retained"): `pg_ctl status` failed with 134 MB free. The retained instance was stopped and removed. Run alone, that file passes **19/19**. |
| `npm test`, run 2 | `account-services` failed 12 tests, plus `auth-integration` and one migration test, all with Postgres setup or connect `timeout expired`. Two retained instances were stopped and removed. |
| **Systematic attempt** | The same `npm test` components, one process each, cleaning retained instances between files: **legacy 21/21, unit 172/172, every integration file green (321/321 across 25 files), boundaries pass. 514/514.** The script is in the scratchpad and is reproduced below. Cause: the host is swapping, so each file's temporary Postgres sometimes misses its 2 s connect timeout. A failed file then leaves its instance running, which makes the next files worse. |
| `npm run check` | **Exit 0**: 0 errors, 23 warnings, all pre-existing (`<img>`). Typecheck is clean, and the build lists `/admin/orders` and `/api/admin/orders`. |
| Browser smoke | **Not run: 84 MB free** (the rule is to run it only with at least 1 GB free). |

The per-file gate loop runs these, one at a time:
- `npm run test:legacy`;
- `npm run test:unit`;
- `node --conditions=react-server --test <file>` for each `tests/integration/*.test.mjs`, stopping any `temp/grmn-test-postgres-*` instance between files (`pg_ctl -D <dir>/data stop -m fast`, then removing the directory);
- `npm run check:boundaries`.

Logs: `temp/16b-*.log`, `temp/gate-*.log` and `temp/16b-gates-per-file.log`.

## Review

One read-only reviewer (payments-billing-engineer) confirmed the following:
- The order lock is taken first everywhere: checkout, capture, fulfillment, after-sales, and both `submitRefund` transactions.
- The free and owed calculations match the restoration trigger.
- Stock is compensated exactly once across retries, the cancel-versus-dispatch race and returns.
- The rounding is exact.
- Returns transitions and bounds hold.
- The idempotency keys are sound.

Findings and what happened to them:

| Finding | Severity | Outcome |
|---|---|---|
| **C1:** a failed item refund left its units restored, so refunding the same units again restored them a second time | Critical | **Fixed.** Earlier restorations by refunds now count. Test: `review C1`. |
| **I1:** the oldest capture was used, which could be a mismatched one | Important | **Fixed:** the paying capture is used. Test: `review I1/I3` (its I1 half runs only if 14B pays after a mismatch). |
| **I2:** the payment summary counted every capture and refund | Important | **Fixed:** only the paying capture counts. Test: `review I2`. |
| **I3:** an unpaid order with a mismatched capture took the captured branch | Important | **Fixed:** the branch now follows `payment_status`. Test: `review I1/I3`. |
| **I4:** an item refund always restored unshipped units first | Important | **Fixed** with `restock: false`. Test: `review I4`. |
| **I5:** cancelling after any refund collapsed the refund into one adjustment | Important | **Fixed:** item lines plus a residual. Test: `review I5`. |
| **I6:** refunds are submitted automatically | Important | **Ruling**, below. |

### Deferred minors

- A later provider answer with a different `providerRefundId` is ignored by `COALESCE`, with no event.
- A `provider_refund_id` unique conflict makes the sweep fail that refund on every run: no attempt cap, no dead-letter. The sweep orders by `updated_at`, so refunds that keep failing can starve newer ones.
- Every thrown provider error becomes `unknown`, including programming errors. Nothing ever sets `cancelled`.
- `authorize` (more pool queries) runs inside the cancel transaction when a capture lands between the pre-check and the lock.
- Compensating movements are written in item-id order, not `(variant, location)` order. Concurrent cancels on different orders could deadlock on balances; `withInventoryTransaction` retries hide this.
- An uncaptured cancel leaves `payment_status` as `authorized` or `pending`. Pending provider sessions get no void event.
- An item refund moves stock but needs only `payments:refund`.
- The UI shows "Cancel order" on shipped orders, which return 409. The UI mints a new key per click (16A M7).
- `service.ts` and `aftersales.ts` import each other. This is safe today because nothing runs at module load.
- `updateReturn` does not call `refreshOrder` after a restock (16A M10 area).
- Still open from 16A: M5–M13 and M15. M14 is fixed.

## Rulings

- **I6: automatic refund submission is intended.** A refund row is created only by:
  - a staff action that needs `payments:refund` with fresh MFA (`refund`, or cancelling a paid order);
  - 14B for money the shop must return (duplicate, mismatched, late or unallocatable captures).

  The worker submits both. The application registers no refunding provider (only the simulated demo adapter, which never has captures), so in this build every refund stays `reserved`. That is the "simulated adapter" outcome until a real provider is activated from the deferred backlog. If this is wrong, add an approval step before `submitRefund` for 14B rows.
- **Unpaid versus paid cancellation follows `payment_status`, not "has a capture".** A mismatched capture on an unpaid order already has its own 14B refund request.
- **A cancellation refund goes against the paying capture's remaining balance, item by item.** If the lines exceed the balance (an earlier adjustment refund returned part of it), the balance is refunded as one adjustment line. If this is wrong, the item ledger of that order does not reconcile line by line; the money still does.
- **Unshipped units first** (16A ruling I2): an item refund restores up to the refunded quantity of not-yet-dispatched units.
  - Staff opt out with `restock: false` when the refunded units were shipped.
  - Units claimed by a ready shipment give 409 `SHIPMENT_PENDING`. This deviates from ruling I2's "cancel ready shipments first": staff cancel the shipment explicitly instead of the refund doing it silently.
- **A paid cancellation keeps the coupon quota used.** If this is wrong, the shopper can reuse a per-user coupon only after staff intervention.
- **Returns record goods only.** Refunding returned goods is a separate `refund` action with `restock: false`. Customer-initiated returns and cancellation requests are not built: staff act on the customer's behalf.
- **Gate method:** with less than 300 MB free, `npm test` is run as its components, one process per test file, with retained instances cleaned between files. The test code is the same; only the process boundaries differ.

## Exact next step

1. When the host has at least 1 GB free, run the browser smoke (still open for 16A and 16B), from PowerShell and alone:
   - `Remove-Item -Recurse -Force .next/dev`
   - `node --conditions=react-server tests/ui/cms-smoke.mjs`

   Expect a PASS line for Task16A before "Browser smoke passed".
2. **Task 18A: scheduled publishing and media uploads.** Read the Task 18 section of the XL plan and the Task 08–09 CMS handoffs. Lock the order first in any order-touching code (M8).

**STOP_AFTER is Task 22.**
