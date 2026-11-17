# Inventory ledger and stock adjustments (Task 11A)

Status: implemented in Task 11A (2026-11-17). Reservation, consumption, release and expiry are Task 11B. Nothing here activates live stock: owner decision **O08** (inventory accuracy, single location) still gates live reservation and fulfillment.

## Rules

- **The ledger is the only writer.** Every stock change is an append-only `stock_movements` row. Migration `0008_inventory-ledger` applies each movement to `inventory_balances` inside the same statement.
  - The balance check constraint rejects a movement that would make on-hand or reserved negative, or reserved exceed on-hand. The whole movement then fails, so the balance never changes without a ledger row.
  - A balance row starts at zero. Nonzero inserts, direct counter or version updates, deletes and truncation are rejected.
  - A superuser can still bypass triggers (for example with `session_replication_role=replica`). Reconciliation detects that drift.
- **One location.** Under O08 every service uses the location keyed `main`, created on first use. A second location needs an owner decision.
- **Movement reasons:** `opening`, `receive`, `adjust`, `reserve`, `release`, `consume`, `compensate`, `return`.
  - `opening` must be positive on-hand only and must carry a `source_reference`.

## Upgrading an existing database

Before 0008, counters and ledger rows were written independently. Migration 0008 gives each existing balance a provenance movement (`migration:0008-existing-balance`) for the **residual** only: on-hand minus the existing on-hand ledger sum as `opening`, reserved minus the existing reserved sum as `reserve`. It stops with an error if a residual is negative (the ledger already exceeds the counter); that needs a human reconciliation first. Reserved units without active reservation lines are reported by reconciliation afterwards.

Restores: a full `pg_dump` restore is safe because triggers are created after the data load. A data-only restore must disable triggers, or it will reject nonzero balances and double-apply movements.

## Service: `src/server/inventory/service.ts`

| Operation | Permission | Behavior |
|---|---|---|
| `getStock(headers, variantId)` | `catalog:read` | Balance at `main` plus the 20 most recent movements. A variant with no balance reads as zeros with `version: 0`. Unknown variant: 404. |
| `adjust(headers, command)` | `inventory:write` | One audited movement. See "Adjustments". |
| `reconcile(headers)` | `inventory:write` | Read-only drift report. See "Reconciliation". |
| `importOpeningBalances(pool, { runId })` | internal (no HTTP) | Opening stock from a completed legacy migration run. See "Opening balances". |

### Adjustments

The command is strict JSON: `{ variantId, delta, reason, note, idempotencyKey, expectedVersion? }`.
- `reason` is `receive` (delta must be positive) or `adjust` (either sign).
- `delta` is a nonzero integer, at most 1,000,000 in size.
- `note` is required, 1–500 characters. It is stored in the audit event.
- `idempotencyKey` is 8–128 characters of `[A-Za-z0-9_:-]`.
- `expectedVersion` is the balance version the staff member saw: 0 means no balance existed yet.

Processing, all in one READ COMMITTED transaction:
1. Lock the balance row (creating the zero row if needed).
2. **Idempotency.** The dedupe key is `adjust:<staff user id>:<idempotencyKey>`. The same request again returns the original movement with `replayed: true` and has no second effect. The same key with a different variant, delta or reason returns 409 `IDEMPOTENCY_CONFLICT`. The note is not compared: a retry with an edited note replays the original, and only the original note is audited.
3. **Version.** If `expectedVersion` is supplied and differs, the result is 409 `VERSION_CONFLICT`.
4. **Floor.** On-hand may not go below the reserved quantity: 409 `INSUFFICIENT_STOCK`.
5. Insert the movement (actor, `source_reference='staff-adjustment'`) and an `inventory.adjusted` audit event. The event records the movement id, reason, delta, note, on-hand before/after, reserved and the new version.

Concurrent decrements serialize on the balance row lock, so stock is never oversold. The tests run 20 concurrent −1 adjustments against 10 units: exactly 10 succeed.

### Reconciliation

For each balance, `reconcile` compares:
- `on_hand` with the sum of on-hand deltas in the ledger;
- `reserved` with the sum of reserved deltas in the ledger;
- `reserved` with the quantities on lines of active reservations.

It returns `{ checkedBalances, drift[], checkedAt }`. It never repairs anything; a repair is a recorded adjustment.

### Opening balances

`importOpeningBalances` reads `legacy_id_map` rows for importable products (`target_type='products'`) in one **completed** migration run, joins each to its archived `legacy_source_records` payload and the product's default variant, and in one transaction (variant-id order):
- records one `opening` movement per balance. The dedupe key is `opening:<variant>:<location>`, and the source reference is `legacy:<namespace>/products/<source key>@sha256:<record checksum>;run:<run id>`;
- creates a zero balance, with no movement, for a legacy stock of 0;
- reports, without creating anything, records with missing, negative, fractional or encoded stock (`issues`);
- reports balances that already have ledger history or a different opening (`conflicts`) and leaves them alone;
- treats a rerun as a no-op (`alreadyRecorded`).

Quarantined products are never given stock. No real import has been run; running it against real data is part of the authorized cutover (Tasks 23–24).

## HTTP: `/api/admin/inventory` (PostgreSQL mode only; otherwise 503)

| Request | Result |
|---|---|
| `GET ?variantId=<uuid>` | `getStock` |
| `GET ?view=reconciliation` | `reconcile` |
| `POST` (JSON command, same origin) | `adjust` |

The route requires a staff session with MFA admission, plus the action's permission. Any other query, a repeated parameter or another method is rejected. Responses are `no-store`.

## Admin product DTO

PostgreSQL-mode admin product rows now report `stock` as available units (on-hand minus reserved) over non-archived locations, with `stockManaged: true` once a balance exists. The admin product form still never submits stock in PostgreSQL mode. A product save with a nonzero `stock` still returns 501 and points to this workflow.
