# Task 24 preparation: owner inputs applied and launch rehearsed (2026-11-19)

**Status: ready to launch, waiting for owner items.** The owner's launch inputs ([decisions.md](../decisions.md#task-24-launch-inputs-owner-2026-11-19)) are built and rehearsed end to end on VPS staging. Production has not been created: there is still no production database, production `.env` or internet exposure. Remaining before the go:
- the domain;
- the payment instructions text;
- confirmation of the VAT rate;
- the explicit go.

## What was built (test-first)

| | Files | Tests |
|---|---|---|
| **Owner dispositions.** They are part of the checksummed archive. Exclude rules archive a record with no live target; accept rules resolve named blocker codes. Resolutions are persisted on `migration_issues` (`resolved` with rule, reason, approver and date) and compared on every replay. Excluded order totals balance the financial reconciliation. Changing a decision conflicts as `SOURCE_CHANGED` | `docs/backend/owner-dispositions.json`, `scripts/migration/{extract,validate,import,reconcile}.ts` | `tests/unit/owner-decisions.test.mjs` (6), `migration-import.test.mjs` (+1) |
| **Launch staff accounts:** one transaction with exactly one super_admin and catalog roles. Passwords are generated and written only to a new private 0600 file; a second run is refused. `auth:bootstrap` now shares the same code | `scripts/ops/staff-setup.ts`, `src/server/auth/bootstrap.ts` (`createInitialStaff`), `deploy/staff-accounts.json`, `npm run ops:staff-setup` | `tests/integration/staff-setup.test.mjs` (2) |
| **Scheduled jobs:** a daily base backup, media backup and prune, plus a health check every 5 minutes. Each job is logged and locked, and failures alert via Telegram once configured (logged only while the token is empty) | `deploy/ops/scheduled.sh`, `deploy/ops/notify.sh`, `deploy/cron/grmn.cron`, `deploy/env.example` | Exercised on staging |
| **Media backup works with the app stopped** (found in the rehearsal: it failed before launch) | `deploy/backup/media-backup.sh` | Exercised on staging |
| **Store configuration:** VAT-inclusive prices (16%, to confirm); 1,500 KZT delivery below 30,000 KZT and free from 30,000 | `deploy/store-config.json` | Exercised on staging |
| **Verification:** staff create a product through the admin (the catalog starts empty), and the delivery fee is checked against the rule | `scripts/ops/verify-cutover.mjs` `--create-product`, `--delivery-rule` | Exercised on staging |

## Launch rehearsal on staging (images `grmn:26b10ee`, fresh database)

| Step | Result |
|---|---|
| Migrations 0000–0017, first backup through `scheduled.sh backup` | First run: the base backup succeeded, the media backup failed (app not running) and **the failure alert fired** (logged; Telegram empty). After the media fix: base and media backups succeed, exit 0 |
| Dry-run export | **Exit 0, ready.** Imported: 4 banners, 12 blogs, the homepage. Archived only: 22 products, 12 orders, 6 customers, 1 admin, 6 activity records, 4 promo codes, the settings and the static definitions |
| Import + replay | **`completed`, 0 mismatches, 0 open blockers**, 5.0 s; the replay is a no-op. Live rows: products 0, orders 0, customers 0, users 0, promotions 0, pages 17. All 258 records archived; **all 131 former blockers resolved** by the owner rules. Money: source 1,409,990 = excluded 1,409,990 (12 orders) |
| Store setup, staff setup | Store created closed. The 4 accounts were created (32-character passwords, private file); a second run was refused. All 4 sign in. The owner enrolled TOTP through the HTTP flow |
| Verification while closed | Product creation first exposed that the admin DTO has no variant id; the verifier now reads it from the storefront page. Then **32/32**: closed 503, staff MFA and bypass, publishing the homepage, **staff created a product through the admin**, public product page and sitemap, +5 stock, **delivery 1,500 KZT on 25,000 KZT of goods and free on 50,000**, guest manual checkout, receipt, hold, payment confirmed, shipped, a second order cancelled with its stock released. Included VAT on the 25,000 KZT order: 3,448.28 KZT (16/116; delivery carries no VAT) |
| Reopen, health | 15/15 including reopening. `scheduled.sh health` exit 0: no stuck jobs, WAL archived, backup 3.5 min old, invariants 12/12 |
| Restore the new backup to `latest` | 4 s. Before a WAL switch, the import was not yet archived (the ≤ 5 min RPO, as designed). After `pg_switch_wal()`, everything was restored: 2 orders, 2 products, 4 staff, 17 pages, the store open |

Receipts are in `/home/nick/grmn-staging/receipts/t24-*` (private, including the staging staff credentials). The Task 23 backups moved to `/home/nick/grmn-staging/backup-task23`. Staging is stopped.

## Rulings

- **Legacy activity log excluded.** It records actions of the removed admin on removed records; the archive keeps it.
- **Exactly 30,000 KZT ships free:** goods ≥ threshold. Goods are after discounts.
- **Delivery carries no VAT line.** VAT is included in goods only; the existing policy is kept.
- **Staff emails are `<role>@<store domain>`,** filled in at launch. The owner can hand them out as they are.

## Open (owner)

- The domain (DNS to the VPS, TLS, staff email domain).
- The payment instructions text (placeholder configured).
- The VAT rate (16% configured).
- The store name ("GRMN" configured).
- The go.
- Later: the Telegram bot and group, an off-site backup target, the SMS provider.
