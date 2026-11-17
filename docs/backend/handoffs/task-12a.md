# Task 12A handoff: durable outbox and leased job worker

**Status: complete, 2026-11-17**, including the review fix pass. Task 12B is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `944f78d` (the Tasks 12–22 consolidation). 12A is committed on the same branch (see `git log`).

No push, merge, deployment, real import or backend activation has been done. No migration was added: 12A runs on the 0004 `outbox_events`/`job_runs` tables and their `operations_guard_job` trigger.

## Files

### New

- `src/server/operations/outbox.ts`:
  - `appendOutboxEvent(client, { topic, dedupeKey, payload, payloadVersion?, aggregate?, consumers, maxAttempts? })` writes one immutable event and one job per consumer (job `dedupe_key` = event id) in the caller's transaction. A repeat of the same fact returns the existing ids with `created: false`. A different fact under the same key is 409 `OUTBOX_DEDUPE_CONFLICT`.
  - `enqueueJob(client, { kind, dedupeKey, payload?, maxAttempts?, delayMs? })` adds a standalone job. A repeat is deduplicated; a different payload under the same key is 409 `JOB_DEDUPE_CONFLICT`.
  - `claimJobs(pool, { owner, kinds, limit, leaseMs })` works in two statements:
    1. It dead-letters expired leases that have no attempts left (`LEASE_EXPIRED`).
    2. It leases ready pending jobs and expired leases with attempts left, using `FOR UPDATE OF j SKIP LOCKED`. Only `sha256(token)` is stored, and the event row is joined into the claimed job.
  - `renewLease`, `completeJob(pool, job, work?)` and `failJob(pool, job, { code, retryable, delayMs })` are all fenced by the token hash.
    - `completeJob` first renews the lease with a locking UPDATE, then runs `work`, then marks the job done in the same transaction. If the lease is no longer held it returns 409 `LEASE_LOST`, and `work` rolls back.
    - The lease predicates keep a 50 ms margin. A late trigger rejection (23514) is mapped to a lost lease.
  - `createWorker({ pool, owner, handlers, concurrency, leaseMs, pollMs, backoff, onEvent })` provides `runOnce`, `start` and `stop({ graceMs })`. Concurrency is bounded (1–32), with one renewal at a time and none during completion. Retries use jittered exponential backoff (50–100% of min(cap, base·2^(n−1))).
    - A `JobError` with `retryable: false` dead-letters at once.
    - On shutdown the worker aborts `ctx.signal` after the grace period and returns the job as `WORKER_SHUTDOWN` with no delay.
    - Handlers get `ctx.idempotencyKey` (`kind:dedupeKey`) for external providers.
  - `parseWorkerEnv` reads `WORKER_ID`, `WORKER_CONCURRENCY` (4), `WORKER_LEASE_MS` (60000), `WORKER_POLL_MS` (1000) and `WORKER_SHUTDOWN_GRACE_MS` (30000). Errors name the field, never its value.
  - `backoffDelay` and `JobError` are also exported.
- `src/server/operations/worker-process.ts` — `runWorkerProcess({ env, handlers, signals?, log? })`. It requires `DATABASE_POOL_MAX > WORKER_CONCURRENCY`. It stops on SIGINT/SIGTERM and closes the pool. Log lines are JSON with ids and codes only.
- `src/server/operations/registry.ts` — `jobHandlers`, empty until 12B.
- `scripts/workers/outbox-worker.mjs` and `npm run worker` — the standalone entry point (decision D05).
- `tests/integration/outbox-worker.test.mjs` (11 tests) and `tests/fixtures/outbox-worker-child.mjs` (the real process loop with a blocking handler, killed by the test).

### Changed

- `package.json` — the `worker` script.
- The plan (12A ticked; status, completion list and suggested next request), `task-progress.md`, and this handoff.

## Commands and results

All runs were from PowerShell. Receipts are in `temp/backend-next-three/12a/` (git-ignored).

| Run | Result | Receipt |
|---|---|---|
| RED | 0/9, all "Task 12A requires the outbox module" | `red-1.log` |
| GREEN 1 | Failed with `null value in column "id"`: the 0004 tables have no database default id. Fixed by inserting `randomUUID()` | `green-1.log` |
| GREEN 2 | 9/9 | `green-2.log` |
| Entry check | `node --conditions=react-server scripts/workers/outbox-worker.mjs` printed "No job handlers are registered", exit 1 (expected in 12A) | (console) |
| Pre-review `npm test` | 389/389 (21 + 137 + 231), boundaries passed | `test-1.log` |
| Review fix RED | 9 passed, 2 failed: I1 `LEASE_LOST` (work outlived the remaining lease); I2 raw `23514` | `fix-red.log` |
| Review fix GREEN | 11/11; `tsc --noEmit` clean; `eslint` on the new files clean | `fix-green.log` |
| Disk | C: 6.8 GB free before the final gates | `final-exit.txt` |
| Final `npm test` | **391/391** (21 legacy + 137 unit + 233 integration); server/client boundaries passed; exit 0 | `final-test.log` |
| Final `npm run check` | exit 0; lint 0 errors / 23 warnings (unchanged); typecheck and build pass | `final-check.log` |
| Browser smoke | exit 0: the three PASS lines (Task09 review fixes, Task09 public catalog, Task10C account) and "Browser smoke passed"; no `Compiling / ...` stall | `final-smoke.log` |

The browser path has no worker UI, so the smoke only proves nothing regressed.

## Review

A read-only database-reliability reviewer (Opus) reviewed the diff. **No Critical findings.**

It confirmed:
- Fencing holds. `completeJob` holds the row lock while `work` runs, and claim and dead-letter skip locked rows.
- Concurrent appends with the same key are serialised by `ON CONFLICT DO NOTHING`.
- The shutdown-on-last-attempt behaviour (M2) is consistent with the trigger.

**Fixed test-first (one pass):**
- **I1** — the lease could not be renewed during `ctx.complete`, because the heartbeat blocked on the row lock. Slow work then lost its lease, and the blocked heartbeats piled up pool connections.
  - Fix: `completeJob` now starts with a locking renewal (a full lease for `work`). The heartbeat skips while completing and never overlaps itself.
  - Test: "review I1: completeJob renews the lease before running work…".
- **I2** — the trigger re-reads `clock_timestamp()` after the WHERE clause. A lease expiring in between surfaced as a raw 23514, stored as `HANDLER_FAILED`.
  - Fix: a 50 ms margin in the lease predicates, and 23514 from the lease statements is mapped to `LEASE_LOST` / `false`.
  - Test: "review I2: a late trigger rejection…". It simulates the late rejection with a test-only trigger.
- **I3** — the "not claimable before backoff" assertion raced a 75 ms minimum backoff. That test now uses a 1000 ms base and checks `available_at` against the database clock.
- **I4** — the renewal and kill tests used 1–1.5 s leases with little slack. They now use 3 s leases (a 4.5 s long job; the rival tries at 3.5 s).

## Rulings

Each ruling below has the cost if it is wrong.
1. **Database effects go through `ctx.complete(work)`**, which applies them and completes the job in one fenced transaction. If the handler does not call it, the worker completes the job after the handler returns. External effects are at-least-once and use `ctx.idempotencyKey`. Cost: a handler that writes outside `ctx.complete` loses the exactly-once guarantee. 12B's expiry handler is idempotent on its own.
2. **The registry is empty, and the entry exits 1** ("No job handlers are registered"). Cost: deploying the worker unit before 12B crash-loops it. Keep it disabled until 12B (reviewer M9).
3. **A shutdown abort counts as an attempt** and retries with no delay. The trigger forbids refunding attempts, so on the last attempt this dead-letters (reviewer M2). Cost: replay is needed; 12B builds audited replay.
4. **Only codes matching `^[A-Z][A-Z0-9_]{0,63}$` are stored**; anything else becomes `HANDLER_FAILED`. Messages are never stored or logged, so no PII reaches the job table.
5. **Event jobs use the event id as `dedupe_key`.** Replaying an event with an extra consumer adds that job; `maxAttempts` on a replay is ignored (reviewer M7).
6. **No new migration.** The 0004 trigger already enforces the lease state machine; 12A only adds execution.
7. **The SDD ledger scripts were not used.** The handoff and progress docs are the record for this chain, as in 11A and 11B.

## Deferred minors (not fixed)

- **M1** — transient renewal errors never abort the handler. If the database is unreachable for longer than the lease, a handler may keep calling a provider while another worker reclaims the job. Local fencing (abort once the last confirmed `leased_until` passes) would fix it.
- **M3** — a handler that throws `JobError("LEASE_LOST")` is treated as a lost lease and left leased until expiry.
- **M4** — `stop()` does not wait for a `runOnce` whose claim is still in flight. Only the test path uses `runOnce`.
- **M5** — Windows service stop and `taskkill` send no SIGTERM, and a second signal force-exits. Production is the Linux VPS; leases recover by expiry.
- **M6** — the claim query's OR plus `ORDER BY available_at, created_at, id` does not use `job_runs_ready_idx` for ordering. Revisit in the Task 21 load run.
- **M7** — consumers and `maxAttempts` are not part of the dedupe comparison (see ruling 5). Document this for event producers.
- **M8** — an unreachable database at startup logs `CLAIM_FAILED` every poll forever. Consider a backoff, or exiting after N failures so the supervisor sees it.
- **M9** — the empty registry crash-loops under `Restart=always` (ruling 2).
- **M10** — `npm run worker` has no `--env-file-if-exists=.env.local`.
- **M11** — the overlap check in the two-worker test is weak (the effect count is the real assertion).
- **Test gaps the reviewer listed and not added:**
  - renewal racing completion;
  - `failJob` on an expired, unreclaimed lease;
  - concurrent `appendOutboxEvent` with the same key;
  - behaviour under a REPEATABLE READ caller.

**Declined to judge (reviewer):**
- the schema doc wording;
- query plans (no EXPLAIN was run);
- REPEATABLE READ callers.

## Exact next step

**Task 12B — reservation-expiry dispatch, audited dead-letter replay and a job-lag metric.**
1. Read the Task 12 section of the XL plan, this handoff, and `src/server/inventory/reservations.ts` (`expireDueReservations`).
2. Register an expiry handler in `src/server/operations/registry.ts`. Schedule it so cleanup starts within 60 s of expiry (plan §11), for example a self-re-enqueuing periodic job with a time-bucket `dedupe_key`, or a bounded sweep each poll. Rule on which one.
3. Add audited, permissioned manual replay of a dead job. Replay is a new `job_runs` row with `replay_of_job_id`, because the trigger keeps terminal rows immutable. Write an `audit_events` row too. Add a job-lag metric (oldest ready job age; dead-letter count).
4. Required tests:
   - an expired hold is released after a worker restart;
   - replay is permissioned and audited;
   - no duplicate inventory transition.
5. Run the gates from PowerShell. If the smoke stalls on `Compiling / ...`, remove `.next/dev`. **Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`** (UTF-8 corruption).

**STOP_AFTER is Task 22.**
