# Task 12B handoff: scheduled reservation expiry, audited dead-letter replay and job-lag metric

**Status: complete, 2026-11-17**, including the review fix pass. With 12A, Task 12 is complete. Task 13A is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `3432aeb` (12A). 12B is committed on the same branch; see `git log`.

No push, merge, deployment, real import or backend activation has been done. **No migration was added**: 12B runs on the 0004 `job_runs`, `outbox_events` and `audit_events` tables. Replays use the existing `replay_of_job_id` column.

## Files

### New

- **`src/server/operations/schedule.ts`** — `enqueueDueSchedules(pool, schedules)` and `createScheduler({ pool, schedules, tickMs?, onError? })`.
  - On every tick, each worker process enqueues the job for the current slot. The slot is `floor(database clock / everyMs)` and the dedupe key is `schedule:<everyMs>:<slot>`.
  - Any number of workers therefore create one job per slot.
  - A restarted worker resumes the schedule on its first tick, so there is no self-re-enqueue chain that could break.
  - The tick runs four times per slot, clamped to 250 ms–5 s.
- **`src/server/operations/admin.ts`**:
  - **`getJobMetrics(pool)`** returns these figures per kind and in total:
    - ready, scheduled, running and expired leases;
    - open dead letters;
    - `oldestReadyAgeMs`, the job lag: the oldest claimable wait, counting a ready job from `available_at` and an expired lease from `leased_until`;
    - `lastDoneAt`.

    It also reports `reservations.{overdue, oldestOverdueAgeMs}`: active holds more than 60 s past their expiry. That figure shows expiry falling behind even when no worker is running.
  - **`listDeadLetters`** returns open dead letters: the newest job of each chain, when that job is dead. At most 100, newest first, with ids, codes and timestamps only, never payloads.
  - **`replayDeadJob`** is described under Replay below.
  - **`createOperationsService({ pool, authorize })`** wraps these as `overview` and `replay`.
- **`src/server/operations/http.ts`, `src/server/operations/runtime.ts`, `src/app/api/admin/operations/route.ts`** — `/api/admin/operations`.
  - GET, with optional `?kind=`, returns the metrics and open dead letters.
  - POST `{ jobId, reason }` replays one dead letter and must be same-origin.
  - Staff need `settings:write` with MFA from the last 15 minutes (`requireFreshPermission`). The route works in PostgreSQL mode only and returns 503 otherwise.
- **Tests:**
  - `tests/integration/operations-jobs.test.mjs` (9 tests).
  - `tests/unit/operations-route.test.mjs` (3 tests).

### Replay (`replayDeadJob`)

- The 0004 trigger keeps terminal rows immutable. A replay is therefore a new pending row with the same kind, payload and `max_attempts`, the dedupe key `replay:<id>`, and `replay_of_job_id` set to the **chain's original job**.
- It writes `audit_events` `operations.job_replayed` in the same transaction. The audit row's target is the replayed dead job and its changes are `{ replayJobId, rootJobId, kind, attempts, lastErrorCode, reason }`.
- Replays of one chain are serialised by `SELECT … FOR UPDATE` on the original row.
- Refusal codes:
  - 404 `NOT_FOUND`;
  - 409 `JOB_NOT_DEAD`;
  - 409 `JOB_ALREADY_SUCCEEDED`;
  - 409 `REPLAY_IN_PROGRESS`;
  - 409 `REPLAY_SUPERSEDED` (a newer replay exists).

### Changed

- **`src/server/operations/outbox.ts`:**
  - `claimJobs` joins a replay's original job. The handler gets the original event and the original logical `dedupeKey`, so `ctx.idempotencyKey` is stable across replays.
  - `ClaimedJob.replayOfJobId` is new.
  - `JobContext.pool` is new: the worker's pool, for handlers whose effects run in their own short transactions.
- **`src/server/operations/registry.ts`:**
  - `RESERVATION_EXPIRY_KIND = "inventory.reservations.expire"` and its handler.
  - `jobSchedules(env)`, configured by `RESERVATION_EXPIRY_INTERVAL_MS`: default 30000, range 1000–60000. Errors name the field only.
- **`src/server/inventory/reservations.ts`:** `expireDueReservations` accepts `after` (a keyset `(expires_at, id)`) and returns `cursor`. Its existing behaviour is unchanged.
- **`src/server/operations/worker-process.ts`:** `schedules` option. Every scheduled kind needs a handler. The scheduler starts with the worker and stops first on shutdown.
- **`scripts/workers/outbox-worker.mjs`:** passes `jobSchedules(process.env)`. The entry no longer exits 1, because the registry is no longer empty.
- **`src/server/auth/admin-runtime.ts`:** dispatches `"operations"`.
- **Docs:** the plan (12B ticked, Task 12 complete, next-request text), `task-progress.md`, and this handoff.

## Commands and results

All runs were from PowerShell. Receipts are in `temp/backend-next-three/12b/` (git-ignored).

| Run | Result | Receipt |
|---|---|---|
| RED | 0/10. The integration tests failed on "Task 12B requires the operations admin module" and "registers the reservation expiry job". The unit tests failed on the missing route and runtime. | `red-1.log` |
| GREEN | 10/10 | `green-1.log` |
| `tsc --noEmit`, `eslint` on changed files | exit 0. One lint error fixed (`module` variable name in a test). | `tsc.log`, `eslint.log` |
| 12A outbox suite after the claim change | 11/11 | `outbox.log` |
| `npm test` #1 | 1 failure: `auth-entrypoints` requires every admin directory to have a top-level `route.ts`. **Ruling:** the route moved from `/api/admin/operations/jobs` to `/api/admin/operations`. | `test-1.log` |
| Pre-review `npm test` #2 | **401/401** (21 + 140 + 240), boundaries passed | `test-2.log` |
| Review fix RED | 0/2. I1/I2: the handler threw `RESERVATION_EXPIRY_PARTIAL` instead of paging. I3: `metrics.reservations` was undefined. | `fix-red.log` |
| Review fix GREEN | 39/39 (operations-jobs, inventory-reservations, outbox-worker, operations-route); tsc and eslint clean | `fix-green.log` |
| Disk | C: 6.5 GB free before the final gates | `final-exit.txt` |
| Final `npm test` | **402/402** (21 legacy + 140 unit + 241 integration); boundaries passed; exit 0 | `final-test.log` |
| Final `npm run check` | exit 0; lint 0 errors / 23 warnings (unchanged); typecheck and build pass | `final-check.log` |
| Browser smoke, 1st run | exit 1, "Next did not start". The dev server answered 404 for every `/api/admin/products` poll. This was a stale `.next/dev` after the route move and the production build. | `final-smoke.log`, `temp/backend-next-three/08/ui-next.log` |
| Browser smoke, after removing `.next/dev` | **exit 0**. The three PASS lines (Task09 review fixes, Task09 public catalog, Task10C account) and "Browser smoke passed". | `final-smoke-2.log` |

The browser smoke has no operations UI. It proves only that nothing regressed. The operations route is covered by the integration HTTP test and the unit route test.

The dev log also warns that Next inferred `C:\Users\Freakman\package-lock.json` (an empty 2025 file outside the repo) as the workspace root. That file predates 12A, whose smoke passed, so it is not the cause. It is left untouched because it is outside the worktree.

## Review

A read-only database-reliability reviewer (Opus) reviewed the diff. **No Critical findings.**

It confirmed these points:
- The claim `LEFT JOIN` with `FOR UPDATE OF j SKIP LOCKED` is safe: only the non-nullable side is locked.
- Concurrent replays create one job. A replay racing a worker claim is harmless.
- Slot scheduling meets the 60 s cleanup budget.
- The one-hop replay lineage is sound.

**Fixed test-first (one pass):**
- **I1 — every slot dead-lettered for one stuck hold.** A permanently failing hold produced about 2,880 open dead letters a day.
  - Fix: a partial sweep now completes its slot. The next slot retries the failed holds.
  - Stuck holds show in the new `reservations.overdue` metric instead.
  - Test: "review I1/I2…".
- **I2 — the sweep blocked itself behind stuck holds.** A full page of failing holds re-selected the same page on every run.
  - Fix: `expireDueReservations` pages by keyset `(expires_at, id)`, and the handler walks up to 10 pages of 200.
  - Test: the same test, which checks that the second page's query starts after the first page's last hold.
- **I3 — the lag metric read healthy with no worker running.**
  - Fix: added overdue holds (an alert signal that needs no worker), `lastDoneAt` per kind, and expired leases counted in the lag.
  - Test: "review I3…".

**Ruled, not fixed:**
- **I4 — the metric and dead-letter queries scan `job_runs`** (no partial index on `status='dead'`). See ruling 6.

## Rulings

Each ruling below has the cost if it is wrong.
1. **Periodic jobs are slot-keyed and enqueued by every worker on each tick,** not a self-re-enqueuing chain. A restart, a dead slot or several workers cannot stop or duplicate the schedule. Cost: one `job_runs` row per slot (see ruling 6).
2. **A replay points at the chain's original job** (one hop). The audit row records which dead job was replayed. Cost: the immediate predecessor is not in `job_runs` itself, only in `audit_events` and by `created_at` order.
3. **A dead letter is "open" when it is the newest job of its chain.** Any replay closes the older ones, and a dead replay becomes the open one.
4. **The expiry handler runs `expireDueReservations` on `ctx.pool`,** whose per-hold transactions are idempotent. It then calls `ctx.complete()` with no work. This follows 12A ruling 1: the effect is safe without the fenced transaction because ending an ended hold is a no-op and `release:<line>` is unique. Cost: none for duplicates. A lost lease may run one sweep page concurrently with the new holder, harmlessly.
5. **A partial expiry sweep completes its slot (review fix I1).** Visibility comes from `reservations.overdue`, plus `reconcileStock` for drift. Cost: an operator must alert on the metric, because a stuck hold no longer produces a dead letter.
6. **No migration in 12B.**
   - The `status='dead'` partial index (I4) and `job_runs` retention are deferred to the Task 21 query-plan and load run.
   - `job_runs` has a no-delete guard, so done slot rows accumulate: about 2,880 a day at 30 s.
   - Cost: the metric and list queries slow down as the table grows, until Task 21 adds the index and a retention or partition policy. That policy needs a guard exception for done rows. **Task 21 must pick this up.**
7. **Replay and read permission is `settings:write` with fresh MFA;** no new permission was added. Cost: a broader grant than a dedicated `operations:replay` permission would give (least privilege). Revisit in Task 18B with the permission matrix.
8. **The route is `/api/admin/operations`, not `/api/admin/operations/jobs`,** to keep the existing invariant of one top-level `route.ts` per admin directory.
9. **The SDD ledger scripts were not used.** As in 11A–12A, the handoff and progress docs are the record for this chain.

## Deferred minors (not fixed)

- **M5** — chain order uses `created_at` (transaction start). The root-row lock makes an inversion practically impossible today, but an explicit sequence or `clock_timestamp()` would be sturdier.
- **M6** — the scheduler shares the single spare pool connection with claims and heartbeats. Under saturation a heartbeat can wait. Consider requiring `DATABASE_POOL_MAX ≥ WORKER_CONCURRENCY + 2`.
- **M7** — `ctx.signal` is checked only between sweep pages. Shutdown can wait up to one 200-hold page.
- **M8** — the overview GET has no rate limit. The audit `reason` is free text that staff could fill with personal data.

**Declined to judge (reviewer):**
- `endReservation` internals;
- `requireFreshPermission`, `adminJSON` and `readAdminJSON`;
- `failJob` backoff timing.

## Exact next step

**Task 13A — server cart, login merge and wishlist.**
1. Read the Task 13 section of the XL plan, decisions D06–D08 and D11 in `docs/backend/decisions.md`, and the current cart code (`src/lib/cart.tsx`, `CartView.tsx`). Also read the migration 0002 cart tables (`carts`, cart lines).
2. Build guest-capability and account carts with quantity limits and versioning, an idempotent login merge, and a one-time import of the localStorage cart (ids and quantities only). Wire the cart UI to server DTOs with price-change notices. Do **not** enable real checkout.
3. Build the persistent wishlist (unique user/product membership with ownership checks) and record the disposition list for the other account tabs (preserved and deferred).
4. Required tests:
   - a tampered or unavailable variant;
   - merge retry;
   - idempotent wishlist add and remove;
   - cross-user denial;
   - persistence across reload.
5. Read the installed Next.js docs before adding routes. Run the gates from PowerShell. If the smoke shows "Next did not start" or stalls on `Compiling / ...`, remove `.next/dev` and rerun. **Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`.**

**STOP_AFTER is Task 22.**
