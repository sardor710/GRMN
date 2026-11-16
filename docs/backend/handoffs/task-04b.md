# Task 04B handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete — payments/refunds, manual fulfillment/returns and promotions/markdown schema only. Task 04C has not started.

Finalization date: 2026-11-11; work began 2026-11-10 and resumed on the owner's instruction. Workspace: `C:\Users\Freakman\.codex\worktrees\backend-task-02\GRMN`; branch `codex/backend-task-02`. No commit, push, merge, deployment or persistent migration. Preserve all earlier uncommitted backend/UI/account work and source records.

## Owned outputs

- `src/server/db/schema/payments.ts`: attempts, authorization/capture/void facts, refund reservations and item allocations.
- `src/server/db/schema/fulfillment.ts`: manual/internal shipments/items/events, return headers and inspection/restock counters.
- `src/server/db/schema/promotions.ts`: coupon definitions/targets/quota evidence plus separate automatic markdown definitions/targets.
- `drizzle/0003_payments-fulfillment-promotions.sql`, `drizzle/meta/0003_snapshot.json`, appended journal entry: 16 tables, 65 total. Custom SQL also adds a restoration guard on existing allocations; no prior DDL/snapshot definition is rewritten.
- `tests/integration/payments-fulfillment-promotions.test.mjs`: real PostgreSQL upgrade, ownership, immutable facts and contention cases.
- `docs/backend/payments-fulfillment-promotions-schema.md`, dictionary/local setup amendments, the existing XL plan status and this receipt.

Existing browser-safe contracts, routes, dependencies and real JSON data are unchanged. Provider codes/context are integration boundaries, not configured provider credentials. KZT remains authoritative; USD stays display-only and language modeling is deferred.

## Implemented rules

One created/pending/requires-action/authorized/unknown payable attempt can occupy an order. Provider identifiers/keys are scoped by provider/environment/merchant; request identity and amount are fixed. Transactions are immutable facts; demo cannot create authorization/capture/void cash facts. Captures can retain actual overpayment/late outcomes for future reconciliation instead of discarding evidence.

Refund reserved/pending/unknown/succeeded amounts count against their capture. A nested private epoch update serializes refund writers, including stale repeatable-read transactions. Terminal outcomes cannot reopen; item allocations stay attached to the same order and cannot be rewritten. No refund automatically changes stock.

Draft shipment claims consume allocation capacity; concurrent claims cannot exceed it. Cancellation frees undispatched claims, while dispatched units need returns. Restoration/inspection checks distinguish returned stock from untouched allocation units and retain a gross cap preventing repeated dispatch through the original allocation. Return claims are bounded by shipped quantity and inspection/restock counters are monotonic. Carrier/tracking/staff notes remain private, with no customer DTO change or carrier activation.

Coupon quota includes reserved/used rows and preserved legacy usage. Limited customers require server-verified identity/subject representation; hashing contact text alone proves nothing. Definitions default to draft/nonstackable, and typed fixed/percentage values/target links are constrained. Admin markdowns remain separate from coupon codes and authoritative base prices.

## Verification

- **`npm test`: 80 passed, 0 failed** — 21 legacy, 13 unit and 46 real-PostgreSQL integration cases; server/client boundary check passed. Final integration run took 327.2 seconds here.
- **11 new schema cases passed**, including refund contention at read committed/repeatable read, return inspection and quantity contention, preserved quota/subject limits and the partial-return regression. The regression runs with restoration recorded before and after the next shipment claim, and rejects reuse through the old allocation.
- **`npm run check`: passed** — lint has 0 errors / 28 existing warnings; typecheck and production build passed without database credentials or backend activation.
- Baseline SHA-256 comparison covers **213 existing source/test/script/migration/config files**. Only the appended migration journal changed; existing app sources, business JSON, packages and migration 0000–0002 files/snapshots remain byte-identical. Snapshot 0003 links to 0002 and retains all 49 prior table definitions unchanged.
- Seven new owned source/test/SQL/document files have no trailing whitespace. Disposable PostgreSQL/prior-fixture directories were removed after shutdown.

Initial RED: `payment_attempts` did not exist. Migration application/replay and preservation passed, then test fixtures needed explicit UUID casts when also deriving text keys. Nine scoped cases passed after that correction. Added repeatable-read refund contention, inspection/restock and per-subject quota checks.

The first reviewer attempt failed due to the model usage limit. After the owner resumed, the fresh read-only review completed and found one material edge case: shipping an untouched unit after an inspected partial return was falsely rejected. A regression reproduced `23514` before the fix. The corrected guard checks both gross original allocation claims and net outstanding claims, with tests for both restoration-counter orders and preventing reuse of returned units. The reviewer did not run DB tests, and no production-readiness certification is claimed.

## Rulings and limits

- This is schema-only. Provider verification/activation, permission checks and verified identity, quote eligibility and discount/refund allocation arithmetic, actual stock/ledger changes, cross-module lifecycle orchestration, carrier integrations and public DTOs/routes remain later service tasks. The reviewer explicitly set these aside. The cost of enabling routes too early would be unsafe behavior, so activation remains disabled.
- Financial fields remain immutable while nested private epoch/version updates serialize contention. Future runtime grants must allow those specific writes and reads; DDL stays on the separate migration role. Extra row writes are the deliberate cost of keeping refund/quota/claim checks sound across isolation levels.
- Draft claims and pending returns reserve capacity conservatively. A partial inspected return must not block untouched units, and returned stock must not reuse the original dispatch allocation. An exceptional quantity correction requires a later audited workflow, not destructive history edits.
- PowerShell baseline/log/ledger receipts under ignored `temp/backend-task-04b/` replace the unavailable Bash helper. No commit range or successful reviewer run was invented. Keep those logs and the local source safety snapshot private and untracked.

Only synthetic disposable PostgreSQL databases were migrated. No real payment/OTP/email/carrier integration, real records import or website cutover occurred. No production throughput or minimum VPS claim follows from these tests. Historical financial uncertainties remain protected staging obligations; do not manufacture captures, per-user coupon histories or shipment facts.

## Recovery and next task

No real-data rollback is needed. Revert only this slice's owned files and journal append if abandoning it; never reset the dirty checkout or rewrite prior migrations. Preserve custom guards not represented in Drizzle snapshots.

Next: **Task 04C only — content and operations schema**. Append migration 0004 after completed 0000–0003. Include CMS content/versioning/homepage collections, typed settings/manual FX boundaries, durable audit/events/jobs/outbox/inbox, generic idempotency, exports/notifications and import provenance/issues per the XL plan/source manifest. Translation-specific modeling and external sending/providers remain deferred. Reuse existing media/order/identity/catalog references; do not alter financial snapshot/consent/quantity guards. Save `task-04c.md` and stop before Task 05.
