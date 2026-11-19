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

## Production prepared on the VPS (2026-11-19, owner "go"; DNS not switched)

The owner gave the go, but chose "prepare, don't switch yet" and "don't touch Odoo". Production therefore runs on the VPS, **closed and reachable only from the VPS itself**.

| Item | State |
|---|---|
| Stack | Compose project `grmn` from `deploy/compose.yml`, images `grmn:5198127` / `grmn-ops:5198127`. Proxy on `127.0.0.1:58543` (HTTPS) and `:58580` (HTTP→HTTPS) only |
| Private files | `/home/nick/grmn-production/` (chmod 700): `production.env` (generated secrets, Telegram token), `backup/`, `tls/` (**self-signed placeholder, 30 days**), `logs/`, `receipts/`, `staff-credentials.json` (the 4 passwords; hand over, then delete) |
| Database | Migrations 0000–0018. Import `completed`: 0 mismatches, 0 blockers; products, orders, customers and users 0; 17 content pages, all drafts; 258 archived |
| Store | Created **closed** (maintenance on). VAT 16% inclusive, delivery 1,500 KZT below 30,000 KZT and free from 30,000, trilingual Kaspi instructions, 48 h hold |
| Staff | `admin@garmin.kz` (super_admin), `owner@`, `products@` (product_manager), `support@`. All 4 sign in. MFA is **not** enrolled: each person enrolls at first admin sign-in |
| Telegram | Worker job running (cursor initialized 09:53:54 UTC). Connection test message sent to "Garmin orders" |
| Schedules | `crontab` of user nick (`/home/nick/grmn-production/crontab`): backup daily at 21:30 UTC, health every 5 min (logs in `grmn-production/logs`). First backup and health check passed (invariants 12/12) |

**Reaching the closed store before launch.** The auth origin is `https://garmin.kz`, so the browser must see exactly that origin. Steps, from a staff computer:
1. Map `garmin.kz` to `127.0.0.1` in its hosts file.
2. Run `sudo ssh -L 443:127.0.0.1:58543 nick@81.17.97.65`.
3. Open `https://garmin.kz/admin/login` and accept the placeholder certificate.
4. Enroll MFA, then take the maintenance bypass to preview the store.

**To go public** (each step needs the owner):
1. **A front door on ports 80/443.** odoo-nginx holds them, so either use another public IP or server, or decide later to route through odoo-nginx (the store's nginx must then trust the client IP from that proxy only).
2. **DNS:** point `garmin.kz` and `www` A records at that address (now 109.233.109.114, the current megagroup.kz store).
3. **A real certificate** for garmin.kz, in `grmn-production/tls/`; reload the proxy.
4. **Staff preparation:** create products and stock, fix the banner images and the KZT announcement, publish banners, blogs and the homepage.
5. **Open the store:** turn maintenance off in admin settings.

## Odoo removed, shared front door, garmin.tigr.uz (2026-11-19, owner)

The owner asked to delete Odoo completely, keep erp.tigr.uz and zanko.uz, and put the store on **garmin.tigr.uz**.

- **Front door.** `odoo-nginx` also fronted erp.tigr.uz, zanko.uz, agent.tigr.uz and hermes.tigr.uz. It is replaced by `edge-nginx`:
  - compose project `edge` in `/home/nick/edge`, outside this repository, with host networking;
  - the same site configs, with upstreams changed to 127.0.0.1;
  - unknown hosts and the bare IP are refused;
  - the swap took about 1.4 s, and every kept site answered exactly as before.
- **Certificates.** The certbot deploy hook now copies into `/home/nick/edge/ssl` and reloads edge-nginx. A Let's Encrypt certificate was issued for garmin.tigr.uz. `certbot renew --dry-run` succeeds for all 5 names.
- **Odoo deleted:**
  - containers `odoo-app`, `odoo-db` and `odoo-nginx`, their network and images;
  - `/home/nick/odoo-production`;
  - the crm.tigr.uz certificate.
  - A final archive (database dump, filestore and config, 27 MB) is kept at `/home/nick/odoo-final-backup-20261119.tar.gz` (0600); delete it when no longer wanted.
  - tigr.uz and crm.tigr.uz no longer answer.
- **The store moves to garmin.tigr.uz.**
  - `GRMN_DOMAIN=garmin.tigr.uz`.
  - Edge proxies to the store's proxy on 127.0.0.1:58543, and the store's nginx trusts `X-Real-IP` from the edge only (`GRMN_TRUSTED_PROXY`, the grmn network gateway), so the per-IP limits see real customers.
  - The store is still **closed** (503 to visitors).
  - Staff sign in at `https://garmin.tigr.uz/admin/login`; no SSH tunnel is needed any more.

## Language update (beta2) merged

`origin/beta2` (English, Russian and Kazakh: every public URL is `/en|ru|kk/…`, and unprefixed paths redirect by cookie and Accept-Language) is merged into `beta`. Conflicts were resolved as follows:
- **`src/proxy.ts`.** The maintenance gate runs first. The matcher still covers `/api` and `/admin`, which the freeze gates; locale and CMS redirects skip non-localized paths through `NOT_LOCALIZED` (beta2's original exclusions).
- **`CheckoutPanel.tsx`.** The manual-payment receipt (how to pay, instructions, hold time, paid status) is now translated: new `Checkout` keys in `messages/{en,ru,kk}.json`; the `demoNotice` key was replaced by `paymentNotice`.
- **Tests.** The proxy tests keep the gate mock and add the beta2 routing helpers. The matcher test now expects `/api` and `/admin` to run the proxy, and a new test covers `NOT_LOCALIZED`.

The image needs the public origin at build time: `docker build --build-arg NEXT_PUBLIC_SITE_URL=https://garmin.tigr.uz` (Dockerfile ARG). Compose also passes it at runtime.

**Content translations in PostgreSQL (built after the merge, at the owner's request):**
- Migration 0019 adds `product_translations` and `page_version_translations`.
- The admin RU/KK tabs work on PostgreSQL for products, blogs, banners, the homepage and SEO.
- The storefront and sitemap read the stored translations.
- Details are in [docs/i18n/HANDOFF.md](../../i18n/HANDOFF.md#postgresql-storage-task-24-built-2026-11-19).

**Deployed 2026-11-19:**
- `grmn:47a935d` / `grmn-ops:47a935d` are in production, after a pre-release backup.
- Staging first passed **39/39** with the language build: `/` redirects to `/ru`; `/en`, `/ru`, `/kk`, categories, blog, cart and the product page answer; delivery rule, purchase, cancellation and reopen all pass; the canonical and sitemap use garmin.tigr.uz.
- **Deploy note:** the store's nginx resolves `app` once at start, so after the app container is recreated, restart the proxy (`… restart proxy`). Otherwise it answers 502.

**Content translations deployed (2026-11-19):**
- `grmn:d239c3b` / `grmn-ops:d239c3b` are in production; migration 0019 applied (20 migrations).
- Staging first passed 39/39. A product created through the admin with ru/kk translations rendered "Тестовые часы" on `/ru/p/…` and "Сынақ сағаты" on `/kk/p/…`, and the sitemap listed all three languages.

**Found during this deploy:**
- **The backup job's prune step failed** once production held more than 2 base backups: it ran as the host user and could not read files owned by PostgreSQL (uid 999). The base and media backups had already succeeded; the pre-migration base `20261119T110346Z` is intact.
- **Fix:** `scheduled.sh` runs `prune.sh` inside the db container. `prune.sh` also no longer aborts when a base lacks a `backup_label`.
- The job was re-run and passed with exit 0.

**Password-only staff sign-in deployed (2026-11-19, owner):**
- `grmn:af156ef` is live with `STAFF_MFA_REQUIRED=0`, after a pre-release backup (exit 0).
- Verified on garmin.tigr.uz: `admin@garmin.kz` signs in with its password (`mfaRequired:false`); the admin page, orders and settings answer 200, and the maintenance bypass (settings:write) is issued.
- To restore the authenticator later: set `STAFF_MFA_REQUIRED=1` in `production.env` and `up -d --force-recreate app worker proxy`.

**garmin.com importer and variants on PostgreSQL (2026-11-19, owner: "add those features and relaunch").**

Commits 5cbad06/e7dc91c built the importer, options/variants editor, photo uploads and storefront variant pickers for the legacy JSON store; they now work on PostgreSQL.
- **One product editor** (`ProductsScreen`) for both stores. The PostgreSQL-only screen is removed.
- **Saves are projected into the commerce tables** by `src/server/cms/product-projection.ts`:
  - options and values;
  - variants matched by SKU or a stable id, archived (never deleted) when removed;
  - exact per-variant KZT prices;
  - selections;
  - photos registered as `media_assets` (namespace `catalog-files`, with real size, checksum and type) and attached per variant.
- **Validation:** exactly one default variant, unique SKUs, every option chosen, compare-at not below price. Overview HTML and images are sanitized.
- **Limits:** 300 photos, 500 spec rows, 1 MB request.
- **The catalog** accepts `/uploads` and `/media` photo paths and returns `overviewHtml` and `specGroups` (translated); the product page renders them.
- **Stock** is not edited in the product form on PostgreSQL; it moves through the Inventory screen.
- **Ops:**
  - `UPLOAD_DIR=/media/uploads` on the backed-up media volume.
  - The image makes `/media` owned by the app user; existing volumes were chowned once. Before this, CMS media uploads could not write either.
  - **The admin API stays open during maintenance**, so staff can prepare products before opening.
- **Staging:** live imports from garmin.com through the admin:
  - **Venu 4:** 9 variants and 38 photos stored; saved; the en/ru product pages show 8 active variants, the gallery and the overview.
  - **fēnix 9 Pro:** 33 variants and 245 photos in 5 s; saved; 33 variants on the page.
  - **Launch check:** 39/39.
- **Tests:** `tests/integration/catalog-variants.test.mjs` (7), including the fēnix 9 fixture import and an HTTP post. The full suite is 397/397.
- **Found and fixed on staging:** decimal-text variant prices from the admin route, the 1 MB product request limit, `/media` permissions, and the maintenance freeze blocking staff edits.

**Admin additions (owner, 2026-11-19):**
- **Discounts and promotions on PostgreSQL:** `src/server/pricing/promotions-admin.ts`, behind the existing Discounts screen.
  - **Supports:** create and edit (versioned); percentage or fixed KZT; minimum spend; usage and per-customer limits; all products or selected SKUs; dates; stackable; active, disabled or expired.
  - **Codes** are stored lowercase (checkout lowercases what customers type) and shown uppercase.
  - **Delete archives the code:** promotions are commerce history, protected by the `promotions_no_delete` trigger. Checkout then refuses the code and the list hides it.
  - **Category scope is refused** with a message: there are no catalog categories yet.
- **Delete a product permanently** (`DELETE /api/admin/products?…&permanent=1`): only for a product that was never ordered and has no stock history. Its variants, prices, options, photo links, translations, collection entries and promotion, cart and wishlist lines go with it; otherwise 409 ("archive it instead"). On PostgreSQL the trash button is labelled Archive.
- **Auto-translate RU & KZ** (OpenRouter `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` = `nvidia/nemotron-3.5-super-vl:free`; the key is only in `production.env`):
  - **Where:** a button in the product, blog, banner and homepage editors.
  - **Safe for staff edits:** only empty RU/KZ fields are filled; HTML is translated node by node.
  - **Translation memory** (migration 0020, `translation_memory`): each distinct text is translated once and reused across fields and products.
  - **Rounds:** 15 s budget, 3 concurrent batches of 20, 40 s per call, automatic retries, so no request hits the 60 s proxy limit.
  - **Speed** on the free model: about 5 texts per second; a large garmin.com product such as fēnix 9 Pro (about 3,700 texts) takes about 12 minutes the first time.
  - **Quality:** the Kazakh output of this free model needs review (for example "Bright display" became "Қарлы дисплей", "snowy display").
  - **Nothing is saved** until staff save.
- **Kazakh is served at `/kz/…`** and labelled "KZ":
  - the proxy rewrites `/kz` to the internal `kk` route, and old `/kk/…` links answer 301;
  - hreflang, `<html lang>`, message catalogs and stored translations keep the ISO 639-1 code `kk`.
