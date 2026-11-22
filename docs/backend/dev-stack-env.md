# Local dev stack environment variables

Names only. Values for the database and auth come from `storage/devdb/dev-secrets.json` (created on first `npm run dev:stack` / `npm run dev:db -- start`); never commit real values. See [local-development.md](local-development.md#one-command-local-stack-persistent-postgresql-no-docker).

## Read by the dev scripts (`scripts/dev/*.mjs`)

| Name | Used by | Purpose |
|---|---|---|
| `DEV_DB_PORT` | all `dev:*` | Loopback port of the dev PostgreSQL cluster (default 55433) |
| `DEV_ADMIN_EMAIL` | `dev:admin` | Email of the first owner (super_admin) account |
| `DEV_ADMIN_PASSWORD` | `dev:admin` | Its password, 16–128 characters (prompted when unset on a terminal) |
| `DEV_ADMIN_NAME` | `dev:admin` | Optional display name (default "Local Owner") |
| `UPLOAD_DIR` | `dev:import` | Where `/uploads/…` images are looked up for media checksums (default `storage/uploads`) |

## Set for `next dev` by `npm run dev:stack`

Always from the dev stack (`.env.local` cannot override):

- `CMS_BACKEND` (`postgres`)
- `AUTH_ENABLED` (`1`)
- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `AUTH_SECRET`
- `AUTH_BASE_URL` (`http://localhost:<port>`)

Defaults that `.env.local` may override:

- `DATABASE_POOL_MAX` (5)
- `AUTH_DEV_OTP_CONSOLE` (`1`: print phone OTP codes as `[dev-otp] <phone> <code>`; refused when `NODE_ENV=production`)
- `DEMO_PURCHASES` (`1`: demo purchases, decision D03a. Checkout uses the sandbox auto-capture provider, so orders are paid at once in the `sandbox` environment and show as "Demo" in admin orders, the dashboard and reports. Refused when `NODE_ENV=production` unless `DEMO_PURCHASES_ALLOW_PRODUCTION=1`, and when a live payment provider is configured or `store_settings.payment_mode=live`. With `DEMO_PURCHASES_ALLOW_PRODUCTION=1` under `NODE_ENV=production`, only signed-in staff can demo-buy; guests and customers get 403 `DEMO_PURCHASE_STAFF_ONLY` (no order, no stock or coupon taken). In development and test, guests and customers can still demo-buy. Set `DEMO_PURCHASES=0` in `.env.local` to get the unpaid D03 demo checkout instead.)

Everything else in `.env.local` is passed through unchanged.
