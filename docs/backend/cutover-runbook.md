# Task 23 runbook: cutover and recovery

**Status: rehearsed on VPS staging, 2026-11-18. Both rehearsals passed; results are in [cutover-rehearsal-report.md](cutover-rehearsal-report.md).** The exact commands as rehearsed are in Part 10. This draft is the plan for Task 23 (plan Section 10 and Task 23 checklist). It is owner-run: an operator follows it on **staging**, times every step, and records the results in the timing sheet at the end. Task 24 (the real cutover) repeats the same steps on production only after this rehearsal passes and the owner gives an explicit release instruction.

Fields marked **⟨OWNER⟩** must be filled in before the rehearsal. Never put passwords, tokens or connection strings in this file: write *where* a secret lives, not its value.

## Part 1. Names, places and objectives (owner fills in)

| Item | Value |
|---|---|
| Release operator (runs the commands) | ⟨OWNER⟩ |
| Incident owner (decides stop or rollback) | ⟨OWNER⟩ |
| Second person present during the window | ⟨OWNER⟩ |
| Where the current live site runs, and how its writes reach `src/lib/cms/data.json` | ⟨OWNER⟩. AGENTS.md says Vercel; the legacy store writes that file under the app directory, so confirm which host actually holds the live copy |
| Staging host | ⟨OWNER⟩. The VPS is acceptable if staging is isolated from production (its own database volume, its own secrets, loopback or VPN access only) |
| Production host | ⟨OWNER⟩ (D05: VPS) |
| Off-host backup location (database base backups, WAL archive, media) | ⟨OWNER⟩. Must be outside the VPS. A single VPS is one failure domain |
| Who can read backups, and how access is recovered if the operator is unavailable | ⟨OWNER⟩ |
| Recovery objectives (O09) | Proposed: **RPO ≤ 15 min, RTO ≤ 2 h**, including media. ⟨OWNER⟩ confirm or change |
| Planned maintenance window (customers see a maintenance page) | ⟨OWNER⟩, for example a low-traffic night; length from the rehearsal timing |
| Domain, TLS certificate source, and DNS owner | ⟨OWNER⟩ |
| First staff account (bootstrap) and who holds its MFA backup codes | ⟨OWNER⟩ |
| Customer communication for the window (site banner, social, phone) | ⟨OWNER⟩ |

## Part 2. Prerequisites (built 2026-11-18, used in the rehearsal)

| # | Prerequisite | Where |
|---|---|---|
| G1 | **Write freeze.** `MAINTENANCE_MODE=1`, or the admin maintenance setting, answers 503 for pages and every `/api` route. Staff sign-in, admin pages and reads, payment webhooks and the bypass stay open. Staff with `settings:write` (fresh MFA) take a signed 2-hour bypass to verify the closed store. The legacy site has no bypass | `src/server/operations/maintenance*.ts`, `src/proxy.ts`, `POST /api/admin/maintenance-bypass` |
| G2 | **Guarded persistent-target import.** It checks the database name, a full migration and the absence of live orders; replay is a no-op | `npm run db:import:target` (`scripts/migration/import-target.ts`) |
| G3 | **Backups and PITR:** a gzip WAL archive (`archive_timeout` 300 s), verified base backups, media archives, pruning, an off-site copy and PITR into an isolated container | `deploy/db/archive-wal.sh`, `deploy/backup/*.sh` |
| G4 | **Production deploy files:** app, worker, PostgreSQL, nginx (client IP from the TCP peer), ops tools, separate migrate and app roles, the ops image | `deploy/compose.yml`, `deploy/db/10-roles.sh`, `deploy/nginx/`, `deploy/env.example`, Dockerfile `ops` stage |
| G5 | **Health check:** dead or stale jobs, expired leases, overdue holds, WAL archiver failures or staleness, base-backup age, invariants; exit 1 on an alert | `npm run ops:health` (`scripts/ops/health-check.mjs`) |
| G6 | **Expiry sweep indexes** (12.8 s worst-case plan becomes 95 ms) | migration 0017 |
| G7 | **First store setup** (settings, tax, shipping; store left closed); found missing during the rehearsal | `npm run ops:store-setup` (`scripts/ops/store-setup.ts`) |
| — | **Cutover verification:** closed-store checks, staff MFA and bypass, pages, purchase to paid and shipped, cancellation releasing stock, publishing reviewed pages, reopening | `scripts/ops/verify-cutover.mjs` |

Owner work that also blocks the rehearsal:

- **O1. Quarantine dispositions.** The Task 07 rehearsal left **70 quarantined records** with **133 open blockers**, among them:
  - original-price precision (16 fields);
  - unparsed legacy dates (12);
  - missing assets (4);
  - product and accessory relations;
  - promo money and scope;
  - staff bootstrap.

  Plan rule: *production import has no unexplained quarantine*. Each blocker needs an owner decision (fix the source, accept it as an archive-only record, or exclude it with a written reason). Nothing is approved automatically. The report is in [migration-reconciliation-report.md](migration-reconciliation-report.md).
- **O2. Confirm the O07 manual-payment defaults:** the methods, the roles, and the 48-hour hold.
- **O3. Payment providers** are not connected (D03). Rehearsal steps about webhook intake and provider sandbox replay are **not applicable**: record "N/A, no provider (D03)". They return when Kaspi or Freedom is added.

## Part 3. Facts the procedure relies on

- **Source of truth today:** the legacy JSON store (`src/lib/cms/data.json`, plus static definitions in code) and the media files in `public/`.
- **Mode switch:** `CMS_BACKEND=legacy|postgres`. In `postgres` mode, the catalog, cart, checkout, accounts and admin use PostgreSQL.
- **One writer.** There are never dual writes. The legacy store stays frozen once PostgreSQL takes writes, and **after the first PostgreSQL business write, PostgreSQL is authoritative** (see Part 8).
- **Imported history is not invented.** Legacy orders import as `legacy_incomplete` with `legacy_unknown` payment mode, and contacts import as unclaimed provisional profiles. No captures, shipments, stock movements, logins or consent are created.
- **Stock starts at zero** for imported products, because there is no stock ledger in the legacy source. Opening stock is a deliberate staff step: receipts in admin inventory, each one a ledger movement. Plan it into the window or open with "unavailable" products.
- **Migrations:** apply every migration **0000–0017** on an empty target with `npm run db:migrate` and `DATABASE_MIGRATION_URL` set to the migration role. 0011 and 0015 build indexes and a backfill inside the migration transaction: run them before the import, never on a live loaded database during traffic.
- **Required production environment** (names only):
  - `NODE_ENV=production`, `CMS_BACKEND=postgres`;
  - `DATABASE_URL` (runtime role, pooled) and `DATABASE_MIGRATION_URL` (DDL role, used only by the migration job);
  - `AUTH_ENABLED=1`, `AUTH_SECRET` (64 hex characters), `AUTH_BASE_URL=https://⟨domain⟩`, `AUTH_TRUSTED_IP_HEADER=x-grmn-client-ip`;
  - `MEDIA_STORAGE_DIR` (persistent volume);
  - optionally `DATABASE_POOL_MAX`, `CATALOG_LISTING_CONCURRENCY`, `CATALOG_LISTING_WAIT_MS`.
  - `AUTH_BOOTSTRAP_ENABLED=1` only for the single bootstrap step, then removed.
- **Capacity measured on this VPS (21B follow-up):** 25 rps of browsing is clean, and checkout 20/s gives p95 230 ms. The forecast traffic (D10) is far below this.

## Part 4. Rehearsal A: cutover on staging (23A)

Use a copy of the real data on staging, never the live site. Start a stopwatch at T0 and record each step's duration and result in the timing sheet. **Stop conditions** apply at every step: any unexpected error, mismatch or quarantine you can't explain → stop, record it, and do not improvise a fix during the window.

### A0. The day before

1. **Release artifact.**
   - Check out the exact commit to release and record its hash.
   - Build `docker build --target runner -t grmn:⟨commit⟩ .` and record the image digest.
   - Keep the previous release image too: it is the rollback artifact.
2. **Gates** on that commit:
   - `npm ci`, `npm run test:unit`, `npm run test:legacy`, `npm run test:integration` and `npm run check:boundaries`;
   - `npm run lint`, `npm run typecheck` and `npm run build`;
   - the browser smoke (`npm run test:cms-ui`).

   All must pass. Record the counts.
3. **Empty staging database** with separate runtime and migration roles. Apply 0000–0017: `DATABASE_MIGRATION_URL=⟨from secret store⟩ npm run db:migrate`. Record the duration.
4. **Backups (G3) already running** on staging, with the first base backup taken and WAL archiving confirmed (`deploy/backup/base-backup.sh`).
5. **Dry run of the export** on a copy of the current source: `npm run db:import:dry-run -- --output temp/⟨new-dir⟩`.
   - Exit 0 means no quarantine. 2 means quarantine remains, which must match the owner's O1 dispositions exactly. 1 is a failure.
   - Keep the private output out of Git. It contains personal data.

### A1. Freeze (window starts)

1. Post the customer notice. Turn on the maintenance page on the **legacy** site, or at its proxy, so that no customer or admin can write. (G1: `MAINTENANCE_MODE=1`)
2. Confirm the freeze: an admin save and a storefront checkout must both be refused. Note the time: **this is the freeze point** (the RPO for the old system is zero from here).
3. Stop any legacy cron or import job.

### A2. Final snapshot

1. Export the frozen source to a **new** directory: `npm run db:import:dry-run -- --output temp/⟨final-dir⟩`.
2. Archive it: `npm run db:import:dry-run -- --archive temp/⟨final-dir⟩`. Record the artifact checksum and the source inventory checksum.
3. Copy the media (`public/images`, plus any uploaded media) to the new media volume and record a checksum list. Compare the counts with the dry-run asset inventory.

### A3. Import

1. Import the archive into the staging database through the guarded persistent-target command. (`db:import:target`, Part 10)
2. The command must report:
   - every source record accounted for;
   - the quarantine set equal to the O1 dispositions;
   - **zero** financial or mapping mismatches;
   - the order-number sequence advanced above every imported number.

   Record its reconciliation checksum.
3. Replay the same import once more. It must be a no-op (idempotency).
4. **Store setup (G7):** `ops:store-setup <config.json>`, using the owner's reviewed tax, shipping and payment-instruction values. The store is created closed.
5. Bootstrap the first staff account:
   - `AUTH_BOOTSTRAP_ENABLED=1 npm run auth:bootstrap < ⟨protected JSON file⟩`, run once;
   - remove the variable;
   - enrol MFA immediately and store the backup codes as Part 1 says.
6. **Review and publish imported content.** Imports are drafts by design, and the homepage returns 500 until it is published. Staff publish the reviewed homepage (and any banners) in admin, or with `verify-cutover.mjs --publish <pageId>:<pageVersion>`.
7. Opening stock: imported products have none. Enter it as inventory receipts in admin, or open with "unavailable" products.
8. Optional, if opening with stock: enter opening stock as inventory receipts in admin. Then run `scripts/perf/invariants.sql` against the database; all checks must be `t`.

### A4. Switch

1. Start the new stack (G4) on staging with `CMS_BACKEND=postgres`: the app, the **worker** (`npm run worker`, or its container) and the proxy. Keep the storefront in maintenance (G1) with the staff bypass.
2. Check:
   - the worker log shows job leasing;
   - the admin Operations page shows no dead jobs;
   - pool and database health are normal.

### A5. Verification while still closed

Run these as staff through the bypass:

- **Public pages:**
  - the homepage, a category, every sort, a filter, search, and three product pages;
  - an old product URL and each active redirect (301/308 to the right target);
  - `sitemap.xml` and `robots.txt`;
  - canonical and SEO tags on one product (Section 10 "route/SEO smoke").
- **Images:** product galleries load and none are missing. Compare against the A2 asset list.
- **Checkout (O07, manual payment):**
  1. A test purchase as a guest and as a signed-in customer ends on the receipt showing "Awaiting payment", the KZT total and the instructions.
  2. A staff member confirms it from the admin order page (method, reference, amount) and the order becomes **paid**.
  3. Ship it.
  4. Cancel a second unpaid test order and see its stock released.
  5. Record the test order numbers, so that they can be cancelled or kept as marked test orders.
- **Accounts:** an imported provisional contact can't log in without verification (no inferred login). Staff roles and MFA work.
- **Reports:**
  - the dashboard totals for the imported history match the source totals in the reconciliation report;
  - the legacy orders show as `legacy_incomplete`;
  - nothing shows as paid without a capture.
- **Invariants:** `scripts/perf/invariants.sql` returns `t` on every row.
- **Rehearsal only:** webhook intake and replay is N/A (no provider, D03).

### A6. Reopen

1. Turn off the maintenance page. Watch it for the agreed observation window (⟨OWNER⟩, for example 60 minutes) against the rollback triggers in Part 8.
2. Record T-end. The window length is T-end minus T0. If it is longer than the planned window, fix the slowest step before Task 24.

## Part 5. Rehearsal B: restore drill (23B)

The goal is to prove the RPO and RTO with a timed restore onto **separate** infrastructure. Restoring never touches the source environment.

1. **Pick a target time** a few minutes after a known staging write (for example a test order created at a recorded time). That write is the RPO probe.
2. **Start the clock (RTO).** On an isolated host or network, restore the latest base backup plus the WAL to the target time (G3 tool), and restore media from its backup to the same point.
3. Start the release image against the restored database with `CMS_BACKEND=postgres`. Leave the worker stopped until the checks pass.
4. **Verify:**
   - the probe order exists, so the data loss is at most the time between the probe and the target;
   - `invariants.sql` returns all `t`;
   - the order and payment totals match the source environment up to the target time;
   - a sample of product images loads.
5. **Reconcile external facts.** No provider exists (D03), so record: "manual payments only; staff payment references re-checked against the bank/Kaspi statements for the restored window". Restoring a database never undoes money actually received or paid out.
6. **Stop the clock.** The measured RTO and RPO must meet Part 1's objectives; otherwise change the backup schedule or tooling and repeat.
7. **Test an application rollback.** Deploy the *previous* release image against the same restored PostgreSQL schema, and check that it still reads and writes. Only additive migrations make this possible, which is the plan's expand-then-contract rule.
8. Destroy the restore environment once results are recorded. It contains personal data.

## Part 6. Sign-off checklist (all required before Task 24)

- [ ] Every source record and field accounted for. The quarantine set equals the owner-approved O1 dispositions, with no unexplained item.
- [ ] Financial totals reconcile exactly: normalized plus known quarantined equals source. No unvalued order.
- [ ] Rehearsal A completed within the planned window; every step timed; commands worked as written without guessing.
- [ ] Rehearsal B met the RPO and RTO, including media; the application rollback against the restored schema works.
- [ ] Backups run continuously and alert on failure (G3, G5); retention is agreed (O09).
- [ ] Production prerequisites are confirmed:
  - [ ] TLS and DNS are set up.
  - [ ] The proxy headers are correct (G4).
  - [ ] Secrets are in place, with separate runtime and migration roles.
  - [ ] Staff have MFA.
  - [ ] The O07 defaults are confirmed (O2).
- [ ] No open money or access issue (plan Task 23 acceptance).
- [ ] Owner gives the explicit production release instruction (Task 24 dependency).

## Part 7. Stop conditions (during any window)

Stop and do **not** reopen if any of these happen:
- an import mismatch, a new quarantine item, or a checksum that differs from A2;
- a migration error;
- invariants not all `t`;
- the test purchase can't reach "paid";
- images missing;
- the worker not leasing jobs;
- an unexpected 5xx on a verification step.

Record the time and the evidence. Then decide between rollback (Part 8) and a fix in a **later** window. Never patch business data by hand during the window.

## Part 8. Rollback rules (plan Section 10)

- **Before any new PostgreSQL business write** (still in maintenance, only test orders):
  1. Stop the new stack.
  2. Point traffic back to the legacy site.
  3. Lift the legacy freeze after checking it serves correctly.

  The legacy store is unchanged since the freeze, so nothing is lost. Record the test orders created in PostgreSQL. They must not be imported anywhere.
- **After the first real PostgreSQL write** (a customer order, a staff edit, or money received):
  - PostgreSQL is **authoritative**.
  - Do not switch back to JSON and do not discard orders.
  - Roll back only to a compatible previous release image that reads and writes the same schema, or fix forward.
- **Rollback triggers** during observation:
  - unauthorized access;
  - a total or currency mismatch;
  - negative stock;
  - a duplicate order or payment;
  - sustained unexpected 5xx above 1%;
  - an unrecoverable job backlog.

  Close checkout first (maintenance on), then investigate.

## Part 9. Timing sheet (fill in during the rehearsal)

| Step | Start | End | Duration | Result / evidence (checksums, counts, order numbers) | Operator |
|---|---|---|---|---|---|
| A0 gates | | | | | |
| A0 migrations 0000–0017 | | | | | |
| A1 freeze confirmed (freeze point) | | | | | |
| A2 final export + archive | | | | | |
| A2 media copy | | | | | |
| A3 import + reconciliation | | | | | |
| A3 replay (no-op) | | | | | |
| A3 bootstrap + MFA | | | | | |
| A4 stack up, worker leasing | | | | | |
| A5 verification | | | | | |
| A6 reopen | | | | | |
| **Window total** | | | | | |
| B restore to target time (RTO) | | | | | |
| B probe check (RPO) | | | | | |
| B app rollback check | | | | | |

## Part 10. Commands as rehearsed (staging, 2026-11-18)

`DC="docker compose -p grmn-<env> --env-file <private env file> -f deploy/compose.yml"`. The env file follows `deploy/env.example` (chmod 600, outside the repository). `BACKUP_DIR` must be writable by uid 999 (PostgreSQL). `OPS_TEMP_DIR` belongs to uid 1000 (the ops image user): copy files in through a container, not from the host.

```bash
# A0 images and database
docker build --target runner -t grmn:$COMMIT . && docker build --target ops -t grmn-ops:$COMMIT .
$DC up -d db
$DC run --rm -T ops node --conditions=react-server node_modules/drizzle-kit/bin.cjs migrate
deploy/backup/base-backup.sh grmn-<env> <env file>
npm run db:import:dry-run -- --output temp/<dry-run>                 # exit 0 ready, 2 quarantine, 1 error
# A1 freeze the legacy site: restart it with MAINTENANCE_MODE=1, then confirm a write is refused (503)
# A2 final snapshot
npm run db:import:dry-run -- --output temp/<final> && npm run db:import:dry-run -- --archive temp/<final>
docker run --rm -v $PWD/temp/<final>:/src:ro -v $OPS_TEMP_DIR:/t alpine sh -c 'cp -a /src /t/<final> && chown -R 1000:1000 /t/<final>'
# A3 import, replay, bootstrap, store setup
$DC run --rm -T -e IMPORT_DATABASE_URL=postgresql://grmn_migrate:<pw>@db:5432/grmn ops \
  node --conditions=react-server scripts/migration/import-target.ts --archive temp/<final> --output temp/<import> --confirm-database grmn
#   (run again with a new --output: must be a no-op)
<protected JSON> | $DC run --rm -T -e AUTH_BOOTSTRAP_ENABLED=1 ops node --conditions=react-server scripts/auth/bootstrap.mjs
$DC run --rm -T ops node --conditions=react-server scripts/ops/store-setup.ts temp/store-config.json
# A4 switch (the store stays closed)
$DC up -d app worker proxy
# A5 verification (from a host that resolves the domain to the proxy)
node scripts/ops/verify-cutover.mjs --base https://<domain> --credentials <operator.json> \
  --products <key,key> --variant <uuid> --publish <homepage pageId>:<version> --out <receipt>
$DC exec -T db psql -U grmn_owner -d grmn < scripts/perf/invariants.sql      # every row t
# A6 reopen
node scripts/ops/verify-cutover.mjs --base https://<domain> --credentials <operator.json> --open
$DC run --rm -T ops node --conditions=react-server scripts/ops/health-check.mjs --backup-dir /backup
# B restore drill (isolated; never the source)
deploy/backup/restore-pitr.sh <BACKUP_DIR> <base stamp> "<YYYY-MM-DD HH:MM:SS+00>"|latest grmn-restore
docker exec -i grmn-restore-db psql -U grmn_owner -d grmn < scripts/perf/invariants.sql
# then remove grmn-restore-db, its volume grmn-restore-data and its network grmn-restore-net
```

A PITR target must be followed by a commit in the archive; otherwise use `latest` (see the script header).

## Part 11. Task 24 production launch (owner inputs of 2026-11-19)

The owner's inputs are recorded in [decisions.md](decisions.md#task-24-launch-inputs-owner-2026-11-19). They change the rehearsed procedure as follows:
- **There is no live legacy site, so there is no freeze (A1).** The source is the repository copy, and the export is taken from the release commit.
- **The import must finish with exit 0 (`completed`, 0 open blockers).** The owner dispositions (`docs/backend/owner-dispositions.json`) are part of the checksummed archive:
  - products, orders, users, promo codes, activity and settings are archived only;
  - banners, blogs and the homepage import as drafts.
- **Staff are created with `ops:staff-setup`, not `auth:bootstrap`:** 4 accounts, with passwords written to a new private file. Each person enrolls MFA at first sign-in.
- **The catalog starts empty.** Before reopening, staff create at least the first real products and receive their stock. Staff also set the two missing banner images and the KZT announcement text, then publish banners, blogs and the homepage.

Before the window, the owner gives:
- the domain, with DNS pointing at the VPS (a TLS certificate is issued for it);
- the payment instructions text and the VAT rate confirmation;
- the explicit go.

```bash
# L0 (day before) release images, private env file (deploy/env.example; PROXY_BIND public, Telegram empty), TLS in TLS_DIR
docker build --target runner -t grmn:$COMMIT . && docker build --target ops -t grmn-ops:$COMMIT .
$DC up -d db && $DC run --rm -T ops node --conditions=react-server node_modules/drizzle-kit/bin.cjs migrate
deploy/ops/scheduled.sh backup grmn <env file>                       # first base backup through the cron wrapper
# L1 export and import (must print status "completed", exit 0)
npm run db:import:dry-run -- --output temp/<final>                   # exit 0 with the owner dispositions
docker run --rm -v $PWD/temp/<final>:/src:ro -v $OPS_TEMP_DIR:/t alpine sh -c 'cp -a /src /t/<final> && chown -R 1000:1000 /t/<final>'
$DC run --rm -T -e IMPORT_DATABASE_URL=postgresql://grmn_migrate:<pw>@db:5432/grmn ops \
  node --conditions=react-server scripts/migration/import-target.ts --archive temp/<final> --output temp/<import> --confirm-database grmn
# L2 store and staff (store stays closed)
cp deploy/store-config.json deploy/staff-accounts.json $OPS_TEMP_DIR/   # set emailDomain first; copy in through a container as above
$DC run --rm -T ops node --conditions=react-server scripts/ops/store-setup.ts temp/store-config.json
$DC run --rm -T ops node --conditions=react-server scripts/ops/staff-setup.ts temp/staff-accounts.json --output temp/staff-credentials.json
#   move temp/staff-credentials.json to the owner privately, then delete it from the server
# L3 app up (closed), staff work through the bypass: products, stock, banners, publishing
$DC up -d app worker proxy
node scripts/ops/verify-cutover.mjs --base https://<domain> --credentials <operator.json> --delivery-rule 150000:3000000 \
  --variant <first real variant> --publish <homepage pageId>:<version> --out <receipt>
#   the purchase checks place two test orders (one paid and shipped, one cancelled); omit --variant to skip them
# L4 reopen, schedule, watch
node scripts/ops/verify-cutover.mjs --base https://<domain> --credentials <operator.json> --open
crontab deploy/cron/grmn.cron                                          # daily backup 21:30 UTC, health every 5 min
```

## Related documents

- [migration-runbook.md](migration-runbook.md): extraction, dry run and the disposable rehearsal (Tasks 06–07).
- [migration-reconciliation-report.md](migration-reconciliation-report.md): the current quarantine and blockers.
- [decisions.md](decisions.md): D03, D05, O07, O09.
- [performance-report.md](performance-report.md): VPS capacity.
- Plan Sections 10 and 11, and Tasks 23–24.
