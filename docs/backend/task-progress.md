# Backend migration — task reports and current position

Updated: **2026-11-18**. This is the current progress index; individual handoffs are historical completion receipts.

## Current position

- **Completed:** Tasks **01–14**, **16** (16A + 16B, absorbing 17), **18** (18A + 18B, absorbing 19, plus the 18A I6 homepage collection wiring) and **21C** (manual payment confirmation, O07, 2026-11-18). Task 15 is merged into 14, 20 into 13 and 22 into 21. All are complete within the scope and activation limits below.
- **Partial:** Task **21A** (its open item, a price-sorted listing under 300 ms: after the 21B follow-up the database part is about 85 ms; end to end at 25 rps the p95 is 286 ms ascending, but 431 ms descending).
  - Done: migration 0011, two indexes backed by EXPLAIN evidence, shared rate limits, the permission matrix check, catalog/search plans at full catalog volume with a listing fix, and (through 21C) a browser purchase that reaches "paid".
  - Withdrawn: the public data cache.
  - Open: a price-sorted listing under 300 ms.
- **Owner decisions:**
  - **O05:** the VPS hardware is recorded. It is shared with 14 other containers; see [decisions.md](decisions.md#o05-the-vps-recorded-2026-11-18).
  - **O07 is resolved:** payment is confirmed manually by an admin, built as **21C** ([handoff](handoffs/task-21c.md)).
- **Work location:** `beta` on GitHub (`sardor710/GRMN`), cloned on the VPS. The Windows checkouts and the Codex worktree are historical.
- **21B ran on the VPS (2026-11-18)** ([performance report](performance-report.md#task-21b-section-3-load-on-the-vps-2026-11-18)).
  - **Pass:** checkout 20/s (p95 268 ms, 0 errors), last-unit contention (exactly 1 order), the duplicate key (1 order), failure injection (worker kill, a 20 s database pause, app kill), and every invariant after every run.
  - **Fail:** browsing at 100 rps steady (85% errors) and 500 rps burst (88% errors). About 10 rps is sustainable: the uncached catalog listing uses about 98% of database time, and price sorts about 60%.
  - **Decision:** price-sorted listings need the offer summary, and the 100/500 rps targets also need the shared cache.
  - **Fixed along the way:** same-origin checks failed behind the TLS proxy, and the 21A history seed gave every order one timestamp.
- **21B follow-up (2026-11-18, owner-approved)** ([handoff](handoffs/task-21b-followup.md), [re-run](performance-report.md#21b-follow-up-re-run-2026-11-18-after-the-offer-summary)):
  - **Built:**
    - the offer summary (migration 0015), so price sorts take about 85 ms in the database instead of 3.6 s;
    - a listing concurrency cap;
    - the owner's hold-abuse rule: at most **3 unpaid manual orders per customer and per client address** (0014, 0016).
  - **Re-run:** 25 rps browsing is clean (p95 237 ms, was about 10 rps) and checkout 20/s passes (p95 230 ms). 100/500 rps still fail, now on app CPU rather than the database.
  - **Not built:** the shared cache. It is not needed at the forecast traffic; the Section 3 envelope needs it or more app vCPU (owner infrastructure choice).
- **Next:**
  1. Owner: confirm the O07 defaults (methods, roles, 48-hour hold). The hold-abuse policy is decided and built.
  2. Owner, only if the Section 3 stress envelope must be met before launch: a shared page/data cache (for example Redis, the 21A design) or more app instances/vCPU. Then re-run 21B (`tests/load`, `scripts/perf`).
  3. Watch item: the unpaid-order expiry sweep takes about 3.6 s per run at 1M orders (worker only); add a partial index before volume grows.
  4. Task 23 (cutover rehearsal) is owner-run. Apply migrations 0011–0016 before importing data. Production proxies must forward `Host`/`X-Forwarded-Host` and `X-Forwarded-Proto` (21B fix).
- **Authorized stopping point:** the autonomous chain runs to **Task 22** (`STOP_AFTER`). It stops early for an open owner decision, credentials, a provider, a purchase or production data. Tasks 23 and 24 are never chained.
- No deployment, real import, production database migration or production `.env` exists. The 21C commits are on `beta`; pushing to GitHub is done by the owner.

## VPS gates (2026-11-18)

Step 1, on the fresh VPS clone:
- `npm ci` succeeded. npm 11 reported 7 packages whose install scripts are not yet allowlisted; the embedded PostgreSQL binaries were usable anyway.
- `test:unit`: 192 pass, 1 skipped (a Windows-only test).
- `test:integration`: 348/349. The one failure was a race in the standalone-worker test: worker A was killed before it marked its job done. It passed 3/3 when re-run alone, and the test now waits for the done run.
- `npm run build`: passed with no warnings.

After 21C, all gates pass: unit 192 (+1 skip), legacy 73/73, integration **362/362**, boundaries, lint 0 errors, typecheck, build, and the **browser smoke including the O07 purchase to "paid"**.

After the 21B follow-up, all gates pass: unit 201, legacy 73/73, integration **371/371**, boundaries, lint 0 errors, typecheck, build and the browser smoke.

## Merge into the main checkout (2026-11-18)

The two branches grew from the same uncommitted CMS work. Conflicts were resolved as follows:

- **Backend wins** wherever it deliberately replaced insecure or unauthorized behavior: Better Auth staff sessions replace the old admin cookie, legacy exports are replaced by authorized exports, the account APIs are session-owned, and every admin page and route uses the guarded runtime.
- **Feature branch wins** for the storefront visuals: the header, hero, featured carousel, tiles and homepage data.
- **Products have two admin screens.** In legacy mode `ProductsScreen` is the options/variants/photos/garmin.com-import editor, adapted to the paginated, permission-checked admin API. In PostgreSQL mode `PostgresProductsScreen` is the backend catalog screen. `products/page.tsx` picks one with `cmsBackend()`.
- **Admin validation:** `admin-schemas.ts` now accepts and projects images, options, variants, overview HTML, spec groups and source. For homepage blocks it accepts disclaimers, promo item variants and image alt text. The products POST handler sanitizes input (overview HTML, image/swatch allowlists, hex colors), requires variant SKUs and returns 409 `SKU_CONFLICT`. Product bodies may be up to 1 MB (other resources stay at 128 KB).
- **Import and uploads:** `/api/admin/import/garmin` and `/api/admin/uploads` require a same-origin request from staff with `catalog:write` (`requireCatalogWriter`).
- **Cart and product page:** the browser-only cart keeps one line per variant SKU. In server mode the cart uses server lines. `ProductTop` shows the JSON CMS variant picker in legacy mode and the server variant select in PostgreSQL mode.
- **Homepage:** explicitly empty or inactive CMS blocks are respected, so static campaigns never come back.
- **Data:** about 226 double-encoded strings in `data.json` (for example "fД“nixВ®") were repaired back to UTF-8 ("fēnix®"). Legacy admin sign-in now requires the backend auth setup (`AUTH_ENABLED=1`, PostgreSQL); see [auth-integration.md](auth-integration.md).
- **Gates at merge:** `npm run typecheck` passes, `npm run lint` has 0 errors, `npm run test:legacy` passes 73/73, `npm run test:unit` passes 189/189 (run from PowerShell: the migration tests call Windows `whoami`, which Git Bash shadows), `check:boundaries` passes, and `npm run build` passes with no warnings. **Not run** for lack of free RAM: `npm run test:integration` (embedded PostgreSQL; it includes a new legacy-variant validation test) and the browser smoke.

## Deferred gates and follow-ups (2026-11-18)

Run on the merged branch from PowerShell, with 2.4–3.3 GB free RAM.

- **Integration suite.** The first run was 345/347. Both failures were tests changed by the merge:
  - the new legacy-variant validation test used the shared admin, whom an earlier test signs out; it now uses a fresh operator;
  - the PostgreSQL edit-form test loaded the legacy products screen; it now loads `PostgresProductsScreen`.

  **Final run on the finished tree: 349/349.**
- **Browser smoke** (`tests/ui/cms-smoke.mjs`): it first failed before starting, because its receipt folder existed only in the old Codex worktree. The test now creates it.
  - **It then passed:** Task09 public catalog and review fixes, 10C account, 13A cart, 14A checkout, 16A fulfillment, and the admin CRUD walk (cursor pages, product create/update, homepage editor, article, banner, provisional customer, KZT rendering).
  - That run covered the merge and the 18A wiring. A rerun after the catalog query change was stopped for low system memory.
  - **Rerun on the final tree (3.7 GB free, `.next/dev` cleared): passed**, with the same steps, so the catalog query change is covered in the browser too.
  - The script has no steps for 16B, 18A, 18B or 21A screens. Their gates remain the integration tests.
- **18A ruling I6, homepage collections (done):**
  - Migration **0012** adds a published snapshot (`published_name`, `published_at`, `collection_published_products`) and backfills already-published collections.
  - Saving edits the draft; only `publish_collection` changes what the public sees. `readCollection` reads the snapshot in one query (the N+1 is gone).
  - Carousels take an optional `collectionKey`. In PostgreSQL mode `readHomepage` fills them from the published collection; a missing or unpublished collection keeps the inline cards. The admin homepage editor has a field for the key.
  - Tests: collection draft isolation (integration) and 4 resolver unit tests.
- **21A catalog and search plans (done, with a fix):**
  - `scripts/perf/catalog-explain.mjs` measures the real catalog service SQL on a seed with catalog relations.
  - At 5,000 products / 50,000 variants, a listing page took ~7.5 s because offer JSON was built for every product before LIMIT. After the fix: name/newest about 130 ms, filters 79–113 ms, common search about 90 ms, price sort about 750 ms (still above 300 ms).
  - No trigram index. Details are in the [performance report](performance-report.md#catalog-listing-and-search-review-i9-follow-up).
- **Other gates on the final tree:** `test:unit` passes 193/193, `test:legacy` 73/73, lint has 0 errors (24 warnings), `check:boundaries` passes, and `npm run build` passes with no warnings.

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

### Task 14B

**Complete — payment interface, simulated demo adapter, verified inbox and capture (2026-11-17).** No migration.
- **Providers** (`src/server/payments/`): a typed provider interface and an explicitly simulated demo adapter (provenance `simulated: true`, no webhooks, reconciliation never reports a payment). The application registers only the demo adapter (D03), so no order can be paid in this build (O07 open).
- **Inbox:** the raw webhook is stored before verification. A forged, altered or out-of-context body stays as a rejected receipt. A verified event is queued once per provider event id and applied in the same transaction that marks it processed.
- **Capture:** idempotent on the provider transaction id. It consumes the stock hold and the coupon quota once, re-reserves after an expiry, and otherwise records a fulfillment exception with a refund request. A late capture after an explicit cancellation never reactivates the order. Other open attempts are superseded.
- **Attempts:** one payable attempt per order; replacement only after a definitive failure. Session start uses the attempt's stable key, so a lost response is retried safely.
- **Worker:** `payments.session.start`, `payments.inbox.process`, `payments.reconcile` (60 s) and `orders.unpaid.expire`. Expired unpaid orders are cancelled with a customer-visible `order.expired` event.
- **Return URL** `/api/payments/return` writes nothing.
- **Review:** no Critical findings. Six Important findings were fixed test-first (capture fact rollback, mismatched captures, authorization regression, superseding attempts, the expiry sweep, the unbounded webhook body). Webhook rate limiting is deferred to Task 21.
- **Gates:** see the [handoff](handoffs/task-14b.md#commands-and-results).

[Detailed receipt](handoffs/task-14b.md).

### Task 16A

**Code complete, browser smoke pending: manual fulfillment and order timeline (2026-11-17).** No migration.
- **Service:** `src/server/fulfillment/service.ts`. In PostgreSQL mode `/api/admin/orders` is served by it: reads need `orders:read`, writes need `orders:fulfill`.
  - Split shipments by item quantity over the order's paid allocations. The shipment states are `ready → dispatched → delivered`, or `ready → cancelled`. Backwards moves are 409 `INVALID_TRANSITION`.
  - Every write takes a CAS version and an idempotency key scoped to the staff user, and is audited.
  - It writes no stock movement: capture already consumed the stock.
- **Eligibility:** a live order with a capture fact, paid or partially refunded, confirmed and not an exception. Otherwise 409 with `LEGACY_ORDER`, `ORDER_NOT_PAID`, `FULFILLMENT_EXCEPTION` or `ORDER_NOT_SHIPPABLE`. Demo and legacy summary orders never ship.
- **Timelines:**
  - Staff see every recorded order event, and internal notes need `orders:fulfill`.
  - Customers see `fulfillment.shipped` and `fulfillment.delivered` and their dispatched or delivered shipments, with no carrier, tracking or notes (D04). Times come from the server clock; no client date is accepted.
- **UI:**
  - The admin orders page is a fulfillment screen in PostgreSQL mode: queue, items, shipments, actions, timeline.
  - The account order detail lists shipments.
- **Review:** no Critical findings. Three Important findings were fixed test-first: the status denominator now uses restored units, a concurrent key reuse is 409 not 503, and support no longer sees tracking. The fourth (refund-vs-shipping contract) is a 16B ruling.
- **Gates:**
  - `npm test` **499/499** and `npm run check` exit 0.
  - **The browser smoke is NOT yet passed.** Two runs stalled compiling `/account` (CDP navigate timeout), before the new Task16A step, with 0.1–0.3 GB free RAM. See the [handoff](handoffs/task-16a.md#commands-and-results).

[Detailed receipt](handoffs/task-16a.md).

### Task 16B

**Complete: cancellation, returns and refunds (2026-11-18).** It absorbs Task 17 and needs no migration. Task 16 is complete except for the browser smoke runs, which are still open.
- **Service:** `src/server/fulfillment/aftersales.ts`. Every after-sales action is one more action on `/api/admin/orders`, and every one locks the order first (16A ruling M8).
- **Cancellation** (`cancel_order`, `orders:fulfill`) depends on the payment and shipping state:
  - **Unpaid:** the open payment attempts are cancelled, the stock hold and coupon quota are released, and an authorization also gets an internal `void_required` event.
  - **Paid but not shipped:** ready shipments are cancelled first. Each allocation's unshipped units are then restored with one compensating movement, and the paying capture's remaining balance is reserved for refund item by item. This path also needs `payments:refund`.
  - **Shipped:** 409 `ORDER_SHIPPED`; shipped units go through a return.
- **Refunds** (`refund`, `payments:refund` with fresh MFA): item, shipping and adjustment lines are reserved against the paying capture, and the refundable balance is checked under the order lock and by the 0003 trigger.
  - Discount and tax are split by cumulative quantity share, so refunding every unit, in any split, adds up exactly to the line total.
  - Refunding unshipped units puts them back on hand (16A ruling I2), unless staff send `restock: false`.
  - The provider is called outside any transaction with the refund's stable key. A timeout leaves the refund `unknown` and keeps the money reserved; only a definitive failure releases it.
  - The worker job `payments.refunds.process` (every 60 s) submits and retries refunds. The payment summary follows only the paying capture.
- **Returns** (`create_return`, `update_return`, `orders:fulfill`): requested → authorized → received → inspected → closed. Only an inspection with a `restock` decision puts accepted units back on hand, once per return line; quarantined and disposed units never do.
- **UI:** a "Cancel order" button, plus read-only refund and return lists in the fulfillment screen.
- **Review:** one Critical and four Important findings were fixed test-first:
  - a failed refund no longer lets the same units be restored twice;
  - refunds use the paying capture;
  - the payment summary ignores duplicate captures;
  - an unpaid order with a mismatched capture cancels like an unpaid order;
  - cancelling after a partial refund still refunds item by item.

  Two more are rulings: whether item refunds should restore stock (now opt-out with `restock: false`), and automatic refund submission (I6).
- **Gates:**
  - `npm test` passed **514/514**, run one test file per process (see the handoff for why).
  - `npm run check` exited 0.
  - **The browser smoke was not run:** only 84 MB of RAM was free.

[Detailed receipt](handoffs/task-16b.md).

### Task 18A

**Complete: scheduled publishing and media uploads (2026-11-18).** No migration. 18B is next.
- **Publishing** (`src/server/content/publishing.ts`, `/api/admin/content`, `content:write`):
  - version history; publish now or at a scheduled time, optionally until an end time; unpublish;
  - restore an earlier version as a new version (history is never rewritten);
  - slug change with a 308 redirect, which the proxy already serves from the `redirects` table.
  - Every write checks the page version, is audited, and enqueues `content.published` / `content.unpublished` for cache invalidation in the same transaction.
- **Rules:**
  - Public reads apply the publication window: lists, slugs, the homepage and the sitemap.
  - A live page cannot be replaced by a future publication, and the homepage cannot be scheduled.
  - Editor saves with `draft: true` leave the live version untouched (draft isolation).
- **Rich text:** blog bodies go through an allowlist sanitizer when saved and again when rendered (balanced tags, linear time). Excerpts are plain text.
- **Collections:** merchandising collections reference products by public key. The public read skips archived or unpublished products and keeps the order.
- **Uploads** (`src/server/content/media.ts`, `/api/admin/media`, `/api/admin/media/upload`, `/media/<key>`):
  - a signed upload grant expires after 15 minutes and covers one file, whose type (PNG, JPEG, GIF or WebP), size (5 MB maximum), SHA-256 checksum and alt text are declared up front;
  - the upload is checked for exact size, magic bytes and checksum, and stored under an immutable key;
  - public and private files are stored separately, and private files are never served;
  - an hourly job, `media.orphans.cleanup`, archives orphaned uploads after a 24-hour grace period and keeps the files so they can be recovered.
- **Review:** no Critical findings. Five Important findings were fixed test-first: unbalanced tags, quadratic sanitizing, a stale publication window after an editor save, the homepage being scheduled offline, and the editor publish path not invalidating. The sixth, homepage collection wiring, is a ruling deferred to 18B.
- **Gates:**
  - `npm test` **532/532**, one test file per process; this covers the route fix, with units re-run at 178/178.
  - `npm run check`: exit 0, with no file-tracing warnings.
  - **The browser smoke was not run**: 104–161 MB free.

[Detailed receipt](handoffs/task-18a.md).

### Task 18B

**Complete: reports, exports, settings, USD rate editor and inventory admin UI (2026-11-18).** No migration. This absorbs Task 19, so Task 18 is complete.
- **Dashboard** (`src/server/reports/service.ts`, `/api/admin/reports`): SQL summaries replace the old browser-side aggregation. It reports captured money minus succeeded refunds:
  - grouped by currency and by payment environment (sandbox or live);
  - in local calendar days of an IANA time zone, for at most 92 days;
  - a refund counts on the day it succeeded, taken from its immutable `refund.succeeded` event.

  It also serves a low-stock list. In PostgreSQL mode the admin dashboard is the new `ReportsScreen`.
- **Exports** (`src/server/reports/exports.ts`, `/api/admin/exports`):
  - Who: `exports:create` plus the read permission for the kind; only the requester can download, and both checks repeat on every download.
  - What: catalog CSVs and dated order CSVs; order exports carry no names, phones, e-mails or addresses.
  - How: generated asynchronously by the worker job `exports.generate` into private storage, expiring after 24 hours. Exports over 50,000 rows are refused (409).
  - Each cell is quoted, and anything that could run as a spreadsheet formula is neutralised.
  - An export that cannot be built ends as `failed`. An hourly sweep (`exports.expire`) expires old exports and deletes their files, crash-safely.
- **Settings** (`src/server/settings/service.ts`, `/api/admin/settings` in PostgreSQL mode): typed, versioned and audited, and they never return legacy secrets. The payment mode cannot be changed here.
  - Invalid combinations are 409: USD display without a rate, or an unknown or band-less shipping policy.
  - The KZT-per-USD editor writes a new exchange-rate version each time.
  - New `StoreSettingsScreen`.
- **Stock (11A M7):** the dashboard's low-stock list has a Restock +10 button and a ± count correction, both posting audited adjustments to `/api/admin/inventory`. Each pending action keeps its idempotency key, so a retry cannot double the stock. The product list shows real stock counts.
- **Review:** no Critical findings. Nine Important findings were fixed test-first:
  - an export expiry could leave its private file behind after a crash;
  - impossible dates were accepted;
  - exports never reached `failed`;
  - exports were truncated silently;
  - sandbox money was mixed into revenue;
  - a refund's day could move;
  - two client errors came back as 503;
  - the restock retry could double the stock;
  - order exports needed no order-read permission.
- **Gates:**
  - `npm test` **546/546** (one test file per process) and `npm run check` exit 0.
  - **The browser smoke was not run**: 116–418 MB free.

[Detailed receipt](handoffs/task-18b.md).

### Task 21A

**Partial, and the chain stopped (2026-11-18).** Migration **0011** adds `rate_limit_buckets` and two indexes.
- **Indexes:** justified by EXPLAIN of the services' own SQL on a seeded, fully migrated database at scale 0.1 (100,000 orders):
  - `orders_shown_at_idx`: staff queue 53 → 0.8 ms, export count 15 → 0.03 ms;
  - `payment_transactions_capture_time_idx`: dashboard 17 → 0.15 ms.
  - Script: `scripts/perf/explain-report.mjs`. Report: [performance-report.md](performance-report.md).
- **Shared rate limits** (PostgreSQL, one budget across instances, keyed on the trusted proxy client address): webhooks 600/min, quotes 120/min, checkouts 30/min.
- **Permission matrix:** the default roles are checked against the Section 9 matrix.
- **Withdrawn:** the public data cache. Review showed stale-while-revalidate takedowns, no cross-instance invalidation and unbounded disk use. It needs a shared, bounded cache handler, which is an infrastructure decision.
- **Blocked:**
  - browser E2E purchase lifecycles: they need ≥1 GB free RAM, and a purchase cannot reach "paid" without O07;
  - catalog and search plans: they need a seed with catalog relations.
- **Review:** two Critical findings (rate-limit identity: one shared bucket, spoofable forwarding) and the Important I1, I2 and I8 were fixed test-first. I3–I7 (the cache) were resolved by withdrawing it. I9 was resolved with faithful SQL plus an explicit "not measured" for catalog and search. I10 (browser E2E) is blocked.
- **Gates:**
  - `npm test` **555/555**, one test file per process.
  - `npm run check`: exit 0.
  - **Browser smoke not run:** 104–345 MB free.

[Detailed receipt](handoffs/task-21a.md).

### Task 21C

**Complete: manual payment confirmation, owner decision O07 (2026-11-18).**
- **Migration 0013:**
  - the manual provider is allowed in attempts, transactions and refunds (live environment and `manual` account only);
  - the `owner` role;
  - settings for the payment instructions and the hold (default 48 hours, 1–168);
  - a `payments:confirm` seed for `super_admin` and `owner`.
- **Checkout** uses the manual adapter, and production refuses demo. The receipt shows "Awaiting payment", the KZT total, the instructions and the hold end.
- **Staff confirmation** (`payments:confirm` with fresh MFA; method, reference, amount received, note) runs through the 14B capture path: a capture fact, stock and coupon consumed, `order.paid`, an internal event and an audit entry.
  - It is idempotent on the reference, and a reference is never used twice (also under concurrency).
  - Cancelled, expired, demo and mismatched confirmations are refused.
- **After payment:** paid orders ship, count in revenue, and refund as **manual refunds** that staff complete with a payout reference.
- **Review:** no Critical findings. I1 (the prefilled amount) was fixed. I2 (holding stock without paying) is an owner follow-up.
- **Gates:** integration **362/362**; the browser smoke passed, including the new O07 step.

[Detailed receipt](handoffs/task-21c.md).

### Task 21B

**Run on the VPS (2026-11-18): correctness passes, browsing capacity fails.**
- **Setup:**
  - The production Docker image, PostgreSQL 18.6, the worker and a TLS nginx proxy on a private network, capped at app 1.5 / database 2.5 / worker 0.5 / proxy 0.5 vCPU, with k6 1.4.2 at 1 vCPU.
  - Scale-1 seed: 5,000 products, 50,000 variants, 150,000 users, 1M orders, 3M items, 800k captures.
- **Results:**

  | Run | Result |
  |---|---|
  | Steady 100 rps × 30 min | p95 7.9 s, 85% errors: fail |
  | Burst 500 rps × 5 min | 138 rps achieved, 88% errors: fail |
  | Checkout 20/s × 5 min | 6,000 orders, checkout p95 268 ms, 0 errors: pass |
  | Last unit, 100 shoppers | 1 order: pass |
  | Duplicate key, ×50 | 1 order: pass |
  | Failure injection | 1,020 of 1,020 checkouts placed, recovery within seconds, all invariants: pass |
- **Measurements:**
  - Pool wait p95 up to 2.9 s: listings starve the 10-connection pool.
  - Database CPU at its cap from 10 rps.
  - Worker lag 0 under load, 41 s while the worker was killed.
  - Staff/order queries at 1M orders: 0.7–208 ms.
- **Decision (with numbers):**
  - **Offer summary for price sorts:** page selection 0.3 ms instead of 1.3 s, rebuild 138 ms.
  - **Shared cache for the 100/500 rps targets:** without price sorts the mix still saturates at about 25 rps.
- **Fixes:**
  - `requestURL()`: every same-origin API check failed behind the proxy (test-first, 4 unit tests);
  - the history seed correlation (21A's dashboard/export numbers had measured an empty window);
  - a Task 13A smoke race;
  - opt-in pool wait statistics (`DATABASE_POOL_STATS_MS`).
- **Gates:** unit 197 (+1 skip), legacy 73/73, integration **362/362**, lint 0 errors, typecheck, boundaries, build, and the browser smoke passed.

## Remaining task list

Tasks 12–22 were consolidated on 2026-11-17 from 24 sub-slices into 12 chained slices; see "Consolidation of Tasks 12–22" in the plan. Steps that need a real provider are in its deferred activation backlog.

| Task | Status | Work still required |
|---|---|---|
| 10 | Complete (10A, 10B, 10C) | — |
| 11 | Complete (11A, 11B) | — |
| 12 | Complete (12A, 12B) | — |
| 13 | Complete (13A, 13B) | — |
| 14 | Complete (14A, 14B) | — |
| 15 | Merged into 14 | Real provider work is in the deferred activation backlog |
| 16 | Complete (16A, 16B) | 16A browser smoke passed 2026-11-18; 16B has no smoke steps (integration-tested) |
| 17 | Merged into 16 | — |
| 18 | Complete (18A, 18B, I6 collection wiring) | — (homepage collections wired with draft isolation, migration 0012, 2026-11-18) |
| 19 | Merged into 18 | Email/newsletter sending is in the deferred activation backlog |
| 20 | Merged into 13 | Wishlist built in 13A; other account domains deferred in [account-tab-dispositions.md](account-tab-dispositions.md) |
| 21 | 21A done except price-sort p95 (286 ms asc, 431 ms desc end to end); 21B run and re-run after the follow-up; 21C complete | Optional, owner choice: a shared page/data cache or more app vCPU for the 100/500 rps stress targets (25 rps is clean, 100 rps fails on app CPU). Watch item: partial index for the unpaid-order expiry sweep |
| 22 | Merged into 21 | — |
| 23 | Not started (owner-run) | Cutover and recovery rehearsal |
| 24 | Not started (owner-run) | Authorized production cutover, observation and retirement |

Real source quarantine, provider configuration, production capacity and recovery qualification remain explicit launch gates. Nothing here certifies production readiness. The [XL task list](../plans/2026-11-10-postgresql-backend-migration-xl.md) remains the binding specification; this file is its progress report.
