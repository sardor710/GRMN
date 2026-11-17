# Task 11B handoff: race-safe reserve, consume, release and expiry

**Status: complete, 2026-11-17**, including the review fix pass. **Task 11 is complete** (11A + 11B).

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `6aed380` (Task 11A). 11B is committed on the same branch (see `git log`).

No push, merge, deployment, real import or backend activation has been done. Owner decision **O08** still gates live reservation and fulfillment.

The contract is in [inventory-ledger.md](../inventory-ledger.md) (section "Reservations (Task 11B)").

## Files

### New

- `src/server/inventory/reservations.ts` — internal functions with no HTTP route. Each takes the caller's `PoolClient`:
  - `reserveStock(client, { checkoutAttemptId, lines, holdSeconds? })` — all lines or none. It locks the attempt, then the attempt's existing holds (`FOR UPDATE`), then the balances in `(variant_id, location_id)` order. It writes one line and one `reserve` movement per line. Holds last 15 minutes by default (60–86,400 s) on the database clock.
  - `consumeReservation(client, { reservationId, orderId })` — locks the order, then the header, then the balances. It requires lines and order items to match one-to-one, then writes one allocation and one `consume` movement per line (−q on-hand, −q reserved).
  - `releaseReservation(client, { reservationId })` — writes one `release` movement per line (−q reserved).
  - `expireDueReservations(pool, { asOf?, limit? })` — ends each due hold in its own transaction. It returns `{ checked, expired, failed, failures }`; a failing hold is skipped, never fatal.
  - `withInventoryTransaction(pool, work, { maxAttempts?, baseDelayMs?, onRetry? })` — runs READ COMMITTED. It retries 40P01 and 40001 with jittered exponential backoff, at most 4 runs by default (cap 10), returning the connection to the pool before each wait. Past the bound it returns 503 `INVENTORY_BUSY`.
- `drizzle/0009_inventory-reservations.sql` (generated), plus `drizzle/meta/0009_snapshot.json` and a journal entry. It adds the check `stock_movements_reason_signs_valid` (review M5).
- `tests/integration/inventory-reservations.test.mjs` — 17 tests.

### Changed

- `src/server/db/schema/inventory.ts` — the per-reason sign check.
- `src/server/inventory/service.ts` — `mainLocation` is now exported. Nothing else changed.
- `docs/backend/inventory-ledger.md` — the sign table, the reservations section, and the M3 decision.
- The plan (Task 11 complete; three checkboxes ticked; completion list; suggested next request), `task-progress.md`, and this handoff.

## Commands and results

All runs were from PowerShell. Receipts are in `temp/backend-next-three/11b/` (git-ignored).

| Run | Result | Receipt |
|---|---|---|
| RED | 0/13. Eleven failed with "Task 11B requires the reservation module". The sign test failed because `receive −1` was accepted | `red-1.log` |
| Migration | `npm run db:generate -- --name=inventory-reservations` with a dummy `DATABASE_MIGRATION_URL` (generation does not connect) | (console) |
| GREEN | 12/13. The expiry test assumed it was the only active hold in the shared database. The fix was in the test: the assertion now counts every hold due before the sweep. Then 47/47 across the reservation, ledger, upgrade, commerce and payments files | `green-1.log`, `green-2.log` |
| Review fix RED | 0/4: I1 `replayed` true≠false; I2 missing rejection; I4 55P03 on header NOWAIT; I3 23514 thrown out of the sweep | `fix-red.log` |
| Review fix GREEN | 17/17 | `fix-green.log` |
| Disk | C: 6.9 GB free before the final gates | `final-exit.txt` |
| Final `npm test` | **380/380** (21 legacy + 137 unit + 222 integration); server/client boundaries passed; exit 0 | `final-test.log` |
| Final `npm run check` | exit 0; lint 0 errors / 24 warnings. The extra warning was this task's unused `rejectsSQL` test helper. It was deleted afterwards, and `npx eslint` on both new files is clean, so the expected count is the earlier 23. Typecheck and build pass | `final-check.log` |
| Browser smoke | exit 0: the three PASS lines (Task09 review fixes, Task09 public catalog, Task10C account) and "Browser smoke passed"; no `Compiling / ...` stall | `final-smoke.log` |

The browser path has no inventory UI, so the smoke only proves nothing regressed. Reservation behaviour is covered by the real-database integration tests.

An earlier full `npm test` started before the review fixes was stopped on purpose, so its log was overwritten by the final run.

## Review

A read-only database-reliability reviewer (Opus) reviewed the diff. **No Critical findings.**

It confirmed:
- Balance locks are taken in sorted order.
- The header lock serializes consume, release and expiry.
- The per-line dedupe keys and the 0002 terminal guard prevent double application.
- The retry wrapper releases the connection before backoff and discards it when ROLLBACK fails.
- The design rulings below are sound.

**Fixed test-first (one pass, all four re-graded and kept Important):**
- **I1** — reserve could replay a hold that a concurrent release or expiry was ending. The existing-hold read now uses `FOR UPDATE`; READ COMMITTED re-checks the status after the wait. Test: "review I1: reserve waits for a concurrent release…".
- **I2** — consume checked lines against items but not items against lines, so an extra unreserved item would be oversold. Lines and items now match one-to-one, and an item without a variant is rejected. Test: "review I2: consume rejects order items that the reservation does not hold".
- **I3** — one failing hold aborted the whole expiry sweep, and on every later run as well. Each hold is now try/caught, reported in `failures` and skipped. Test: "review I3: one failing hold does not stop the expiry sweep".
- **I4** — consume took the header lock before the order's key-share lock. That would deadlock with a cancellation that locks the order, then the header. The canonical order is now attempt → order → header → sorted balances. It is written in the module header and the contract. Test: "review I4: consume locks the order before the reservation header".

## Rulings

Each ruling below has the cost if it is wrong.
1. **Internal functions taking the caller's `PoolClient`, with no service object, HTTP route or permission.** Reservations are checkout and worker operations (Tasks 12, 14, 15), not staff actions. Cost: Task 14 might want a wrapper; it can add one.
2. **Consume while `active` but past `expires_at`, before the sweeper runs, is allowed.** The units are still reserved, which matches plan §6. Cost: a capture slightly after expiry succeeds rather than going down the exception path.
3. **Re-reserve is allowed after release or expiry, but not after consumption (409 `RESERVATION_ENDED`).** A `failed` attempt gets 409 `CHECKOUT_FAILED`. `pending` and `committed` are allowed; `committed` enables plan §6's re-reserve on late capture.
4. **Release of a consumed hold returns `{ status: 'consumed', changed: false }`, not an error.** Cancellation of a paid order uses compensation (Task 17), not release.
5. **Allocation matching** requires exactly one order item per reserved variant, with equal quantity and no other items. An order with two items of the same variant always gets `ALLOCATION_MISMATCH`, so checkout (Task 14) must merge lines per variant.
6. **M3 is decided as "keep".** `expectedVersion` stays the balance version, which reservations bump. A 409 `VERSION_CONFLICT` on a hot SKU fails closed: the staff member reloads, and the floor check already prevents overselling. Cost: noisy 409s once the admin UI sends `expectedVersion` (Task 18/19 may switch to an on-hand guard).
7. **M5 is decided as "enforce signs in the database" (0009).** `reserve` does not require a reservation line, because the 0008 backfill's residual `reserve` rows have none. `release` and `consume` do require one.
8. **Expiry has no scheduler here.** `expireDueReservations` is the unit Task 12 dispatches. `asOf` exists for tests and back-dated sweeps.
9. **The SDD ledger scripts were not used.** The handoff and progress docs are the record for this chain, as in 11A.

## Deferred minors (not fixed)

From the review:
- **N1** — 0009 adds the check without `NOT VALID` or a pre-check DO block. On a large table with any pre-0008 row that breaks the new rules (for example a legacy `release` with no line), the error is generic. No real database exists yet.
- **N2** — a `reserve` without a line is still allowed for anyone, not only the 0008 backfill (for example `source_reference='migration:0008-existing-balance'`). Backfilled residual reserves cannot be released by any tool yet; that needs a staff release tool.
- **N3** — no database rule stops one line from getting both a `release:` and a `consume:` movement; only the header status does. Possible fix: a partial unique index on `stock_movements(reservation_line_id) WHERE reason IN ('release','consume')`, and checking `|delta| = line.quantity`.
- **N4** — no `lock_timeout`. A hot SKU waits until `statement_timeout` (57014), which is neither retried nor mapped to 503. When reserve runs inside checkout, its balance locks last until checkout commits, so Task 14 should reserve as late as possible.
- **N5** — `INVENTORY_BUSY` drops the original error (no `cause`). A COMMIT lost on a dropped connection has an unknown outcome; idempotent replay covers it, but this is not documented in the runbook.
- **N6** — replaying a past-due active hold returns an `expiresAt` that has already passed.
- **N7** — `lockLineBalances` makes one round trip per line; it could reuse the single sorted `lockBalances` query.
- **Test gaps the reviewer listed and not added:**
  - consume racing expiry;
  - consume after `expires_at` but before the sweep;
  - re-reserve after expiry (only after release is tested);
  - reserve while the attempt is `committed`;
  - a retry test with a pool of 1, to prove the connection is released before backoff;
  - the no-deadlock test is probabilistic (it depends on scheduling);
  - no migration test of 0009 against pre-existing rows.
- 11A minors still open: **M4** (movement order within a transaction), **M6** (restore runbook), **M7** (admin UI stock labels and restock 501), **M8** (`actorUserId` visible to `catalog:read`), **M9** (archived `main` location).

**Declined to judge (reviewer):**
- whether consume should check order or payment status (a caller or Task 15 gate);
- whether archived or inactive variants should block reserve;
- the contents of the 0009 snapshot.

## Exact next step

**Task 12A — durable outbox leasing and worker.**
1. Read the Task 12 section of the XL plan, Section 11 "Infrastructure and operations" (worker host and lag targets), and `docs/backend/content-operations-schema.md` (the 0004 outbox/job tables).
2. Implement transactional outbox append and leased claiming with retry/backoff, dedupe, dead-letter, safe shutdown and bounded concurrency, test-first. Required tests: kill or restart a worker mid-lease, run two workers, repeat a job, fail an external call.
3. 12B then adds reservation-expiry dispatch through `expireDueReservations` (this task), audited replay and lag metrics.
4. Run the gates from PowerShell. If the smoke stalls on `Compiling / ...`, remove `.next/dev`. **Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`** (UTF-8 corruption).
5. Stop instead if 12 needs a production worker host decision that `docs/backend/decisions.md` leaves open: the plan asks for "a documented production worker host" (O09 operations).

**STOP_AFTER is Task 22.**
