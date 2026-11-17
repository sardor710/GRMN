# Backend migration — task reports and current position

Updated: **2026-11-17**. This is the current progress index; individual handoffs are historical completion receipts.

## Current position

- **Completed:** Tasks **01–10** (10A account APIs and ownership, 10B legacy claims/phone change/credential change, 10C account UI wiring) and sub-slice **11A** (inventory ledger, audited adjustments, reconciliation, opening import), within the scope and activation limits below.
- **Committed:** on `codex/backend-task-02`. Tasks 02–09 are in `b92fd0e`, 10A in `76bbf3b`, 10B in `7d615b9`, 10C in `3eecd53`, and 11A in the commit after it (see `git log`).
- **Next:** Task **11B**: race-safe reserve/consume/release/expiry. See [the 11A handoff](handoffs/task-11a.md#exact-next-step).
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

## Remaining task list

| Task | Status | Work still required |
|---|---|---|
| 10 | Complete (10A, 10B, 10C) | — |
| 11 | 11A complete; 11B next | 11B: reserve/consume/release/expiry, 100-way last-unit race, deadlock/serialization retry bounds |
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
