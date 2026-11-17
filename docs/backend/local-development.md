# Local backend development

Requires Node 24+ and `npm ci`. Existing frontend commands still work without database credentials. The new auth route is disabled by default; existing commerce/CMS routes still use their prior backend. No migration runs in install/build/start. Use the project's current lockfile; no real source data is seeded into the test DB.

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

Runtime: `DATABASE_URL`, optionally bounded `DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS`. The adapter imports `server-only` and does not parse config/open a connection until called. Errors report only invalid variable names, never URL values. `NEXT_PUBLIC_DATABASE_URL` / `NEXT_PUBLIC_DATABASE_MIGRATION_URL` are rejected.

Migration tooling reads only `DATABASE_MIGRATION_URL`; no fallback to runtime credentials. The explicit commands `npm run db:generate` / `npm run db:migrate` load optional `.env.local`. Task 03 supplies `0000_identity-customers` and `0001_catalog-media`; these have only been applied to disposable synthetic test databases. The catalog suite checks upgrade from 0000 while preserving a synthetic identity sentinel and safe migration replay. Deliberately select a local development target before any manual application; do not run against real data now. No push/reset/automatic startup migration command is provided. Next schema work appends a migration rather than rewriting completed/shared history. Preserve custom consent, configuration and category-cycle triggers not represented in Drizzle snapshots; see the two schema documents.

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
