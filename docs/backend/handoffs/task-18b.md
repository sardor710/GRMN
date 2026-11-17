# Task 18B handoff: reports, exports, settings, USD rate editor and inventory admin UI

**Status: complete, 2026-11-18.** This task absorbs 19, so Task 18 is complete. Task **21A** is next; 20 is merged into 13.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `69e1d81` (18A). See `git log` for the 18B commit.

Nothing has been pushed, merged or deployed, and no messages were sent. **No migration.** The 0004 schema already holds `store_settings`, `exchange_rate_versions`, `export_jobs` with its private-asset guard, and the tax and shipping policy versions.

## Files

### New

- **`src/server/reports/service.ts`**: `createReportsService({ pool, authorize })`.
  - **`summary`** (`orders:read`) takes `{ from, to, timeZone }`. Dates are strict calendar dates, the range is at most 92 days, and the zone must be in `pg_timezone_names`.
    - Totals and day rows are grouped by `currency` **and** `environment` (sandbox or live).
    - A capture counts on the day it was recorded. A refund counts on the day its `refund.succeeded` event occurred.
    - Day boundaries are computed as `date::timestamp AT TIME ZONE tz`, which is correct across daylight-saving changes.
  - **`lowStock`** (`catalog:read`): the variants with the least available stock at the main location, with `variantId` for the restock action.
- **`src/server/reports/exports.ts`**
  - `createExportService({ pool, authorize, storageDir, ttlMs = 24h, maxRows = 50 000 })`:
    - **`request`** needs `exports:create` plus `orders:read` or `catalog:read` for the kind.
      - Kinds: `catalog`, and `orders` with strict `from`/`to` and an optional time zone, up to 366 days.
      - It counts the rows first; over the limit is 409 `EXPORT_TOO_LARGE`.
      - In one transaction it inserts an `export_jobs` row and enqueues `exports.generate` (dedupe `export:<id>`), and audits.
    - **`list`** returns your own jobs.
    - **`download`** works only for the requester, with both permissions re-checked:
      - not ready: 409 `EXPORT_NOT_READY`;
      - expired, or the file is gone: 410 `EXPORT_EXPIRED`;
      - every download is audited.
  - **`generateExport(pool, storageDir, id, { maxRows })`** (worker):
    1. It locks the job, writes the CSV with a BOM to `<storage>/private/exports/<id>.csv`, and records a private `exports` media asset; the job becomes `completed`.
    2. A permanent error ends the job as `failed`. Deadlocks, serialization failures and connection errors are retried.
  - **`expireExports`** (hourly sweep):
    1. It expires due jobs.
    2. For every expired job whose media is still `ready` (including one a crash left behind), in one transaction per file, it archives the media and deletes the file. A delete failure rolls back, so the next sweep retries.
  - **`csvCell`** quotes every cell. A leading `= + - @`, the full-width forms `＝＋－＠`, these after leading spaces or NBSP, and a leading tab, CR or LF all get a `'` prefix.
  - Order exports hold the order number, `placed_at`, the statuses, the payment mode, currency, total and item count: no customer data.
- **`src/server/settings/service.ts`**: `createSettingsService({ pool, authorize })`; everything needs `settings:write`, which requires fresh MFA.
  - **`get`** returns the typed DTO, never `legacy_settings`.
  - **`update`** takes `{ expectedVersion, storeName?, contactEmail?, supportPhone?, usdDisplayEnabled?, freeShippingThresholdMinor?, maintenanceMode?, seoTitle?, seoDescription?, activeTaxConfigurationId?, activeShippingPolicyId? }`.
    - `paymentMode` is not accepted.
    - Invalid combinations are 409 `INVALID_SETTINGS`: USD display without a rate, an unknown tax or shipping version, or a shipping policy with no rate bands.
  - **`setExchangeRate({ expectedVersion, kztPerUsd })`** accepts up to 12 integer digits and 8 decimals, and the rate must be above zero. Each edit is a new `exchange_rate_versions` row under a table lock, becomes the active rate, and is audited.
  - Every change checks the settings version and is audited under the fixed target id `00000000-0000-0000-0000-000000000001`.
- **`src/server/reports/runtime.ts`**: the handlers for reports, exports (including the CSV download response) and settings. PostgreSQL mode only.
- **Routes:**
  - `src/app/api/admin/reports/route.ts` (GET);
  - `src/app/api/admin/exports/route.ts` (GET, POST);
  - all through `handleAdminRequest`.
- **`src/lib/admin/inventory-client.ts`**: `createStockAdjuster` and `createPendingActions`.
  - A positive amount is posted as `receive`, a negative one as `adjust`, both to `/api/admin/inventory`.
  - A pending action keeps its key across network or 5xx retries. Success or a 4xx clears it.
- **UI:**
  - **`src/app/admin/_components/ReportsScreen.tsx`** (the PostgreSQL dashboard): totals by currency and environment, a by-day table, a low-stock list with Restock +10 (it shows "Retry restock" while a retry is pending) and a ± count correction, plus export requests and downloads.
  - **`src/app/admin/settings/_components/StoreSettingsScreen.tsx`**: the typed form and the rate editor.
- **Tests:**
  - `tests/integration/reports-settings.test.mjs` (9; it reuses the 16B commerce harness);
  - `tests/unit/inventory-client.test.mjs` (3);
  - additions to `tests/unit/sanitize.test.mjs` (CSV cells) and `tests/unit/content-route.test.mjs` (routes).

### Changed

- **`src/app/admin/page.tsx`** and **`src/app/admin/settings/page.tsx`**: PostgreSQL mode shows the new screens. Legacy mode is unchanged.
- **`src/app/api/admin/settings/route.ts`**: adds PUT.
- **`src/server/auth/admin-runtime.ts`**: adds the `reports` and `exports` resources. `settings` goes to the new service in PostgreSQL mode (it was 501 before).
- **`src/server/operations/registry.ts`**: adds `exports.generate`, and `exports.expire` every hour.
- **`src/app/admin/products/_components/ProductsScreen.tsx`**: the stock column shows units in PostgreSQL mode, or "Not tracked" (it said "Not configured" before; 11A M7).
- **`tests/unit/operations-route.test.mjs`**: the schedule list.

## Commands and results

All gates ran one at a time from PowerShell in the worktree. Free RAM was 104–418 MB.

| Gate | Result |
|---|---|
| RED: `reports-settings.test.mjs` | 5/5 failed: `ERR_MODULE_NOT_FOUND` for `src/server/reports/service.ts`. The unit test also failed: module missing. |
| First green | 5/5. Two harness slips were fixed first: a missing `import assert`, and a TypeScript parameter property that Node's type stripping rejects. One code fix: `audit_events.target_id` is a uuid. |
| RED: route/schedule tests | 2 failed: no routes, no `exports.expire` schedule. Green after wiring. |
| Mutation check | Removing the CSV formula prefix failed the export test (0/1). The source was restored byte-identical. |
| RED: review tests | 7 of 8 failed for the right reasons. The I2 test passed by accident: its date pair failed the span check. It was strengthened to `2026-02-31`→`2026-03-20`, then failed. |
| Final 18B tests | `reports-settings` 9/9, units 14/14 |
| `npm test` (per file, same as 16B) | legacy 21/21 · unit 183/183 · integration 342/342 (27 files) · boundaries pass. **546/546** |
| `npm run check` | **exit 0**: 0 errors, 23 warnings (pre-existing `<img>`), no tracing warnings. The build lists `/api/admin/exports` and `/api/admin/reports`. |
| Browser smoke | **Not run: 116–418 MB free** |

## Review

One read-only reviewer (code-reviewer) found no Critical issues. It confirmed:
- all SQL is parameterized;
- day boundaries are correct across daylight-saving changes;
- currencies are never added together;
- downloads are limited to the requester, with permissions re-checked;
- `expires_at` is never written;
- worker dedupe holds;
- `Content-Disposition` is safe;
- order exports carry no customer data;
- settings use compare-and-set and never return secrets.

Important findings, all fixed test-first:
- **I1:** the expiry sweep could leave a private file behind forever after a crash. Now each file is handled in one transaction and stuck rows are swept again.
- **I2:** impossible calendar dates were accepted.
- **I3:** a failed export stayed `pending`.
- **I4:** exports were silently truncated at 50,000 rows.
- **I5:** sandbox money was mixed into revenue.
- **I6:** a refund's day came from `updated_at`, which can still change; it now comes from the immutable event.
- **I7:** a shipping policy with no bands, and a missing export file, returned 503.
- **I8:** the UI restock made a new key per click, and there was no count correction.
- **I9:** order and catalog exports needed only `exports:create`.

The CSV formula pattern was also widened, from the review's minor list.

### Deferred minors

- **Fresh MFA:** list, download and the settings GET also need MFA from the last 15 minutes, so after 15 minutes the export panel says "need the export permission".
- **Exports:**
  - each request looks up the session twice;
  - downloads do not verify the file's checksum;
  - if the commit fails after the file is written, an orphan file is left behind (the same key is overwritten on retry);
  - export requests have no rate limit and no dedupe;
  - order `placed_at` is written in UTC while the filter uses the local zone;
  - there are no indexes for the summary windows, and the `pg_timezone_names` lookup is not cached.
- **Settings:**
  - the audit records field names only, not before/after values;
  - a rate edit enqueues no invalidation event (there is no cache yet);
  - after a 409 the settings screen keeps its stale version until reloaded.
- **Money display:** amounts use `Number`, so very large values lose precision.
- **ReportsScreen:**
  - a date change does not cancel the previous load;
  - a range over 92 days shows a generic error;
  - pending exports are not polled;
  - the restock button is shown to users without `inventory:write`.
- **Untested:**
  - another staff member downloading someone else's export (the code returns 404);
  - the 92/93-day bound;
  - a daylight-saving time zone.
- **Mixed currencies:** the schema forces KZT, so mixed-currency grouping is checked only through the shape of the result.

## Rulings

- **Revenue is reported per currency and per environment.** Sandbox money is never added to live money. "Captured" is counted on the day it was recorded (`created_at`), and refunds on the day their success event occurred.
- **Order exports exclude personal data.** Bulk personal-data export ("explicit export permission" in the matrix) is not built. If the owner needs it, it is a separate, explicitly permissioned kind.
- **Export limit:** 50,000 rows. Larger requests are refused up front with "narrow the date range", never truncated. The file is built in memory (bounded by the limit). A streaming writer is a Task 21A performance item if the limit grows.
- **`paymentMode` cannot be changed from settings** (D03). Real-provider activation is in the deferred backlog.
- **The 18A ruling I6 (homepage collection wiring) remains deferred.** It is not part of the 18B bullets. Any future homepage collection integration must add draft isolation for collections first; it is recorded in the remaining-task table.
- **Gate method:** with less than 1 GB free, `npm test` runs one process per test file (same as 16B and 18A).

## Exact next step

1. When the host has at least 1 GB free, run the browser smoke, which is still open for 16A, 16B, 18A and 18B:
   - `Remove-Item -Recurse -Force .next/dev`
   - `node --conditions=react-server tests/ui/cms-smoke.mjs`

   The admin dashboard and settings pages in PostgreSQL mode are new screens. The smoke does not visit them yet; consider adding steps.
2. **Task 21A: query, cache and rate tuning, and the end-to-end matrix** (it absorbs 22's qualification part). Read the Task 21 section of the plan and the deferred items marked for 21:
   - 12B: full-table metric scans;
   - 13B and 14B: rate limiting (webhooks, quotes);
   - 18A: wire the cache-invalidation consumer to any cache added;
   - 18B: indexes for the summary windows.

**STOP_AFTER is Task 22.** Task 21 is the last chained task; 23 and 24 are owner-run.
