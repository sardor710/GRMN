# Task 08 handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: **complete — 2026-11-16**, including the independent review corrective pass and final repository/build/browser gates.

Workspace: `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, branch `codex/backend-task-02`. The owner requested the whole Task 08 (08A and 08B). This handoff ends at Task 08; the subsequent owner request explicitly authorizes Tasks 09 and 10 next, stopping before 11. Existing uncommitted work is preserved; no commit, merge, push, deployment, persistent import, quarantine approval, or real backend activation is included.

## Implemented contract

- `src/server/cms/service.ts` provides independently authorized product/default SKU/KZT price, versioned blog/banner/homepage, and provisional customer/profile-note operations. Mutations and redacted audit records share one transaction. Version conflicts return 409. Archive retains identities; customer archive suspends the profile.
- `src/server/cms/source.ts` selects `CMS_BACKEND=legacy|postgres` explicitly. Default remains legacy. PostgreSQL errors and empty results never invoke JSON or static catalog fallback. No real environment setting was changed. Missing/corrupt legacy persistence now also fails closed; reading homepage defaults does not write a file.
- `src/server/cms/http.ts` rechecks staff permissions, origin, allowlisted query/body fields and body limits. Lists default to 20/max 100, use scoped cursors, and project safe DTOs. Exact numeric JSON money lexemes are retained for validation before converting to integer minor units.
- Products, blogs, banners and customers use bounded pages with server filters, previous/next navigation, acknowledged writes, loaded versions and visible errors. SEO operations target the shown pages and carry versions. Auxiliary SKU selection is paginated; the dashboard refuses to present partial pages as whole-store totals. Homepage edits and explicit reset carry versions.
- Essential public consumers await the selected source so the candidate cannot mix database CMS data with legacy reads. Products, blogs, homepage and sitemap use published records. Static product detail supplements require an existing published record. Explicitly empty/inactive homepage blocks remain empty.
- KZT survives product projection, display and structured data. Inventory remains unconfigured; the candidate product page cannot submit to the old currency-unaware cart. Inventory and cart workflows remain Tasks 11/15. Customer contacts remain unverified; verified account contacts and consent cannot be changed through profile CRUD. Customer countries use two-letter uppercase codes, without guessing legacy labels.

## Deliberate boundaries

Orders, payments, discounts, settings and staff lifecycle work are not migrated here. Unsupported candidate routes fail closed rather than reading/writing JSON beside enabled database domains. Customer account ownership, addresses and verified identity lifecycle remain Task 10. Full public catalog query/filter/media/variant/cache migration remains Task 09. Public source consistency changes here are prerequisites, not completion of Task 09.

The real source remains blocked for activation: the Task 07 rehearsal accounted for all 261 records (15 normalized, 70 quarantined, 176 static retained), with 133 open blockers. Task 08 uses disposable synthetic data only. Migrations 0000–0005 and the actual JSON source must remain unchanged.

## Verification

Receipts are private under `temp/backend-next-three/08/`, including exact pre-task file snapshots and hashes. They may contain synthetic sessions or local connection details and are not deployment artifacts.

- Initial service suite: 15/15 real PostgreSQL cases passed, including denial, exact money, concurrent edits, audit rollback, archive, bounded cursors, sealed revisions/publication and country/filter persistence.
- Additional direct-customer regression, permission/linked-contact coverage and a separate-process persistence reader are included in the final suite.
- Focused CMS unit tests: 18/18 passed, covering backend selection, outage/empty behavior, mutation acknowledgements, SEO versions, legacy persistence guards, bounded legacy pages, public catalog resurrection/currency and empty homepage blocks.
- Initial Chrome smoke passed against disposable PostgreSQL and real Next routes: 20/5 list pages, server search, product create/update/version, homepage/product rendering and KZT; source bytes stayed unchanged. Expanded final browser coverage passed, including cross-page cross-sell selection, homepage version save, article create/render, finished banner archive, optional-email customer creation and unavailable discounts.
- Initial `npm run check`: passed, 28 existing lint warnings, no lint/type/build errors.

Final `npm test` exit 0: **266/266** = 21 legacy + 90 unit + 155 PostgreSQL integration; server/client boundaries passed (`08/completion-final.log`). Final `npm run check` exit 0: lint/typecheck/build passed, 28 pre-existing lint warnings (`08/review-check-final-2.log`). Final expanded Chrome smoke exit 0 (`08/review-ui-final.log`). Focused CMS gates: 33/33 unit and 25/25 real-DB cases. Real JSON bytes match the pre-Task08 hash. No SQL migration, original archive, real target or backend activation changed.

See [the review and rulings](task-08-review.md) for all corrected findings, deferred minors and excluded-scope costs. All 2 Critical and 12 Important findings were handled in one TDD corrective pass; no re-review. Disposable setup/cleanup diagnostics and bounded administrative migration configuration are documented there. The source, branch and private XL receipts are retained for the remaining uncommitted plan work.
