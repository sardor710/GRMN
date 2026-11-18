# Task 16A handoff: manual fulfillment and order timeline

**Status: code complete and committed, 2026-11-17. The browser smoke gate has NOT passed yet**, because of host memory (see Commands and results). The chain stopped here. Rerun the smoke on a machine with free RAM before starting 16B.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `7981280` (14B). See `git log` for the 16A commit.

No push, merge, deployment, provider registration or backend activation has been done. **No migration.** The 0003 schema already had `shipments`, `shipment_items`, `shipment_events` and `returns`, with their guard triggers (claims capped by allocation, forward-only shipment states, immutable events).

## Files

### New

- **`src/server/fulfillment/service.ts`**: `createFulfillmentService({ pool, authorize })`.
  - **`listOrders`** (`orders:read`): the newest-first order queue, optionally by `fulfillmentStatus`, keyset-paged.
  - **`getOrder`** (`orders:read`):
    - items with `allocated` / `claimed` / `shipped` / `remaining`;
    - shipments;
    - the full recorded timeline (all `order_events`);
    - `legacy` and `fulfillable { allowed, reason }`.
    - Carrier, tracking reference and internal notes are returned only with `orders:fulfill`.
  - **`createShipment`** (`orders:fulfill`): `{ orderId, expectedOrderVersion, idempotencyKey, lines[{orderItemId, quantity}], carrier?, trackingReference?, internalNote? }`.
    - It locks the checkout attempt, then the order, then the order's allocations (by id).
    - It spreads each line over allocations by their availability, using the same formula as the 0003 trigger (gross cap and net cap with restored and returned units).
    - It inserts the shipment as draft with its items, then sets it `ready`.
    - It records an internal `shipment.created` event, a `shipment_events` row and an audit row.
    - It derives the order's `fulfillment_status`.
    - **No stock movement.**
  - **`updateShipment`** (`orders:fulfill`): `{ shipmentId, expectedVersion, idempotencyKey, action, carrier?, trackingReference?, internalNote? }`, where `action` is one of:
    - `dispatch` (ready → dispatched; re-checks eligibility);
    - `deliver` (dispatched → delivered);
    - `cancel` (ready → cancelled);
    - `annotate`.
    - Dispatch and deliver add the customer-visible events `fulfillment.shipped` and `fulfillment.delivered`, deduplicated per shipment. Milestone times come from `clock_timestamp()`.
  - **Idempotency:**
    - The key is the `order_events.dedupe_key` `fulfillment:<staffUserId>:<key>`. Its payload holds a canonical request hash.
    - Same key and same body returns the original with `replayed: true`. Another body is 409 `IDEMPOTENCY_CONFLICT`, also when the reuse is concurrent on two orders (review I3).
    - A stale version is 409 `VERSION_CONFLICT`.
  - **Order status derivation:** delivered ≥ owed → `delivered`; dispatched ≥ owed → `shipped`; some dispatched → `partially_shipped`; ready → `processing`; else `unfulfilled`.
    - "Owed" is the order's allocated units minus restored units (review I1).
    - `exception` is never overwritten.
- **`src/server/fulfillment/http.ts`**: `/api/admin/orders`.
  - GET with no query or with `?fulfillmentStatus=&cursor=&limit=` lists; `?id=` alone reads one order. Duplicate parameters are 400.
  - POST is same-origin with `{ action: "create_shipment" | "dispatch" | "deliver" | "cancel" | "annotate", ... }`.
- **`src/server/fulfillment/runtime.ts`**: PostgreSQL only. It uses `requireStaffPrincipal` and `requirePermission`.
- **`src/app/admin/orders/_components/FulfillmentScreen.tsx`**: the queue with a status filter, item quantities to ship, carrier, tracking and note inputs, shipment actions, and the timeline. A not-shippable order shows its reason and no shipment form.
- **Tests:**
  - `tests/integration/fulfillment.test.mjs` (11);
  - `tests/unit/fulfillment-route.test.mjs` (2);
  - a Task16A step in `tests/ui/cms-smoke.mjs`: staff open `/admin/orders`, see the demo order with its `order.placed` timeline and "Not paid", and get no "Create shipment".

### Changed

- **`src/server/auth/admin-runtime.ts`**: `orders` in PostgreSQL mode goes to the fulfillment runtime. Before this, it was 501.
- **`src/app/admin/orders/page.tsx`**: shows `FulfillmentScreen` in PostgreSQL mode and the legacy `OrdersScreen` otherwise.
- **`src/contracts/commerce.ts`**:
  - `OrderDetailDTO.shipments: OrderShipmentDTO[]`, the customer view: `id`, `status` (dispatched/delivered), `dispatchedAt`, `deliveredAt` and `items` only;
  - the staff DTOs `ShipmentDTO`, `AdminOrderSummaryDTO`, `AdminOrderDetailDTO`, `TimelineEventDTO`, `ShipmentResultDTO` and `FulfillmentBlock`.
- **`src/server/account/service.ts`**: `getOwnOrder` returns dispatched and delivered shipments without carrier, tracking or notes, and adds the labels `order.paid` and `order.expired`.
- **`src/components/AccountDashboard.tsx`**: the order detail lists its shipments.

## Commands and results

All gates ran from PowerShell in the worktree, one at a time. C: had 9.4 GB free. The machine's free RAM fell from 0.9 GB to 0.1 GB during the session; Memory Compression grew to 3.8 GB, from processes that were not part of this task.

| Gate | Result |
|---|---|
| RED `fulfillment.test.mjs` | `ERR_MODULE_NOT_FOUND` `src/server/fulfillment/service.ts`. `fulfillment-route.test.mjs` failed: runtime missing. |
| `fulfillment.test.mjs` (first green) | 8/8 |
| Mutation check | Removing the `FULFILLMENT_EXCEPTION` guard failed the "cannot ship" test (0/1). The source was restored from a byte copy, with no diff. |
| RED review tests | 3 failed against the pre-fix code: I1 `partially_shipped` ≠ `shipped`; I3 raw `order_events_dedupe_key_unique` (no status, so the HTTP layer gave 503); I4 `SUPPORT-HIDDEN-TRK leaked to orders:read`. |
| `fulfillment.test.mjs` (final) | **11/11** |
| `npm test` run 1 | 486+ passed, 8 failed, all in `operations-jobs.test.mjs` with pg `timeout expired` (connect timeout). A read-only reviewer ran at the same time. That file alone: **8/8**. |
| `npm test` run 2 | 12 failed, all in `account-services.test.mjs` with the same `timeout expired` cascade (its first test hung for 74 s). That file alone: **12/12**. Diagnosis: each file starts its own temporary Postgres and the test pools use the default 2 s connect timeout, so under swap pressure one file's connections time out. The failing file differed between runs; nothing in 16A touches either module. |
| `npm test` run 3 (final) | **499/499**: 21 legacy + 172 unit + 306 integration; boundaries pass; exit 0. |
| `npm run check` | **exit 0**: 0 errors, 24 warnings. The one new warning (unused `_ignored` in the fulfillment request hash) was then fixed; eslint on the 16A files is clean, and the idempotency test was re-run green. Typecheck clean; build lists `/admin/orders` and `/api/admin/orders`. |
| Browser smoke run 1 (`.next/dev` removed first) | **exit 1**: `CDP timeout: Page.navigate` (`cms-smoke.mjs:51`) at the Task10C `/account` step, before the Task16A step. Task09 printed PASS. The Next log shows `/account` compiled and returned 200 in 4.1 s, then `GET /api/auth/get-session` took 11.7 s. |
| Browser smoke run 2 (`.next/dev` removed again) | **exit 1**: the same timeout. The log stops at `○ Compiling /account ...`. Free RAM was 0.1 GB afterwards. Stop condition: a gate still failing after one systematic-debugging attempt, with an environmental root cause. |

Logs: `temp/16a-*.log` and `temp/backend-next-three/08/ui-next.log`.

## Review

One read-only reviewer (code-reviewer) found no Critical issues. It confirmed:
- the lock order matches checkout and capture (attempt → order → allocations; shipment updates hold the order lock first);
- same-key serialisation under the order lock;
- the request hash covers order, shipment and action;
- the over-ship math matches the trigger;
- no stock movements are written;
- the customer DTO has no carrier, tracking or notes.

Important findings:
- **I1 (fixed):** the status derivation counted ordered units, so an order whose unit was restored (16B) could never reach `shipped` or `delivered`. Fixed by using allocated minus restored units. Test: `review I1`.
- **I2 (ruling, below):** `partially_refunded` is shippable, and availability rests only on `restored_quantity`.
- **I3 (fixed):** a concurrent reuse of one staff key on two orders surfaced 23505 as 503. It is now 409 `IDEMPOTENCY_CONFLICT`. Test: `review I3` (three rounds).
- **I4 (fixed):** support (`orders:read`) saw `trackingReference`. Tracking is now staff-fulfiller-only, like carrier and notes. Test: `review I4`.

### Deferred minors

- **M5:** the keyset cursor uses millisecond ISO, while timestamps are microseconds, so rows can be skipped at a page boundary. The ORDER BY cannot use `orders_fulfillment_queue_idx`.
- **M6:** the admin UI ignores `nextCursor`; only the newest 50 orders are reachable from the UI.
- **M7:** the UI mints a new idempotency key per click, so a resubmitted timeout is caught only by CAS (`VERSION_CONFLICT`).
- **M8:** the lock-order comment says "allocations, shipment". `updateShipment` locks the shipment first, then the trigger locks allocations; this is safe because the order lock is always held. 16B must also take the order lock first.
- **M9:** `getOrder` uses several pool queries (several snapshots); use one read-only REPEATABLE READ transaction.
- **M10:** staff `remaining` (allocated − claimed) drifts from the enforced availability once returns exist (16B).
- **M11:** internal notes are copied into immutable `order_events.payload` (retention and DSAR). Decide retention, or keep notes only in `shipments`/`shipment_events`.
- **M12:** `annotate` cannot clear carrier or tracking (`COALESCE`).
- **M13:** the UI shows write controls to `orders:read`-only staff, who get 403. Expose a `canFulfill` flag.
- **M14:** the customer label for `order.reinstated` is missing.
- **M15:** test gaps:
  - `partially_refunded` and `refunded` orders;
  - the real late-capture `cancelled/paid/exception` path (a forced UPDATE is used instead);
  - concurrent dispatch of one shipment with different keys.

## Rulings

- **Eligibility.** A shipment needs all of these:
  - a non-legacy order (`data_quality='complete'`, not `legacy_unknown`, has a checkout attempt);
  - `payment_mode='live'` and a `capture` transaction;
  - `payment_status` `paid` or `partially_refunded`;
  - `fulfillment_status <> 'exception'`;
  - `order_status='confirmed'`.

  `cancel_requested`, `cancelled` and `closed` orders cannot ship or dispatch (this resolves 14B M6 for fulfillment). A ready shipment can still be cancelled. If wrong, staff cannot ship a `cancel_requested` order before 16B decides the request.
- **Demo orders never ship**, even when their status is forced to paid (no capture fact; D03/O07). If wrong, O07 must define manual payment confirmation first.
- **I2: the refund-vs-shipping contract is a 16B obligation.** An item refund or cancellation of unshipped units must restore the allocation (`restored_quantity`) in the same transaction, after cancelling any ready shipment that claims those units; the restoration trigger already refuses while a non-cancelled shipment claims them. Fulfillment availability then follows automatically. If 16B records money-only item refunds without restoring, staff could ship refunded units, so 16B must test this.
- **Carrier, tracking reference and internal notes are staff-fulfiller-only** (`orders:fulfill`): support sees shipment status, items and times. Customers never see them (D04). If wrong, support loses tracking in its read view; a later scoped permission can open it.
- **Customer timeline:** only `fulfillment.shipped` and `fulfillment.delivered` (plus the existing customer events). The internal `shipment.*` events stay internal. Shipments shown to customers are dispatched or delivered only (ready is internal "processing").
- **A shipment is created `ready`.** Draft exists only inside the creating transaction, because the 0003 trigger requires items on a draft. There is no separate "pack" step.
- **No client-supplied milestone dates.** Strict inputs reject `dispatchedAt`, `occurredAt`, `status`, and so on. If wrong, backdating needs an audited correction event, not a field.
- **The test fixtures use a test-only sandbox adapter** to obtain paid orders (same as 14B). The application still registers only the demo adapter.
- **Ledger:** these handoff and progress docs, as before.

## Exact next step

1. **Rerun the browser smoke on a machine with free RAM** (aim for ≥1 GB), from PowerShell, alone:
   - `Remove-Item -Recurse -Force .next/dev`
   - `node --conditions=react-server tests/ui/cms-smoke.mjs`

   Expect PASS lines for Task09 ×2, Task10C, Task13A, Task14A and **Task16A**, then "Browser smoke passed". If the new Task16A step fails, fix it test-first and amend 16A in a follow-up commit.
2. Then **Task 16B — cancellation, returns and refunds** (absorbs 17). Read this handoff's rulings, especially I2 (restore allocations in the same transaction and cancel ready shipments first) and M8 (take the order lock first). Refund requests from 14B are `refunds` rows with status `reserved`.

**STOP_AFTER is Task 22.**
