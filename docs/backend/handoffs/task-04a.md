# Task 04A handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete — inventory, carts and orders schema only. Task 04B has not started.

Date: 2026-11-10. Workspace: `C:\Users\Freakman\.codex\worktrees\backend-task-02\GRMN`; branch `codex/backend-task-02`. Reused this isolated checkout. No commit, push, merge, deployment or persistent DB migration. Preserve earlier uncommitted backend/UI/account work and all real source records.

## Owned files and contracts

- `src/server/db/schema/commerce.ts`: carts/items, quotes/attempts, sequence-backed orders, address/item/adjustment snapshots, events and guest access hashes.
- `src/server/db/schema/inventory.ts`: locations/balances, reservations/lines, paid allocations and movements.
- `drizzle/0002_commerce-inventory.sql`, `drizzle/meta/0002_snapshot.json`, appended journal entry: 16 tables and an order-number sequence, 49 tables total. The previous 33 table definitions and migration 0000/0001 files/snapshots are unchanged.
- `tests/integration/commerce-inventory.test.mjs`: real PostgreSQL constraints, history, ownership, concurrency and migration tests.
- `docs/backend/commerce-inventory-schema.md`, dictionary/local setup amendments, XL plan status and this receipt.

The schema reference is the precise handoff for later repositories/services. Existing browser-safe TypeScript contracts remain unchanged. All authoritative money is KZT bigint, serialized as integer strings. USD is an optional display snapshot; no FX strategy/settings/provider integration was activated.

## Implemented behavior

Stock balances reject negative counts and reserved greater than sellable on-hand. Reservations have indexed expiry, immutable lines and terminal headers. Allocations must reference a consumed matching-order reservation line with identical variant/location/quantity; restored counters cannot decrease or exceed allocated quantity. Movement/event rows are immutable, deduplicated and truncate-protected; stock movement source pointers must agree with each other as well as the balance.

Carts have exactly one user or hashed guest actor, a unique active user/market/KZT cart, 1–99 quantities and a concurrency-safe 100-line cap. Checkout attempts reference an exact quote/cart revision and retain scoped idempotency key/request hash. Only one pending/committed attempt can win a revision; failed keys retain history. A saved order seals its snapshots and consumes its pending attempt in the same transaction.

Orders use a PostgreSQL sequence plus a unique public number. Purchase snapshots are immutable; complete orders reconcile item/header totals and a structured address at deferred commit validation. Sealed snapshots reject further rows. Independent lifecycle summaries and verified user/profile claim links remain service-managed. Explicit incomplete historical KZT rows can retain unknown components, phone/time and missing catalog/line facts; unresolved total/currency records remain staging obligations.

## Verification

- **`npm test`: 69 passed, 0 failed** — 21 legacy, 13 unit and 35 real-PostgreSQL integration cases; server/client boundary check passed. Final integration run took 240.3 seconds here.
- **11 new commerce/inventory cases passed**, including the source-provenance regression after its observed failure and correction. Empty/prior migrations and replay, stock/cart/checkout contention, sequence uniqueness, exact bigint totals, historical snapshots and append-only behavior are covered.
- **`npm run check`: passed** — lint has 0 errors / 28 existing warnings; typecheck and production build passed without DB credentials or activating the new backend. The later review correction changed only custom migration SQL and its test/docs.
- Baseline hashes cover **208 existing source/test/script/migration/config files**; only the appended migration journal changed. Existing app sources, real source JSON, packages/lockfile and 0000/0001 history remain byte-identical. Snapshot comparison confirms all 33 prior table definitions unchanged and the correct snapshot parent link.
- New owned files have no trailing whitespace. All disposable PostgreSQL run/prior-fixture directories were removed after confirmed shutdown.

The initial real-DB test failed because `inventory_balances` did not exist, then passed after migration implementation. The first complete run exposed a test-only UUID/text parameter reuse; separate parameters fixed it. Ten scoped cases subsequently passed.

An independent read-only Code Reviewer found one material source-consistency issue: a movement could combine reservation and allocation pointers from different orders using the same balance. A new regression reproduced the accepted write before the correction. The custom guard now requires an allocation to reference the supplied reservation line exactly. The reviewer otherwise found the migration additive and guards coherent; no production-readiness certification or reviewer test run is claimed.

## Rulings and service work still required

- Scope stays schema-only, with no activation. Stock counters/ledger rows must be changed together by transactional services; reservations do not automatically update balances, and events do not prove payment. Permissions, quote authority/freshness, cart version advancement, verified claims, state transitions, allocation totals versus order quantities, shipment claims and balance/ledger reconciliation remain their planned service tasks. The reviewer explicitly set these aside for this slice. Enabling routes before those gates would be unsafe.
- Snapshot creation is one explicit transaction, followed by deferred sealing. Legacy incomplete rows retain uncertainty; unknown currency/total records require import reconciliation instead of invented facts. Wrong source mappings must be resolved in staging before creating immutable rows.
- PowerShell receipts/baseline checks under ignored `temp/backend-task-04a/` replace the skill's Bash helper, because Bash is absent. No commit-range receipt was invented and no shared scratch directory was deleted. The exact handoff and observed test outputs provide the execution record.

No localization strategy was selected. Kaspi/secondary payments, carrier and email/newsletter integration remain deferred. Warehouse details, raw source JSON, capability hashes and internal event payloads are private; later DTOs must explicitly select safe fields. Constraint tests do not establish production throughput or minimum VPS resources.

## Recovery and next task

Only disposable synthetic databases were used. No real-data rollback is required. If abandoning this slice, revert only the owned files and journal append; never reset this dirty checkout. Logs, hashes, execution ledger and the local safety snapshot in ignored `temp/backend-task-04a/` must not be staged or published.

Next: **Task 04B only — payment/refund, manual fulfillment/returns and promotions/markdown schema**, using the existing XL plan and contracts. Append migration 0003; preserve completed migration 0000–0002 and all custom SQL guards. Reuse order/item/allocation IDs and independent lifecycle summaries. Do not count a simulated payment as capture, expose internal carrier details, activate providers or choose language modeling. Generic content/settings/jobs/audit/import schemas remain 04C. Save `task-04b.md` and stop.
