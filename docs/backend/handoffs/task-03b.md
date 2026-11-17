# Task 03B handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete — catalog/media schema only. Task 04A has not started.

Date: 2026-11-10. Workspace: `C:\Users\Freakman\.codex\worktrees\backend-task-02\GRMN`; branch `codex/backend-task-02`. Reused the existing checkout. No commit, push, merge, deployment or persistent database migration. Preserve the unrelated homepage/admin/account work already present.

## Owned outputs

- `src/server/db/schema/catalog.ts`: products, variants/options/selections, categories/memberships, activity taxonomy, typed attributes, directed relations and KZT prices, including internal concurrency epochs.
- `src/server/db/schema/media.ts` and `catalog-media.ts`: storage metadata and product/variant gallery ownership.
- `drizzle/0001_catalog-media.sql`, `drizzle/meta/0001_snapshot.json` and appended journal entry: 17 additional tables, 33 total. The singleton taxonomy row is infrastructure state, not a business seed.
- `tests/unit/catalog-schema.test.mjs` and `tests/integration/catalog-media.test.mjs`: metadata defaults, upgrade/replay, Unicode, ownership, financial precision, combinations, concurrency and media constraints.
- `tests/integration/identity-customers.test.mjs`: only the migration-history assertion/import changed to use journal entry count rather than the old hard-coded count of one.
- `docs/backend/catalog-media-schema.md`, dictionary/local-development amendments, the existing XL plan status and this receipt.

## Contracts and boundaries

Products preserve public keys and original text/content; variants own unique case-insensitive SKUs, option selections and prices. New selling prices are KZT `bigint` minor units, serialized as strings. USD conversion remains display-only and later settings/quote work. No existing source amount has been imported or assigned a different currency.

Composite foreign keys prevent cross-product option or media associations. Active variants need complete option selections; completed non-archived combinations are unique. Drafts can be incomplete. The DB enforces at most one current default variant; publication services later require a usable default and price. Archival preserves linked records; restrictive foreign keys prevent cascading deletion.

Product configuration mutations serialize via the parent's epoch. Deferred validation rebuilds the product's final derived signatures in two phases, allowing atomic swaps while rejecting duplicate final combinations. The category singleton serializes reparenting before recursive cycle validation; repeatable-read stale writers fail serialization. Future services must use bounded complete-transaction retries and consistent product lock order for bulk writes.

Media defaults private/pending and stores metadata only. Ready metadata requires bytes/MIME/checksum; this does not verify an uploaded object's existence, content or access policy. Upload/storage service work remains later. JSON containers retain original product detail; entry sanitation, public DTO allowlists and publication checks remain later services. Translation modeling/routing is deferred.

## Verification evidence

- **`npm test`: 58 passed, 0 failed** — 21 legacy, 13 unit and 24 real-PostgreSQL integration cases; server/client boundary check passed. Final integration run took 197.2 seconds here.
- **Catalog/media integration suite: 10 passed**, including migration 0000 -> 0001 preserving a prior identity, replay, SKU/public-key/default constraints, bigint KZT rules, variant ownership/combinations, concurrent configuration, atomic swaps, category-cycle races at two isolation levels, typed attributes and media ownership.
- After adding explicit public-key/Unicode result assertions, **the targeted migration/Unicode case passed again**. This final assertion was verified separately from the full run.
- **`npm run typecheck`: passed. `npm run lint`: 0 errors / 28 existing warnings.**
- **`npm run build`: passed** during this task without database credentials or backend activation. The later correction changed only migration SQL/tests/documentation; application/schema TypeScript was unchanged after that build.
- Owned new files contain no trailing whitespace. All disposable PostgreSQL clusters shut down and their run directories were removed.

The swap regression first failed at commit with PostgreSQL `23505`, reproducing a transient uniqueness collision. The function now clears old product signatures before deriving the final set. The regression then passed for a valid swap and rejected a genuinely duplicate final update without losing the previous selection. A read-only reviewer checked the correction and reported no further material issue; they did not rerun tests.

Baseline comparison covered 201 existing source/test/script/migration/config files. Only the intentionally generalized identity test and appended migration journal changed. All pre-existing application sources, real JSON data, package/lockfile, scripts, migration 0000 and its snapshot remained byte-identical to the start of this task. A repository-wide whitespace check reports existing trailing blank lines in `src/lib/cms/store.ts` and `types.ts`; these unchanged files were left alone.

## Limits, recovery and next task

Only disposable synthetic PostgreSQL 18.6 databases were migrated. No real source records were imported, no existing route was switched, and no auth/payment/carrier/email provider was activated. No production capacity or minimum VPS claim is established by these constraint tests.

No real-data rollback is needed. If abandoning this task, revert only its owned outputs and journal append, and retain prior task/user changes. Ignored `temp/backend-task-03b/` holds local test logs and a source-data safety snapshot; do not stage or publish it.

Next: **Task 04A only — inventory, carts and orders schema**, using the existing XL plan and contracts. Append migration 0002. Treat 0000/0001 and their metadata as completed immutable history. Preserve custom consent, configuration-signature and category-lock/cycle SQL, which Drizzle snapshots do not model. Add stock/reservation/movement, cart/revision/line, immutable order snapshot/number and related constraint tests; leave payment/fulfillment/promotions schema to 04B and content/operations to 04C. Save `task-04a.md` and stop.
