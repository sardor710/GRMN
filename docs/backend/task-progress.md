# Backend migration — task reports and current position

Updated: **2026-11-17**. This is the current progress index; individual handoffs are historical completion receipts.

## Current position

- **Completed:** Tasks **01–11** (10A account APIs and ownership, 10B legacy claims/phone change/credential change, 10C account UI wiring; 11A inventory ledger, audited adjustments, reconciliation, opening import; 11B race-safe reservations) **12** (12A durable outbox and leased worker; 12B scheduled reservation expiry, audited dead-letter replay and job-lag metric) and **13** (13A server cart, login merge and wishlist; 13B quotes, markdowns, coupon quotas and USD display) and **14A** (idempotent checkout and pending demo order), within the scope and activation limits below.
- **Committed:** on `codex/backend-task-02`. Tasks 02–09 are in `b92fd0e`, 10A in `76bbf3b`, 10B in `7d615b9`, 10C in `3eecd53`, 11A in `6aed380`, 11B in `eb1cb5b`, 12A in `3432aeb`, 12B in `4fe08d2`, 13A in `40a16cb`, 13B in `d98cc92`, and 14A in the commit after it (see `git log`).
- **Next:** Task **14B**: payment interface, demo adapter, verified inbox and capture. See [the 14A handoff](handoffs/task-14a.md#exact-next-step).
- **Authorized stopping point:** the autonomous chain runs to **Task 22** (`STOP_AFTER`). It stops early for an open owner decision, credentials, a provider, a purchase or production data. Tasks 23 and 24 are never chained.
- **Active implementation:** `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, branch `codex/backend-task-02`.
- **Original checkout:** `D:/projects/garmin/GRMN`. Its progress documentation is synchronized, but the backend implementation has **not** been merged or copied there. An AI inspecting only that checkout's application files will see older code. Continue code work in the active worktree above.
- No merge, push, deployment, real import, production database migration or backend activation has been performed.

**Complete means the recorded task scope passed its stated gate.** Schema completion does not mean its later services exist. Historical test counts below describe each completion point, not a fresh test run of all current uncommitted changes.

## Completed task reports

### Task 01

**Complete — scope and source inventory.** Recorded owner decisions, field/asset/consumer inventory and preservation rules. Verified all 605 inventoried file checksums and field/interface coverage. No application implementation was part of this task. [Detailed receipt](handoffs/task-01.md).

### Task 02

**Complete — contracts and local database tooling.** Added browser-safe DTOs, exact-money/pagination contracts, pinned database/auth dependencies, environment validation, pool/transaction helpers, disposable PostgreSQL and test/boundary commands. Recorded 35 distinct tested cases, typecheck and build. Existing routes stayed on legacy persistence. [Detailed receipt](handoffs/task-02.md).

### Task 03

**Complete — identity/customer and catalog/media schemas (03A + 03B).** Added migrations 0000–0001 with ownership, verified-phone identity shape, addresses, variants/options, taxonomy, prices and private media constraints. 03A full suite: 46 passed; 03B catalog/media integration: 10 passed; typecheck/lint/build recorded passing. These are schemas, not customer/catalog service completion. [03A receipt](handoffs/task-03a.md), [03B receipt](handoffs/task-03b.md).

### Task 04

**Complete — commerce/content/operations schemas (04A + 04B + 04C).** Added migrations 0002–0004 for inventory/cart/order snapshots, payments/refunds, manual fulfillment/returns, promotions, versioned CMS, configuration, audit/outbox/jobs and provenance. Recorded full-suite milestones: 69, 80 and 101 passed, with check/build passing. Business workflows, providers and workers remain later tasks. [04A receipt](handoffs/task-04a.md), [04B receipt](handoffs/task-04b.md), [04C receipt](handoffs/task-04c.md).

### Task 05

**Complete — auth foundation and guarded staff integration (05A + 05B).** Added migration 0005, signed/revocable sessions, hashed phone challenges, profile-completion capabilities, staff MFA, shared throttles, permission guards and protected admin/UI integration. Fixed logout/MFA admission, unsafe DTO and failed-save reporting issues. Final full suite: 158 passed; check passed; disabled-auth HTTP smoke: 43/43. Real OTP delivery, real staff/bootstrap and production recovery/activation are deferred, not complete. Account access stays closed until 10. [05A receipt](handoffs/task-05a.md), [05B receipt](handoffs/task-05b.md).

### Task 06

**Complete — deterministic extraction and validation.** Added private checksummed exports/original backups, exact KZT mapping, source provenance and dry-run quarantine reporting. Current-source run: 261 records accounted for; 15 importable, 70 quarantined, 176 static retained; 199 source files unchanged and 437 asset hashes recorded. Recorded full suite: 169 passed, plus later focused checks; check passed. No target import was authorized. [Detailed receipt](handoffs/task-06.md).

### Task 07

**Complete — idempotent importer and reconciliation.** Added bounded import/replay/resume, conflict/drift detection, checkpoints, independent reconciliation and private disposable staging snapshots. Full suite: 211 passed; check passed. Current-source rehearsal accounted for all 261 records and retained **133 open blockers**. Staging success is not approval to publish, claim ownership or import unresolved real data. [Detailed receipt](handoffs/task-07.md), [reconciliation](migration-reconciliation-report.md).

### Task 08

**Complete — persisted CMS/admin services and UI.** Added transactional permissioned/versioned product, blog, banner, homepage and provisional-customer operations with audit; bounded admin pages/filtering and visible save errors. Explicit legacy/PostgreSQL selection, no error fallback, protected public-source wiring and KZT display. Final full suite: **266/266**; boundaries and check passed; expanded real Chrome/Next/disposable-PostgreSQL CRUD smoke passed. Review corrections completed. Inventory/checkout/account ownership remain later tasks. [Detailed receipt](handoffs/task-08.md), [review and limits](handoffs/task-08-review.md).

### Task 09

**Complete — public catalog/content reads from PostgreSQL.** Normalized catalog list/detail, publication/market filters, exact KZT with optional manual-rate USD display, scoped cursors, batched related/Compare reads, browser-safe constants, Unicode slugs and redirects; catalog/product/Compare/blog/sitemap/metadata consumers wired. The closing session fixed a percent-encoded Unicode slug 404 and four review findings (undecoded `/p/[id]`, 500 on invalid public input, proxy 503 on malformed URLs, dead sitemap category URLs). Final `npm test` **300/300**, check passed, full admin+public Chrome smoke passed. [Detailed receipt](handoffs/task-09.md).

### Task 10A

**Complete — account APIs and ownership (2026-11-17, commit `76bbf3b`).**
- Added session-owned profile, saved-address CRUD and paginated order history/detail services. They are exposed through `/api/account/{profile,addresses,addresses/[id],orders,orders/[id]}`.
- The API never accepts an email or user ID as a selector. It returns 503 unless both PostgreSQL mode and auth are enabled.
- Migration 0006 enforces the five-address limit, owner immutability and exactly one primary address in the database, under concurrency. Address writes fail closed outside READ COMMITTED.
- `customer_profiles.email_verified_at` keeps a customer-typed email marked as unverified; an unverified email grants no ownership.
- Order history uses HMAC cursors bound to the user. Order detail returns customer-visible snapshots and events only.
- Final `npm test` **313/313** (21 legacy + 111 unit + 181 integration), with boundaries passing. `npm run check` passes. Browser smoke results are recorded in the receipt.
- An independent identity reviewer found no Critical issues. Two findings were re-graded Important and fixed test-first.

[Detailed receipt](handoffs/task-10a.md).

### Task 10B

**Complete — legacy claims, phone change/recovery and credential change (2026-11-17).**
- **Audited legacy-order claims.** Staff with `customers:write` and MFA from the last 15 minutes issue a single-use receipt for one unowned order. It is bound to a canonical phone, stored only as a hash, expires after 72 hours and is superseded by a newer approval.
- **Redeeming a receipt.** The verified owner of that phone redeems it with a fresh `order_claim` OTP. Staff cannot redeem receipts. Both steps are audited. A typed matching email or phone grants nothing.
- **Verified phone change.** Requires fresh proofs of the old and the new number. The new number must not belong to another account (409 otherwise). Every session is revoked and the change is audited.
- **Phone recovery** is the existing phone-possession sign-in. A sign-in racing a phone change can no longer keep a session. Lost or recycled-number recovery remains owner decision O04.
- **OTP codes are purpose-bound:** `sign_in`, `phone_change_current`, `phone_change_new` or `order_claim`.
- **`POST /api/auth/change-password`** uses the Better Auth credential service for MFA-admitted staff and revokes every session. Customers own no password and get 403, never a fake success.
- **New routes:** `/api/account/phone`, `/api/account/claims`, `/api/admin/order-claims`. Migration 0007.
- **Review:** no Critical findings. Three Important findings (sign-in race, OTP purpose, approval strength) were fixed test-first.
- **Gates:** final `npm test` **326/326** (21 legacy + 112 unit + 193 integration) with boundaries passing; `npm run check` passes; the full admin and public Chrome smoke passed.

[Detailed receipt](handoffs/task-10b.md).

### Task 10C

**Complete — account UI wiring (2026-11-17).**
- `/account` now mounts `AccountDashboard.tsx`, rewritten to read only `/api/auth/get-session` and `/api/account/*` through the new browser client `src/lib/account-client.ts`. The demo profile, addresses, orders, devices and subscriptions and the `?email=` fetch are gone.
- **States:** loading; signed out (phone sign-in with send/verify and new-account completion); unavailable (503: no mutations); error (any partial load failure shows nothing and offers Try again).
- **Profile and addresses** save with versions; a 409 refreshes the version so the edit can be resubmitted; a successful write is never reported as failed when only the list refresh fails.
- **Orders:** cursor pages, detail with exact KZT; missing legacy subtotal/discount/shipping/tax show "—"; legacy raw or missing delivery addresses are labelled.
- **Credentials:** no password reset for customers. Customers change phone with `phone_change_new` then `phone_change_current` codes and are signed out; staff use `/api/auth/change-password` and see its real errors. Spent codes are dropped after a failed submit.
- **Legacy claim:** receipt + fresh `order_claim` code. Sign-out clears every typed form for the next person on the device.
- **Review:** no Critical findings; nine Important findings fixed test-first.
- **Gates:** final `npm test` **349/349** (21 legacy + 135 unit + 193 integration) with boundaries passing; `npm run check` passes (0 errors, 23 warnings); the full admin + public + new account Chrome smoke passed.

[Detailed receipt](handoffs/task-10c.md).

### Task 11A

**Complete — inventory ledger, audited adjustments, reconciliation and opening import (2026-11-17).**
- **Ledger-driven balances (migration 0008).**
  - Every `stock_movements` row applies its deltas in the same statement.
  - Direct counter patches, nonzero inserts, deletes and truncation are rejected.
  - A new `opening` reason records preserved stock and requires a source reference.
  - On upgrade, existing balances get residual provenance movements.
- **`/api/admin/inventory`** (PostgreSQL only; staff with MFA admission):
  - stock read with the recent ledger (`catalog:read`);
  - audited, idempotent adjustments that cannot take stock below the reserved quantity (`inventory:write`);
  - a read-only reconciliation of balances against ledger sums and active reservation lines.
- **`importOpeningBalances`** turns the product stock of a completed legacy migration run into one `opening` movement per default variant, naming the source record and checksum.
  - Unusable values and balances that already have history are reported, never guessed.
  - No real import was run; O08 still gates live activation.
- The admin product DTO now reports ledger stock instead of a fixed zero.
- **Review:** no Critical findings. Two Important findings (residual backfill, archived default variants) were fixed test-first.
- **Gates:** final `npm test` **363/363** (21 legacy + 137 unit + 205 integration) with boundaries passing; `npm run check` passes (0 errors, 23 warnings). The browser smoke result is recorded in the receipt.

[Detailed receipt](handoffs/task-11a.md).

### Task 11B

**Complete — race-safe reserve, consume, release and expiry (2026-11-17).** Task 11 is complete.
- **`src/server/inventory/reservations.ts`** (internal; no HTTP route). Each function runs inside the caller's transaction, so checkout can reserve, create the order and record its result in one transaction.
  - `reserveStock` holds every line or none. Balances are locked in `(variant_id, location_id)` order, and each line gets one `reserve` movement.
  - `consumeReservation` turns each line into a paid allocation for the matching order item, with one `consume` movement (−on-hand, −reserved). Lines and items must match one-to-one.
  - `releaseReservation` and `expireDueReservations` reduce reserved once per line.
  - Every effect is deduplicated per line. Repeats return `changed: false` or replay the hold.
- **Lock order:** checkout attempt, order, reservation header, then sorted balances.
- **`withInventoryTransaction`** retries deadlocks and serialization failures with backoff, at most 4 runs, then returns 503 `INVENTORY_BUSY`.
- **Migration 0009** enforces movement signs per reason. `release` and `consume` must name their reservation line, and `consume` also its allocation.
- **Tests on a real database:**
  - of 100 concurrent last-unit reservations, exactly one wins;
  - a multi-line failure rolls back every line;
  - repeated or concurrent consume, release and expiry have one effect;
  - opposite line orders never deadlock;
  - a real deadlock is retried and both transactions commit.
- **Review:** no Critical findings. Four Important findings were fixed test-first: reserve racing a release, unreserved order items, one bad hold blocking the expiry sweep, and the consume lock order.
- **Gates:** final `npm test` **380/380** (21 legacy + 137 unit + 222 integration) with boundaries passing; `npm run check` passes (0 errors, 23 warnings); the full admin, public and account browser smoke passed.

[Detailed receipt](handoffs/task-11b.md).

### Task 12A

**Complete — durable outbox and leased job worker (2026-11-17).** No migration; it runs on the 0004 `outbox_events`/`job_runs` tables and their guard trigger.
- **`src/server/operations/outbox.ts`**:
  - `appendOutboxEvent` and `enqueueJob` write inside the caller's transaction and deduplicate (a different fact under the same key is 409).
  - `claimJobs` leases a bounded batch with `FOR UPDATE SKIP LOCKED`, storing only a token hash. It reclaims expired leases and dead-letters expired leases with no attempts left (`LEASE_EXPIRED`).
  - `completeJob` renews the lease under a row lock, applies the handler's database effect, and marks the job done in one transaction. A worker that lost its lease gets 409 `LEASE_LOST` and its effect rolls back.
  - `failJob` retries with jittered exponential backoff or dead-letters. Only safe error codes are stored.
  - `createWorker` adds bounded concurrency, one-at-a-time lease renewal and graceful shutdown (`WORKER_SHUTDOWN` retry).
- **Standalone process:** `src/server/operations/worker-process.ts`, `scripts/workers/outbox-worker.mjs` and `npm run worker`. 12B registered the first handler (reservation expiry).
- **Tests on a real database (11):** a SIGKILLed worker process's job is reclaimed after the lease; two workers never run a job twice; a repeated job has one effect; a failing call retries, then dead-letters; plus shutdown, renewal, exhausted leases, config and the two review regressions.
- **Review:** no Critical findings. Four Important findings were fixed test-first: lease renewal during completion, a late trigger rejection surfacing as 23514, and two timing-sensitive tests.
- **Gates:** see the [handoff](handoffs/task-12a.md#commands-and-results).

[Detailed receipt](handoffs/task-12a.md).

### Task 12B

**Complete — scheduled reservation expiry, audited dead-letter replay and job-lag metric (2026-11-17).** No migration.
- **Scheduling:** `src/server/operations/schedule.ts`. Every worker process enqueues the current time slot's job on each tick, and the slot is the dedupe key, so there is one job per slot whatever the number of workers. A restarted worker resumes the schedule on its first tick. `RESERVATION_EXPIRY_INTERVAL_MS` sets the slot (default 30 s, range 1–60 s).
- **Expiry handler:** `inventory.reservations.expire` in `src/server/operations/registry.ts`. It runs `expireDueReservations`, which now pages by keyset so failed holds never block the ones behind them. It is bounded and idempotent, and a partial sweep still completes its slot.
- **Replay:** `src/server/operations/admin.ts`. A replay of an open dead letter is a new `job_runs` row whose `replay_of_job_id` points at the chain's original job, with the same kind, payload and attempt budget. It writes an `operations.job_replayed` audit row in the same transaction. Replays of one chain are serialised. The worker resolves the original event and idempotency key for a replay.
- **Metric:** per kind: ready, scheduled, running, expired leases, open dead letters, job lag (oldest claimable wait) and `lastDoneAt`. It also reports holds overdue by more than 60 s, which shows when the worker is down.
- **Route:** `/api/admin/operations`. GET returns the metrics and open dead letters, without payloads. POST `{ jobId, reason }` replays one dead letter. Staff need `settings:write` with MFA from the last 15 minutes. The route works in PostgreSQL mode only.
- **Review:** no Critical findings. Three Important findings were fixed test-first: per-slot dead-letter flooding, stuck holds blocking the sweep, and a lag metric that read healthy with no worker running. The fourth, full-table metric scans, is deferred to Task 21 by ruling.
- **Gates:** see the [handoff](handoffs/task-12b.md#commands-and-results).

[Detailed receipt](handoffs/task-12b.md).

### Task 13A

**Complete — server cart, login merge and wishlist (2026-11-17).** Migration **0010** adds `cart_items.seen_unit_price_minor` (the price the shopper last saw).
- **Cart service** `src/server/cart/service.ts`, routes under `/api/cart`:
  - A guest cart is opened only by a random capability in an HttpOnly, SameSite=Lax cookie (`Path=/api/cart`); only its HMAC digest is stored. A signed-in shopper always uses the account cart.
  - Every write checks `expectedCartVersion` under the cart row lock. Lines hold 1–99, a cart at most 100 lines. Increases need free stock.
  - Tampered, draft, unpublished or unpriced variants are 404; prices never come from the client.
  - Login merge folds the guest cart into the account cart exactly once (guest row lock; merged carts add nothing on replay, by anyone).
  - The one-time localStorage import takes ids and quantities only and keeps the larger quantity on a retry.
  - Price-change notices persist until the shopper accepts the new prices.
- **Wishlist** `src/server/wishlist/service.ts` at `/api/account/wishlist`: idempotent add and remove, session-owned, archived products shown as unavailable.
- **UI:** the cart page renders server KZT DTOs with notices and keeps checkout disabled; product pages add the exact variant and save to the wishlist; the account page has a Wishlist tab. Legacy mode (cart API 503) keeps the browser-only cart.
- **Account tab dispositions:** [account-tab-dispositions.md](account-tab-dispositions.md).
- **Review:** no Critical findings. Three Important client findings were fixed test-first (add while loading, re-sync and no stale retry after sign-in, local fallback only on 503). The smoke then found two more client bugs, also fixed test-first: a hydration mismatch in the header count, and duplicate guest carts from a double start.
- **Gates:** see the [handoff](handoffs/task-13a.md#commands-and-results).

[Detailed receipt](handoffs/task-13a.md).

### Task 13B

**Complete — quotes, markdowns, coupon quotas and USD display (2026-11-17).** No migration. Task 13 is complete.
- **Quotes** (`src/server/pricing/quote.ts`, `POST /api/cart/quote`):
  - integer KZT from the active prices, admin markdown rules, at most one coupon, and the active tax and shipping policy versions;
  - an immutable `checkout_quotes` row that expires after 15 minutes, carrying the line, policy and USD snapshots;
  - `revalidateQuote` is checkout's guard: the same cart revision, unexpired, and a fresh pricing that still matches.
  - Client totals, prices and a non-KZT payment currency are rejected.
  - There is no default tax: without an active policy, quotes are refused (409 `POLICY_UNAVAILABLE`).
- **Coupons** (`src/server/pricing/coupons.ts`, internal for Task 14A):
  - an atomic quota reservation per checkout attempt, with global and per-user limits enforced by the 0003 trigger;
  - consume, release and expiry, where exactly one terminal transition wins;
  - one lock order: attempt, promotion, then redemption.
- **USD** is display-only from the admin rate version and snapshotted on the quote. A rate change never alters KZT amounts or a stored snapshot.
- **Review:** no Critical findings. Four Important findings were fixed test-first: a coupon lock-order deadlock, a checkout retry failing its own revalidation, tax and shipping detail missing from the snapshot, and revalidation hiding the 409 reason. Rate limiting is deferred to Task 21.
- **Gates:** see the [handoff](handoffs/task-13b.md#commands-and-results).

[Detailed receipt](handoffs/task-13b.md).

### Task 14A

**Complete — idempotent checkout and pending demo order (2026-11-17).** No migration.
- **Checkout** (`src/server/checkout/service.ts`, `POST /api/cart/checkout` with an `Idempotency-Key` header): one short transaction, no network call. It claims the key, locks the quoted cart revision, revalidates the quote, reserves the coupon quota and the stock, and writes the sealed order snapshot (`GRM-` sequence number), a demo payment attempt, an order event, an `order.placed` outbox event, a hashed guest status token and the idempotency result, then converts the cart.
- **Guarantees, tested:** the same key returns the same order (also concurrently); the same key with a different body is 409; two keys on one cart revision have one winner; any failure leaves no attempt, hold, order or idempotency record; later product, price and address edits never rewrite the snapshot.
- **Status polling:** `POST /api/cart/checkout/status` for the owning session or a guest status token. The receipt never says paid (D03, O07 open).
- **UI:** the cart page quotes on the server, places the order once with a stored key, resumes a lost response on reload, and shows an unpaid receipt. The fake success screen, invented tax and client cart clearing are gone.
- **Worker:** coupon holds expire on the same schedule as stock holds.
- **Review:** no Critical findings. Three Important findings were fixed test-first (lost-response recovery, the coupon hold linked to its order, inclusive tax recorded on the order). Order-level expiry of a pending order is a 14B ruling.
- **Gates:** see the [handoff](handoffs/task-14a.md#commands-and-results).

[Detailed receipt](handoffs/task-14a.md).

## Remaining task list

Tasks 12–22 were consolidated on 2026-11-17 from 24 sub-slices into 12 chained slices; see "Consolidation of Tasks 12–22" in the plan. Steps that need a real provider are in its deferred activation backlog.

| Task | Status | Work still required |
|---|---|---|
| 10 | Complete (10A, 10B, 10C) | — |
| 11 | Complete (11A, 11B) | — |
| 12 | Complete (12A, 12B) | — |
| 13 | Complete (13A, 13B) | — |
| 14 | In progress (14A complete) | 14B payment interface, demo adapter, verified inbox and capture (absorbs 15); order-level hold expiry policy |
| 15 | Merged into 14 | Real provider work is in the deferred activation backlog |
| 16 | Not started | 16A manual fulfillment and order timeline; 16B cancellation, returns and refunds with stock compensation (absorbs 17) |
| 17 | Merged into 16 | — |
| 18 | Not started | 18A scheduled publishing and media uploads; 18B reports, exports, settings, USD rate editor and inventory admin UI (absorbs 19) |
| 19 | Merged into 18 | Email/newsletter sending is in the deferred activation backlog |
| 20 | Merged into 13 | Wishlist built in 13A; other account domains deferred in [account-tab-dispositions.md](account-tab-dispositions.md) |
| 21 | Not started | 21A query/cache/rate tuning and end-to-end matrix; 21B load and failure injection (absorbs 22). Last chained task |
| 22 | Merged into 21 | — |
| 23 | Not started (owner-run) | Cutover and recovery rehearsal |
| 24 | Not started (owner-run) | Authorized production cutover, observation and retirement |

Real source quarantine, provider configuration, production capacity and recovery qualification remain explicit launch gates. Nothing here certifies production readiness. The [XL task list](../plans/2026-11-10-postgresql-backend-migration-xl.md) remains the binding specification; this file is its progress report.
