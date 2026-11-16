# Task 01 handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete — scope confirmation, static source inventory and planning amendments only. Task 02 has not started.

Plan: `docs/plans/2026-11-10-postgresql-backend-migration-xl.md`  
Date: 2026-11-10  
Branch / initial HEAD: existing `master` / `f05050f`; no commit, reset, staging or branch change performed. Existing uncommitted application changes were preserved.

## Files produced or updated

- Updated XL plan in place: confirmed requirements, VPS architecture, phone/provisional account flow, required wishlist/admin markdowns, deferred integration boundaries, Task 01 checkboxes and next-task pointer.
- `docs/backend/decisions.md`: owner decisions D01–D12, open items O01–O12, proposed security/identity rules, candidate dependency compatibility and VPS/recovery assessment.
- `docs/backend/source-manifest.md`: source authority, counts/issues, all current JSON field mappings, declared optional-field coverage, static data/API/consumer/media dispositions.
- `docs/backend/source-inventory.json`: metadata-only generated snapshot with 160 JSON paths, 47 interfaces, 35 selected static declarations, 64 consumer files, 13 API route files, 437 public assets, and SHA-256/byte sizes for 605 source/asset/test/runtime files. No customer/credential values included.
- This handoff.

## Contracts and migration state

No executable DTO/schema contract, dependency install, database migration, data import, source-data rewrite, production deployment or external provider action occurred. No environment secret values were read/copied. A metadata checksum is not a full backup; create a protected complete snapshot before later data changes.

The root app remains on its existing JSON/component/localStorage behavior. Every source business record is real per owner. Existing payment execution remains demo. No runtime store module/getter was executed: some getters can write homepage defaults.

## Checks run and actual results

- Static TypeScript AST / byte inventory: **PASS**, generated metadata and aggregate findings without executing application imports.
- Source checksum comparison after documentation edits: **PASS**, all 605 inventoried files unchanged.
- Field coverage: **PASS**, all 160 observed JSON paths, all 47 inventoried interfaces, and all 35 selected static declarations have manifest entries.
- Markdown validation: **PASS**, relative file links resolve, fenced blocks balanced, no Unicode replacement characters; all 24 tasks remain sequential and only Task 01's four execution steps are checked.
- Read-only registry queries: Better Auth/adapter 1.7.19, Drizzle ORM 0.45.4, Kit 0.31.11, pg 8.23.1 observed. Published peer/engine ranges align with candidate stack; **runtime compatibility is untested** and belongs to Task 02.
- Existing unit tests, lint/typecheck/build, Docker startup, database connectivity and performance tests: **not run**, because this slice changes documentation only. Do not interpret this as app qualification.

## Important findings and decisions

- Current CMS JSON: 20 products, 6 clients, 12 orders, 1 administrator, 4 discounts, 4 banners, 12 blogs, 6 activities and one settings object. No homepage key in the snapshot.
- Seven stored orders contain a product reference absent from current CMS products. Preserve snapshots/original references and reconcile static/retired/catalog sources during import; do not create guessed sellable products.
- Stored product/order amounts lack per-row currency. Launch KZT with USD display-only is now confirmed; preserve existing raw values until their historical currencies are separately confirmed. Simple rounded item sums match stored totals, which is not proof of tax/payment correctness.
- Provisional phone checkout must not authenticate/merge an existing account by typed phone alone. Verified phone ownership and a serialized/audited claim are required for later access/completion.
- Current Compose packages app/dev only; no production PostgreSQL/worker/volumes/recovery setup. `.dockerignore` excludes `scripts`, so the future worker needs explicit packaging.
- VPS is confirmed, sizing/region/provider/budget deferred. Kaspi/secondary payment, carrier and email/newsletter integrations are deferred. Wishlist and admin product discounts/promo codes are required.
- Kazakh/Russian/English are confirmed; translation modeling/routing/fallback decisions remain for the later review.

## Scope rulings / recovery

Documentation stayed in the current project; no isolated code implementation or risky operation was needed. Stop here as requested by the small-session plan, rather than follow generic execution-skill guidance to run every task. Any later application task must first establish an owned change boundary around the dirty checkout and read installed Next.js guides.

If these documentation amendments need revision, edit only these owned documentation files; source-data rollback is unnecessary because no source-data change occurred. Concurrent changes after the checksum verification require a fresh inventory delta, not restoring older source snapshots over them.

## Exact next step

Task 02A only: agree complete service/DTO contracts and money/identity/error/pagination boundaries, using the latest owner answers. Task 02B is a separate session for dependencies/local PostgreSQL/runtime integration. Do not start either automatically.

Owner replies resolve launch currency and required fields: base/prices/payment KZT; USD display-only using a manually administered, versioned KZT-per-USD rate; quick checkout requires name, phone and delivery address, email optional until full signup/profile completion. Historical source amount currencies remain unconfirmed; do not automatically relabel or convert them. OTP delivery/recovery, country/tax/shipping-fee rules, and manual-payment launch policy are other activation dependencies. Record the answers before finalizing affected contracts; no synthetic identity/currency/provider success should fill a missing decision.

## Later owner clarification and source drift

The owner confirmed KZT base/payment currency, USD display-only at a manually administered exchange rate, and name/phone/delivery-address quick checkout with email optional until profile completion. The plan and decision register were amended; Task 02 remains unstarted.

During verification of these documentation-only amendments, `src/lib/cms/data.json` no longer matched the original Task 01 checksum. The original inventory is a historical snapshot, not current-state proof. This edit did not execute application modules or write that source file. Preserve the current file and regenerate/reconcile the inventory delta before future migration; do not restore the old snapshot over concurrent work. Other changed-file details were checked without dumping business values.
