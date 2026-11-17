# Task 04C handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete — content, configuration and operations schema. Task 04 is complete; Task 05 has not started.

Date: 2026-11-11. Workspace: `C:\Users\Freakman\.codex\worktrees\backend-task-02\GRMN`; branch `codex/backend-task-02`. Reused the isolated dirty checkout. No commit, merge, push, deployment, persistent migration or actual source import. Preserve prior UI/account/backend work.

## Owned outputs

- `src/server/db/schema/content.ts`: page/version/publication, typed blog/banner metadata, media/collection relationships and redirects.
- `src/server/db/schema/configuration.ts`: immutable manual FX, shipping/tax definitions and typed settings/pointers.
- `src/server/db/schema/operations.ts`: audit/outbox, job leases, raw private webhook intake, idempotency, exports/deferred notifications and import provenance/staging/issues.
- `src/server/db/schema/wishlists.ts`: required authenticated wishlist ownership and product membership.
- `drizzle/0004_content-operations.sql`, `drizzle/meta/0004_snapshot.json`, appended journal: 29 new tables, 94 total. Custom media privacy triggers extend the existing media table's behavior without changing its schema definition.
- `tests/integration/content-operations.test.mjs`: 21 real-DB cases, including review regressions.
- `docs/backend/content-operations-schema.md`, `schema-source-dispositions.json`, dictionary/local-development/XL plan updates and this receipt.

The disposition artifact covers all 160 observed JSON paths, 358 declared fields from 47 interfaces, and 35 static definitions in the Task 01 inventory. It preserves source/candidate-domain/staging decisions, not actual data or completed field-value transformations. Credential values are excluded from business import; original sensitive backups remain protected separately. Unknown country/currency/owner/timeline data stays unresolved rather than fabricated. Static/MARQ/optional device/subscription/support sources remain retained for later owner review.

## Schema contracts

CMS versions and their children seal in one transaction. Published pointers belong to the same page; published pages cannot lose their pointer through delete/truncate. SEO lives on content versions/existing product columns, avoiding competing mutable metadata. Homepage blocks retain original fields and product relationships; future public handlers must validate/sanitize and use current authoritative prices.

FX uses positive non-NaN decimal KZT per USD. USD enabling requires a referenced manual version; tax/shipping policy values remain explicit with no business seeds. Shipping activation seals bands/zones; rate insertion writes the parent so stale RR activation fails serialization instead of missing changes. Storefront language/translation strategy and provider activation are unchanged.

Immutable outbox facts are separate from per-consumer jobs. Finite leases, attempt increments, expired-token reclamation and terminal/dead-letter rules support later workers; every actual completion still needs the expected token in its SQL predicate. Verified webhook identities deduplicate only after verification, with exact body bytes retained. Stored verified flags do not replace signature verification.

Export requester/scope/results and import archive references cannot be transferred or severed to make private artifacts public. Marketing grant evidence must match its consent profile's email/user and marketing/newsletter purpose; current withdrawal/contact proof remains a dispatch responsibility. Sending defaults deferred. Generic idempotency retains fixed request identity/results and permits ordinary cleanup only after terminal expiry; truncate cannot bypass retention.

Staging rows/maps/issue evidence are owned by a source run. Known admin password fields cannot enter business staging. Stage/issue writes serialize completion; unfinished blockers prevent a run from finishing. Polymorphic target validation, count reconciliation and real import remain Tasks 06–07.

## Verification

- **`npm test`: 101 passed, 0 failed** — 21 legacy, 13 unit and 67 real-PostgreSQL integration cases; server/client boundary check passed. Final integration run took 425.4 seconds here.
- **21 new scoped cases passed**, then passed again within the full suite after the review corrections. Real tests cover empty/prior migrations, publication/retention truncate guards, private result/archive links, consent binding, NaN FX, lease expiry/reclaim/exhaustion and RR shipping activation.
- **`npm run check`: passed** — lint 0 errors / 28 existing warnings, typecheck and production build passed without DB credentials or backend activation.
- Baseline comparison covers **219 existing source/test/script/migration/config files**. Only the appended migration journal changed. Existing business JSON, app sources, packages and migrations/snapshots 0000–0003 remain byte-identical. Snapshot 0004 links to 0003 and retains all 65 prior table definitions unchanged.
- Coverage comparison found **no missing observed paths, declared fields or static definitions** in the disposition artifact. The known password field is explicitly excluded from business import.
- Nine new owned source/SQL/test/reference files have no trailing whitespace. All disposable PostgreSQL/prior-fixture directories were removed after shutdown.

Initial RED found no `audit_events` table. The first scoped run passed 10/11 and exposed generic trigger access to `NEW.source_namespace` on records without that field. Read-only review identified truncate bypasses, transferable/private output references, unrelated marketing grants, numeric NaN FX and expired/infinite/exhausted lease paths. Shipping RR fencing was also investigated.

The expanded 21-case RED run reproduced all 11 failures. After correction, **all 21 scoped cases passed**, including actual expired-lease waiting/reclamation and stale RR shipping activation. The reviewer did not run PostgreSQL and did not certify production readiness. No reviewer finding was silently deferred.

## Rulings and remaining service work

- Versioned content owns SEO and original blocks; required wishlists are now modeled. Translation tables/routing and optional account domains remain deferred. Cost: future services must use these documented joins and restricted preservation paths.
- Outbox facts and job state are separate. Unsigned webhook IDs do not block legitimate verified receipts. Cost: future handlers/operations must supply rate limits, payload bounds and receipt retention.
- Export/archive metadata links survive expiry so privacy cannot be lost. Binary cleanup and privileged retention are later work. Cost: retained metadata rows.
- Marketing evidence is bound to a profile's recorded recipient and purpose. Current withdrawal/verified-contact checks remain before sending. Cost: changed contacts need renewed/revalidated delivery records.
- No routes/workers/senders/importers/providers were activated. Permissions, sanitization, actual signature/digest verification, job side effects, policy pricing and publish scheduling remain their later tasks, as explicitly set aside by the reviewer. Cost of activating early would be unsafe behavior; activation remains disabled.
- PowerShell baseline/log receipts under ignored `temp/backend-task-04c/` replace the unavailable Bash workflow helper. No commit range or unrun test was invented. Logs and the safety source snapshot must not be staged/published.

Constraint/migration tests do not establish throughput, actual security authorization, production policy validity or minimum VPS resources. Existing app behavior and real source files remain on their prior backend.

## Recovery and next task

Only synthetic disposable PostgreSQL databases were used; no real-data rollback is needed. Revert only this slice's owned files/journal append if abandoning it. Treat completed 0000–0004 and their metadata/custom SQL as immutable history. Ordinary immutable rows are protected; do not weaken triggers to work around a service/grant issue.

Next: **Task 05A only — secure authentication/bootstrap foundation**, then 05B for protected handler/service coverage. Read the XL plan, identity schema/options and Task 03A auth contract alongside this handoff. Reuse the pinned Better Auth mapping and provisional-customer/verified-phone completion contract; do not invent email or trust typed phone/email. Any OTP provider/recovery/staff bootstrap choices still unresolved must remain explicit activation gates. Preserve financial/content/consent guards and source data. Save `task-05a.md` and stop before 05B; no real provider sends or production staff grants are implied by this handoff.
