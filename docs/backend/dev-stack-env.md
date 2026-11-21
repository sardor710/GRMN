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
- `DEMO_PURCHASES` (`1`; placeholder for a later module)

Everything else in `.env.local` is passed through unchanged.
