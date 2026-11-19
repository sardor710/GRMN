# Task 23 handoff: cutover and recovery rehearsal

**Status: rehearsed on VPS staging, 2026-11-18; 23A and 23B passed.** The owner asked for the whole task, with the operator choices made for them; those choices are listed in the [report](../cutover-rehearsal-report.md#setup-operator-choices-made-for-the-rehearsal). No production deployment, real import, production database, production `.env` or internet exposure was created. Staging listens on 127.0.0.1 only.

## What was built (test-first where it is code)

| | Files | Tests |
|---|---|---|
| G1 write freeze and staff bypass | `src/server/operations/maintenance.ts`, `maintenance-runtime.ts`, `src/proxy.ts` (it now also gates `/api`), `src/app/api/admin/maintenance-bypass/route.ts` | `tests/unit/maintenance.test.mjs` (7). The proxy test (task09) and the admin route-binding test (auth-entrypoints) were updated |
| G2 guarded target import | `scripts/migration/import-target.ts`, `npm run db:import:target` | `tests/integration/import-target.test.mjs` (4) |
| G3 backups and PITR | `deploy/db/archive-wal.sh`, `deploy/backup/{base-backup,media-backup,prune,offsite,restore-pitr}.sh` | Exercised in 23B (PITR exact, idle target, latest, prune, media checksums, 1M-order timing) |
| G4 deploy | `deploy/compose.yml`, `deploy/db/10-roles.sh`, `deploy/nginx/default.conf.template`, `deploy/env.example`, Dockerfile `ops` stage, `.dockerignore` | Exercised in 23A |
| G5 health check | `scripts/ops/health.ts`, `health-check.mjs`, `npm run ops:health` | `tests/unit/health-check.test.mjs` (5) |
| G6 expiry sweep indexes | migration `0017_expiry-sweep-index.sql` | Measured on the 1M-order database: forced worst-case plan 12.8 s becomes 95 ms; planner's choice 67 ms |
| G7 store setup | `scripts/ops/store-setup.ts`, `npm run ops:store-setup` | `tests/integration/store-setup.test.mjs` (2) |
| Verification | `scripts/ops/verify-cutover.mjs` (closed-store checks, MFA, bypass, pages, purchase to paid and shipped, cancellation, `--publish`, `--open`) | Run against staging: 32/32, then 21/21 on reopening |

## Rulings

- **Maintenance defaults to on** for a new settings row. That is kept: a fresh production database starts closed. Tests and seeds that need an open store set `maintenance_mode=false` explicitly (the browser smoke now does).
- **The freeze lives in the proxy.** Every business write goes through `/api`; there are no server actions. Admin GET and HEAD stay open so staff can sign in and take the bypass. **Changed 2026-11-19 (owner):** the whole admin API, writes included, stays open during maintenance so staff can prepare the closed store; each route enforces staff permissions, and customers stay frozen. Payment webhooks stay open (plan step 9). The legacy site has no bypass.
- **The flag is cached for 5 s per process**, and a failed read counts as "open". When the database is down, requests already answer 503 anyway.
- **Imported content stays draft until staff publish it.** The homepage answers 500 until then. This is a runbook step, not a code change.
- **The import runs as the migration role.** The app role has data access only: no TRUNCATE, no CREATE.

## Gates

Unit 214, legacy 73/73, integration **377/377**, boundaries, lint 0 errors, typecheck, build and the browser smoke. All were run after the final code change.

## State left on the VPS

- **Staging stack** `grmn-staging`: stopped, volumes kept.
- **Backups** in `/home/nick/grmn-staging/backup`.
- **Private receipts and the synthetic operator's credentials** in `/home/nick/grmn-staging/receipts` (chmod 700; not in Git).
- **Previous-release worktree** `/home/nick/grmn-prev`: removed after the rollback test.

## Open (owner)

See the report's "Task 24 gate":
- the quarantine dispositions;
- an off-host backup target, schedules and alerts;
- production values;
- the people;
- the live legacy host.
