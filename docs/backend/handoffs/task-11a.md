# Task 11A handoff: inventory ledger, audited adjustments, reconciliation, opening import

**Status: complete, 2026-11-17**, including the review fix pass. Task 11 is **in progress**: 11B (reservations) is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `3eecd53` (Task 10C). 11A is committed on the same branch (see `git log`). No push, merge, deployment, real import or backend activation has been done. Owner decision **O08** still gates live reservation and fulfillment. Its interim rule, "preserve opening stock with provenance", is what the opening import implements.

The contract is in [inventory-ledger.md](../inventory-ledger.md).

## Files

### New

- `drizzle/0008_inventory-ledger.sql`, plus `drizzle/meta/0008_snapshot.json` and a journal entry.
  - **Generated part:** adds the `opening` movement reason, and the `stock_movements_opening_valid` check (positive on-hand only, zero reserved, source reference required).
  - **Hand-written part:**
    - A residual backfill for existing balances. It raises if the ledger already exceeds a counter.
    - Trigger `stock_movements_apply`: every movement applies its deltas to the balance and bumps `version`.
    - Trigger `inventory_balances_guard`: rejects nonzero balance inserts, direct counter/version updates outside the apply trigger (checked by `pg_trigger_depth()` plus a transaction-local marker), deletes and identity changes.
    - Truncation is rejected.
- `src/server/inventory/service.ts`:
  - `createInventoryService({ pool, authorize })` provides:
    - `getStock` — `catalog:read`; balance plus the last 20 movements.
    - `adjust` — `inventory:write`; audited, idempotent per staff user and key, optional `expectedVersion`, floor at reserved.
    - `reconcile` — `inventory:write`; read-only.
  - Exported functions:
    - `reconcileStock(pool)`.
    - `importOpeningBalances(pool, { runId })` — internal, no HTTP.
  - One location keyed `main` (O08), created on first use.
- `src/server/inventory/http.ts` — the `/api/admin/inventory` mapping:
  - `GET ?variantId=`, `GET ?view=reconciliation`, `POST` adjust.
  - Strict query, same-origin POST, `no-store`.
- `src/server/inventory/runtime.ts` — PostgreSQL-only (503 otherwise). Authorizes with `requireStaffPrincipal` (staff + MFA admission), then `requirePermission`.
- `src/app/api/admin/inventory/route.ts` — Node runtime. GET and POST delegate to `handleAdminRequest("inventory")`.
- `tests/integration/inventory-ledger.test.mjs` — 12 tests.
- `tests/integration/inventory-ledger-upgrade.test.mjs` — 1 test. It upgrades a 0007 database that holds balances and ledger rows to 0008.
- `tests/unit/inventory-route.test.mjs` — 2 tests.
- `docs/backend/inventory-ledger.md` — the contract.

### Changed

- `src/server/db/schema/inventory.ts` — `opening` reason and opening check.
- `src/server/auth/admin-runtime.ts` — dispatches `"inventory"` to the inventory runtime.
- `src/server/cms/service.ts` — the admin product DTO now reads `stock` (available = on-hand − reserved over non-archived locations) and `stockManaged` from balances, instead of a fixed `0`/`false`.
- Fixtures that wrote counters directly now create a zero balance and record an `opening` movement:
  - `tests/integration/catalog-read.test.mjs`
  - `tests/integration/payments-fulfillment-promotions.test.mjs`
  - `tests/integration/commerce-inventory.test.mjs` — its last-unit race now races two `reserve` movements: exactly one succeeds, the other gets 23514.
- `docs/backend/commerce-inventory-schema.md` — the "a ledger row does not alter a balance" statement is replaced by the 0008 behaviour.
- Plan (Task 11 status; reconciliation/opening checkbox ticked; completion list), `task-progress.md`, this handoff.

## Commands and results

All runs were from PowerShell. Receipts are in `temp/backend-next-three/11a/` (git-ignored).

| Run | Result | Receipt |
|---|---|---|
| Disk before gates | C: 7.3 GB free; 7.2 GB before the final run | `final-exit.txt` |
| Inventory tests RED | 0/10. Test 1: a direct nonzero balance insert was accepted. Test 2: `opening` violated `stock_movements_valid`. Tests 3–10: "Task 11A requires the inventory service" | `red-1.log` |
| Route test RED | 0/2 ("route is missing"; `runtime.ts` ENOENT) | (console) |
| Slice GREEN | Route 2/2. Integration 8/10, then 10/10 after two fixes: the CMS select list did not include the lateral stock columns, and the test fixture's migration run must start `pending` | `green-route.log`, `green-1.log`, `green-2.log` |
| First full `npm test` | Legacy 21/21, unit 137/137, integration 198/203. The 5 failures were older fixtures that patched counters directly, which the guard now rejects. After the fixture update, those three files pass 36/36 | `npm-test-1.log`, `fixtures-1.log` |
| Review fix RED | 0/2. Upgrade test: drift reported; M1 test: `2 !== 1` (two opening movements) | `fix-red.log` |
| Review fix GREEN | 13/13 (inventory + upgrade) | `fix-green.log` |
| Final `npm test` | **363/363** (21 legacy + 137 unit + 205 integration); server/client boundaries passed | `final-test.log` |
| Final `npm run check` | exit 0; lint 0 errors / 23 warnings (unchanged); typecheck and build pass; build lists `ƒ /api/admin/inventory` | `final-check.log` |
| Browser smoke (full admin + public + account) | exit 0: the three PASS lines (Task09 review fixes, Task09 public catalog, Task10C account page) and "Browser smoke passed" for the admin CRUD section; no `Compiling / ...` stall | `final-smoke.log` |

The smoke has no inventory-specific step yet. Inventory behaviour is covered by the real-database integration tests above, and the browser path has no inventory UI yet (ruling 6).

## Review

A read-only code reviewer (Opus) reviewed the diff. **No Critical findings.**

It confirmed:
- No SQL path changes counters without a ledger row:
  - `ON CONFLICT DO UPDATE` hits the guard at depth 1.
  - The marker reverts with an aborted (sub)transaction.
  - `ON CONFLICT DO NOTHING` on movements skips the apply trigger.
  - The RI key-share lock does not conflict with the apply update.
- Nothing 11B needs is blocked. Reserve, release and consume are single movement rows; consume is (−q, −q).
- Adjustment idempotency and concurrency are correct under READ COMMITTED.
- The reconciliation SQL is correct.
- The HTTP mapping follows the account/CMS pattern.
- The CMS DTO change is not a regression.

**Fixed test-first (one pass):**
- **I1 (Important)** — the 0008 backfill assumed an empty ledger. A database with pre-0008 movement rows would have reconciled with drift from day one.
  - The backfill now inserts only the residual: counter minus existing ledger sum, as `opening` for on-hand and `reserve` for reserved.
  - It raises if a residual is negative.
  - Test: "0008 backfills only the residual…" (new upgrade test file).
- **M1, re-graded Important** — the opening import joined every `is_default` variant, including archived ones. CMS SKU edits can leave an archived default, so stock would be double counted. The join now excludes archived variants. Test: "review M1: opening import ignores archived default variants".

**Ruled on (documented, not changed):**
- **M2** — replay ignores `note`. The contract now says a retry with an edited note replays the original, and only the original note is audited.

## Rulings

Each ruling below has the cost if it is wrong.
1. **The module lives in `src/server/inventory/`, not `src/server/modules/inventory/`.** The repository's existing modules (`account`, `catalog`, `cms`) are flat under `src/server/`.
   - Cost: a later move if the plan's layout is enforced.
2. **Balances are made ledger-driven in the database (triggers), not only by service discipline.** That enforces "no manual counter patch outside a recorded adjustment" for every writer, including 11B.
   - It required changing three Task 04 fixtures that wrote counters directly. Their invariants are unchanged; they are now exercised through movements.
   - Cost: data-only restores must disable triggers (documented).
3. **`opening` is a new movement reason, not a reuse of `receive`**, so the provenance of preserved stock is distinguishable and checked.
4. **`expectedVersion` is optional on adjustments.** A relative delta is protected by the floor check under a row lock. The version is offered for UI concurrency.
   - Cost: see deferred M3 — once 11B lands, reservations bump the version.
5. **The opening import is a function, not a CLI or HTTP route.** No real import is authorized before cutover (Tasks 23–24). The function is tested on synthetic legacy rows only.
6. **The admin UI is not changed.** The product DTO now carries real stock, but `ProductsScreen` still labels PostgreSQL stock "Not configured", and the dashboard restock button still returns 501, as before.
   - Wiring an adjustment form and the restock button to `/api/admin/inventory` belongs to the admin operations work (Task 18/19), or to an earlier slice if the owner wants it.
7. **Migration 0008 was edited after generation** (hand-written triggers and backfill, and the I1 fix) before its first commit. It has only ever been applied to disposable test databases.
8. **The SDD ledger scripts were not used.** The handoff and progress docs are the record for this chain.

## Deferred minors (not fixed)

From the review:
- **M3** — every 11B reserve or release bumps `version`, so `expectedVersion` adjustments will often conflict during checkout traffic. Decide in 11B: guard on on-hand, or use a separate staff version.
- **M4** — the movement list orders by `created_at` (transaction start). Several movements in one transaction come back in random-UUID order. Order by `COALESCE(occurred_at, created_at)` or a clock timestamp.
- **M5** — the database does not enforce sign per reason (for example, `receive` > 0; `reserve` changes only reserved). Only the service does. Add per-reason checks before 11B adds writers.
- **M6** — restore runbook: data-only restores need `--disable-triggers` (noted in the contract; the operations runbook itself is not updated).
- **M7** — `ProductsScreen.tsx:479` still says "Not configured" in PostgreSQL mode. `LowStockAlerts` restock still returns 501 (ruling 6).
- **M8** — `getStock` exposes `actorUserId` to any `catalog:read` holder (including editors). The opening import writes no audit event per run. Each request does two session lookups.
- **M9** — an archived `main` location would still be used by the service, while catalog and CMS stock ignore archived locations. Reject adjustments when `main` is archived.
- **11B note from the reviewer:** multi-row movement inserts must be ordered by (variant, location), because the AFTER ROW apply locks balances in row order.

**Declined to judge (reviewer):** whether `inventory:write` should require fresh MFA (policy); whether reconciliation should need only a read permission; the shape of `storedRecordPayload`; whether drizzle runs 0008 in one transaction.

## Exact next step

**Task 11B — race-safe reserve / consume / release / expiry.**
1. Read the Task 11 section of the XL plan, Section 6 "Checkout, inventory, and payment", `docs/backend/inventory-ledger.md` and `docs/backend/commerce-inventory-schema.md` (reservation/allocation triggers from 0002).
2. Implement the following in `src/server/inventory/`, test-first:
   - reserve: stable `(variant_id, location_id)` lock order, all lines or none;
   - consume, release and expire: exactly once, through `reserve`/`release`/`consume` movements with line provenance;
   - bounded deadlock/serialization retry.
3. Required real-DB tests:
   - 100 competing last-unit reservations: exactly one succeeds and availability never goes negative;
   - repeated consume/release has no second effect;
   - a multi-line failure rolls back every line;
   - deliberate deadlock/serialization retry bounds.
4. Decide deferred M3 and M5 there.
5. Run the gates from PowerShell. If the smoke stalls on `Compiling / ...`, remove `.next/dev`. **Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`** (UTF-8 corruption; see the 10C handoff).

**STOP_AFTER is Task 22.**
