# Local backend development

Requires Node 24+ and `npm ci`. Existing frontend commands still work without database credentials. The new auth route is disabled by default; existing commerce/CMS routes still use their prior backend. No migration runs in install/build/start. Use the project's current lockfile; no real source data is seeded into the test DB.

## One-command local stack (persistent PostgreSQL, no Docker)

```powershell
npm run dev:stack                 # cluster → migrations → seed → data.json import → next dev on :3000
npm run dev:stack -- --check      # same bootstrap, Next on a free port, HTTP checks, pass/fail table, shutdown
npm run dev:stack -- --reimport   # re-sync every data.json product even if unchanged
npm run dev:db -- start|stop|status|url
npm run dev:seed                  # store settings, tax, shipping, stock location (idempotent)
npm run dev:import [-- --reimport]
npm run dev:admin                 # first owner account (or lists existing staff)
npm run dev:catalog-smoke -- --base http://localhost:3000   # admin catalog API smoke against a running dev:stack
npm run perf:admin-list           # admin list benchmark on a disposable DB (1,000 products / 5,000 SKUs)
```

`dev:catalog-smoke` drives `/api/admin/catalog/*` over real HTTP as a staff session. Staff sign-in needs TOTP, so it signs a session for a dedicated dev-only account (`catalog-smoke@example.invalid`, role `product_manager`) directly in `storage/devdb`. It creates, links, restocks and then archives one synthetic product. At the end it removes that account's role and sessions, so `npm run dev:admin` sees the database as it was. It refuses `NODE_ENV=production` and needs the roles that `dev:admin` (or any earlier bootstrap) created.

- **Where data lives:** one PostgreSQL 18.6 cluster (the `embedded-postgres` development binaries) under `storage/devdb/` (gitignored): `data/` (cluster), `dev-secrets.json` (random DB password and a 64-hex `AUTH_SECRET`, created once), `import-state.json` (data.json hashes), `postgres.log`, `next-check.log`. It listens on `127.0.0.1:55433` (`DEV_DB_PORT` overrides). Data survives restarts; no script deletes it. `dev:stack` stops PostgreSQL when Next exits (Ctrl+C) if it started it; `dev:db -- start` leaves it running until `dev:db -- stop`.
- **Next environment:** `dev:stack` runs `next dev` with `CMS_BACKEND=postgres`, `AUTH_ENABLED=1`, `DATABASE_URL`, `DATABASE_POOL_MAX=5`, `AUTH_SECRET`, `AUTH_BASE_URL=http://localhost:3000`, `AUTH_DEV_OTP_CONSOLE=1`, `DEMO_PURCHASES=1`. `.env.local` is loaded and wins, except `CMS_BACKEND`, `AUTH_ENABLED`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `AUTH_SECRET` and `AUTH_BASE_URL`, which always come from the dev stack. Variable names: [dev-stack-env.md](dev-stack-env.md).
- **Seed (dev placeholders, change them in the admin):** `main` stock location; tax `inclusive`, 16% VAT (1600 bps), KZ only, so totals equal the catalog's VAT-inclusive prices; one shipping policy with a KZ zone and a flat `standard` band of **2 000 KZT**, no free-shipping threshold; store settings with demo payment mode. Re-runs only fill missing pieces and never replace an active policy.
- **Import:** on the first run the legacy importer (`importSnapshot`, namespace `garmin-dev-v1`) imports base records (contacts, homepage/banner drafts, audit history, the 3 products it accepts). Its strict reconciliation rejects a changed source (`SOURCE_CHANGED`) and quarantines most current products (4-decimal compare-at prices, unresolved accessory references), so it is never re-run. Then every data.json product is upserted by public key (the CMS id) and `src/server/catalog/variant-sync.ts` writes options, variants, KZT prices (major units × 100, float artifacts rounded to whole tiyn with a warning), media and stock. Later runs re-sync only products whose data.json record changed; products removed from data.json are archived. Data.json is the dev source of truth: a changed record overwrites DB edits of that product.
- **Opening stock:** written through the inventory ledger (`setStockFromSource`): an `opening` movement per variant on first import (simple products: `product.stock`), `adjust` movements for later changes; a zero balance row for zero stock.
- **Media:** images found under `public/` (or `UPLOAD_DIR`, default `storage/uploads`) become `ready` public `media_assets` (SHA-256, size, MIME) linked via `product_media` (variant galleries from `imageIds`, the rest at product level). Missing files are skipped. The PostgreSQL catalog currently serves only `/images/…` URLs, so `/uploads/…` galleries do not display yet.
- **First admin login:** set `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` (16–128 characters) in `.env.local`, or run `npm run dev:admin` in a terminal to be prompted. It uses the `auth:bootstrap` code path (super_admin) and refuses `NODE_ENV=production`. Sign in at `/admin/login`; the first sign-in requires enrolling TOTP MFA (keep the backup codes). MFA is not disabled for development.
- **Customer phone sign-in:** no SMS provider exists; with `AUTH_DEV_OTP_CONSOLE=1` (set by `dev:stack`) the code prints in the Next console as `[dev-otp] <phone> <code>`. It is refused when `NODE_ENV=production`.
- **Deliberate reset:** `npm run dev:db -- stop`, then delete `storage/devdb/data` and `storage/devdb/import-state.json` yourself (keep `dev-secrets.json` to reuse the same secrets, or delete the whole `storage/devdb` folder for new ones). The next `dev:stack` re-initializes and re-imports. A future change of the bundled PostgreSQL major version also needs a reset.

## Disposable real PostgreSQL tests (no Docker required)

```powershell
npm ci
npm run test:unit
npm run test:integration
npm test
npm run typecheck
npm run lint
```

`test:integration` starts actual PostgreSQL 18.6 using the development-only `embedded-postgres` binary bundle, a free loopback port, random temporary credentials and a unique directory under ignored `temp/`. It creates only a synthetic probe table in a fresh `grmn_test` database, closes the pool/stops its process with `pg_ctl`, confirms shutdown, and removes only that run's directory. It ignores application/production DB URLs. A lost startup acknowledgement triggers a status check and owned-cluster shutdown; unknown status retains files rather than deleting a possibly live cluster. Do not run as root on Linux: PostgreSQL requires an unprivileged account; this helper does not create/change OS users. Development binaries/postinstall scripts must be available for the host architecture. It is a test harness, not the production server distribution.

The package version contains a beta suffix for its Node wrapper; its bundled server is PostgreSQL 18.6. Windows x64 was exercised in Tasks 02–03. Linux/macOS and clean CI runner execution remain to qualify separately. Schema suites now apply reviewed migrations to disposable databases as well as exercising the original probe; they never import real source records.

The helper calls the binary `initdb`/`pg_ctl` tools directly with bounded timeouts and hidden Windows child windows. The wrapper's forced Windows shutdown stalled one combined test run, so it is not used for process lifecycle. A real-server failure-injection test verifies that losing the startup result still closes the port before directory removal. See [pg_ctl status and timeout semantics](https://www.postgresql.org/docs/18/app-pg-ctl.html).

## Optional persistent development database with Docker

Copy `.env.example` to ignored `.env.local` and replace example local passwords consistently. Then, with Docker installed:

```powershell
npm run db:local:up
npm run db:local:stop
```

This separate Compose file binds port 55432 on 127.0.0.1 and mounts the PostgreSQL 18 data parent `/var/lib/postgresql`. It does not change the existing app/dev Compose services. `stop` retains the named local volume; no reset/delete-volume command is part of the normal workflow. This optional Docker path was not run on this machine because Docker is absent. See the [official image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md) for PostgreSQL 18 volume layout.

Compose's local bootstrap user is a development superuser only. Do not reuse it for deployment. Runtime DML and migration DDL roles must be provisioned separately with the future schema/deployment tasks; do not expose port 5432 publicly on VPS.

## Environment and migrations

Runtime: `DATABASE_URL`, optionally bounded `DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_POOL_STATS_MS` (21B, off by default), `CATALOG_LISTING_CONCURRENCY` (concurrent catalog listings per process, default half the pool) and `CATALOG_LISTING_WAIT_MS` (wait for a listing slot before 503 `CATALOG_BUSY`, default 2000). The adapter imports `server-only` and does not parse config/open a connection until called. Errors report only invalid variable names, never URL values. `NEXT_PUBLIC_DATABASE_URL` / `NEXT_PUBLIC_DATABASE_MIGRATION_URL` are rejected.

Migration tooling reads only `DATABASE_MIGRATION_URL`; no fallback to runtime credentials. The explicit commands `npm run db:generate` / `npm run db:migrate` load optional `.env.local`. Task 03 supplies `0000_identity-customers` and `0001_catalog-media`; these have only been applied to disposable synthetic test databases. The catalog suite checks upgrade from 0000 while preserving a synthetic identity sentinel and safe migration replay. Deliberately select a local development target before any manual application; do not run against real data now. No push/reset/automatic startup migration command is provided. Next schema work appends a migration rather than rewriting completed/shared history. Preserve custom consent, configuration and category-cycle triggers not represented in Drizzle snapshots; see the two schema documents. `0013_taxonomy-compatibility-geo` was generated with `db:generate`. Two hand edits followed: the `option_values` unique key moved ahead of the FK that depends on it, and the custom `catalog_in_the_box_valid` check was appended. `tests/integration/schema-0013.test.mjs` upgrades a 0012 database holding sentinel rows and also migrates from scratch.

## Browser and worker boundary

Task 05A appends `0005_auth-runtime`: hashed phone challenges, per-session staff MFA grants and application request budgets, bringing the schema to 97 tables. Its real-DB suite exercises signed/revocable sessions, two-instance OTP/completion/MFA races, permissions and failure rollback with synthetic identities only. Preserve its custom challenge/admission triggers and keep application budgets separate from the library's rate-limit cleanup. Read [auth-foundation.md](auth-foundation.md) before configuration or operator actions.

`AUTH_ENABLED=0` keeps authentication and guarded admin data unavailable without DB credentials. Explicit test/staging activation needs a private random 64-hex `AUTH_SECRET`, origin-only `AUTH_BASE_URL`, migrated DB and pool maximum at least two. Production additionally requires HTTPS and a proxy-overwritten `x-grmn-client-ip`, with direct access prevented. The runtime has no real phone sender. `auth:bootstrap` requires explicit one-invocation enablement and protected stdin; do not execute it on real data as part of routine setup. Task 05B replaces existing login/cookies/guards and integrates staff MFA UI; see [auth-integration.md](auth-integration.md). Real provider/recovery activation and enabled staging browser/deployment qualification remain gates.

Task 04C appends `0004_content-operations` after 0000–0003, bringing the schema to 94 tables. Its synthetic suite checks sealed CMS versions, policies, jobs/inbox/idempotency, private exports/consent and import evidence. Preserve custom guards in [content-operations-schema.md](content-operations-schema.md), including private asset links, content publication and import completion. No worker/sender, webhook endpoint, real-data import, settings seed or route cutover runs on migration. Source-field dispositions are metadata only; do not treat them as an importer.

Task 04B appends `0003_payments-fulfillment-promotions` after 0000–0002. Its suite upgrades an existing synthetic order and tests payment/refund, manual fulfillment/return and coupon constraints on disposable PostgreSQL. All migrations remain disconnected from existing routes. Preserve the custom guards documented in [payments-fulfillment-promotions-schema.md](payments-fulfillment-promotions-schema.md); runtime role grants must allow their narrow epoch/version updates. No real payment, carrier or email endpoint is configured by this schema task.

Task 04A appends `0002_commerce-inventory` (stock, carts, quotes, orders) after 0000/0001. The commerce integration suite also rehearses upgrading an existing identity/catalog database and preserves its synthetic sentinels. All three migrations have been exercised only in disposable databases. Retain custom functions/triggers as documented in [commerce-inventory-schema.md](commerce-inventory-schema.md), including deferred order sealing; complete orders and their snapshot children must be inserted in one explicit transaction. Do not use schema push or edit completed migrations to change these constraints.

Next.js handles `server-only` poisoning for Server Components/handlers. A plain Node worker importing shared server code must use:

```powershell
node --conditions=react-server path/to/future-worker.mjs
```

Integration tests prove both that this condition loads the actual DB factory and that the default condition rejects it. `npm run check:boundaries` also walks client imports/re-exports/dynamic literal imports transitively and rejects `src/server`, database/auth packages and `node:` modules. Type-only imports are erased and allowed. Existing legacy CMS/browser coupling is still a migration concern: this guard protects the new boundary and does not certify all old CMS code as secure. Dynamic computed import strings need code review and cannot be statically resolved by this checker.

Task 12 will supply the real worker entry/build/supervision; no worker service has been deployed here. Tasks 05A/05B provide the auth foundation and guarded staff integration, with customer data closed until Task 10 ownership work. Localization and real provider integrations remain deferred.
