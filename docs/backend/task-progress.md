# Backend migration — task reports and current position

Updated: **2026-11-17**. This is the current progress index; individual handoffs are historical completion receipts.

## Current position

- **Completed:** Tasks **01–09** and **10A** (account APIs and ownership), within the scope and activation limits below.
- **Committed:** Tasks 02–09 are committed on `codex/backend-task-02` as `b92fd0e`. **10A is uncommitted** until the owner confirms the commit.
- **Next:** Task **10B**: AccountDashboard UI wiring, audited legacy-order claims, verified phone change/recovery and the credential-reset flow. It runs in a separate session. Its draft tests are in `tests/integration/account-claims.pending.mjs`.
- **Authorized stopping point:** Finish 10 (10B remains), then stop before 11.
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

**Complete — account APIs and ownership (2026-11-17, uncommitted).**
- Added session-owned profile, saved-address CRUD and paginated order history/detail services. They are exposed through `/api/account/{profile,addresses,addresses/[id],orders,orders/[id]}`.
- The API never accepts an email or user ID as a selector. It returns 503 unless both PostgreSQL mode and auth are enabled.
- Migration 0006 enforces the five-address limit, owner immutability and exactly one primary address in the database, under concurrency. Address writes fail closed outside READ COMMITTED.
- `customer_profiles.email_verified_at` keeps a customer-typed email marked as unverified; an unverified email grants no ownership.
- Order history uses HMAC cursors bound to the user. Order detail returns customer-visible snapshots and events only.
- Final `npm test` **313/313** (21 legacy + 111 unit + 181 integration), with boundaries passing. `npm run check` passes. Browser smoke results are recorded in the receipt.
- An independent identity reviewer found no Critical issues. Two findings were re-graded Important and fixed test-first.

[Detailed receipt](handoffs/task-10a.md).

## Task 10B — next, not started

Required work:
- Wire the AccountDashboard UI to `/api/account/*`, with loading, empty and error states, and remove its `?email=` fetch and demo literals.
- Implement verified phone change and recovery.
- Implement audited legacy-order claims.
- Make the credential reset use the real auth service.

Start from `tests/integration/account-claims.pending.mjs`. Preserve embedded real records privately and expose only approved data to their verified owner.

## Remaining task list

| Task | Status | Work still required |
|---|---|---|
| 10 | 10A complete; 10B next, authorized | 10B: account UI wiring, verified phone change/recovery, legacy claims, credential reset |
| 11 | Not started | Inventory ledger and race-safe reservations |
| 12 | Not started | Durable inbox/outbox and background workers |
| 13 | Not started | Server cart, pricing, shipping/tax quotes and promotion quotas |
| 14 | Not started | Idempotent checkout and pending orders |
| 15 | Not started | Payment adapter, verified webhooks and reconciliation |
| 16 | Not started | Fulfillment, shipments and actual order events |
| 17 | Not started | Cancellations, refunds, returns and stock compensation |
| 18 | Not started | CMS publishing, media and merchandising operations |
| 19 | Not started | Reports, exports, notifications and store configuration |
| 20 | Not started | Required wishlist and remaining account domains |
| 21 | Not started | Measured queries, caching and search optimization |
| 22 | Not started | End-to-end, load, security and failure qualification |
| 23 | Not started | Cutover and recovery rehearsal |
| 24 | Not started | Authorized production cutover, observation and retirement |

Real source quarantine, provider configuration, production capacity and recovery qualification remain explicit launch gates. Nothing here certifies production readiness. The [XL task list](../plans/2026-11-10-postgresql-backend-migration-xl.md) remains the binding specification; this file is its progress report.
