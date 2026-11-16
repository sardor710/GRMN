# Task 03A handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete — identity/customer schema only. Task 03B (catalog/media) has not started.

Date: 2026-11-10. Active workspace: `C:\Users\Freakman\.codex\worktrees\backend-task-02\GRMN`, existing branch `codex/backend-task-02`. No new worktree, commit, push, merge or deployment. Pre-existing homepage/admin/account changes were preserved.

## Owned outputs

- `src/server/db/schema/identity.ts`: pinned-compatible users, sessions, accounts, verification, MFA, shared rate counters, role/permission membership tables and verified-phone view.
- `src/server/db/schema/customers.ts`: provisional/linked profiles, private notes, saved addresses, preferences, consent evidence and profile-completion capabilities.
- `src/server/auth/schema-options.ts`: schema-only options selecting UUIDs/phone/MFA/shared rate limits and a fail-closed unconfigured OTP sender. No auth instance/routes.
- `src/server/db/auth-tables.ts`: correct logical-model -> Drizzle-table mapping for the pinned adapter.
- `drizzle/0000_identity-customers.sql` and `drizzle/meta/*`: reviewed first additive migration, 16 tables, one view, append-only consent trigger. Initial draft was regenerated during this task's disposable tests; now treat completed/shared migration history as immutable.
- `tests/unit/identity-schema.test.mjs`, `tests/integration/identity-customers.test.mjs`: metadata/runtime adapter, constraints, ownership shape, concurrency and migration tests.
- `docs/backend/auth-schema-contract.json`, `identity-customer-schema.md`, dictionary/decision/local setup amendments, plan slice status and this receipt.

## Architectural ruling

Installed Better Auth 1.7.19 requires email on its core user. Quick checkout stays email-free by creating a provisional customer profile, not a fake-email auth user. After verified phone proof, a short-lived hashed `complete_profile` capability can permit completion; the actual auth/claim service is Task 05/10. Full user/session creation happens with required email/name/phone completion. The schema does not itself prove OTP possession.

Canonical verified phone lives on the auth user; `phone_identities` is a view, not a second mutable phone registry. Unverified provisional profiles may share an entered phone and cannot be automatically merged by text matching. Saved addresses belong to authenticated users; quick delivery snapshots belong to future commerce/order schema.

## Verification evidence

- Full **`npm test`: 46 passed, 0 failed** — 21 existing tests, 11 unit tests, 14 integration tests. Integration suite used real PostgreSQL 18.6 and took 158.7 seconds here.
- Pinned core/phone/MFA/rate-limit field coverage and disabled fake-email/OTP behavior: **2 new unit cases passed**. A fresh reviewer independently reran these and found no material scoped issue.
- **9 new real-DB cases passed:** empty migration/replay; normalized unique email/verified phone including null-state checks; email-free provisional records and no matching-phone merge; address FK/primary uniqueness including concurrent inserts; actual adapter CRUD for all six models; history-preserving user deletion restriction and append-only consent; membership FK/unique pairs; hashed expiring scoped completion capabilities; DML-role query access with ALTER/TRUNCATE denied.
- `npm run typecheck`: **passed**.
- `npm run lint`: **0 errors / 28 existing warnings**, no unrelated cleanup.
- `npm run build`: **passed** without DB credentials or activating the new backend.
- SHA-256 comparison of every file present in the task-start source/test/script/config baseline: **unchanged**. Existing source data remained byte-identical. No temporary PostgreSQL directories remained after checks.

Initial real tests caught a phone-regex escaping defect; changed to a literal `[+]` character class in schema and regenerated the unreleased draft migration. The deletion test was also isolated to a fresh history owner and corrected to PostgreSQL 18's RESTRICT SQLSTATE `23001`, distinct from orphan-insert FK violation `23503`. All final checks above ran after the fixes.

## State and limits

Only disposable synthetic databases were migrated; no persistent local/VPS DB or real records were migrated/imported. Existing app routes/admin auth still use their original backend. No OTP/email/payment/carrier integration was enabled; no role/member seed granted staff privileges. No customer-facing page changes.

Schema-level address rule is **at most one primary**. Five-address limit/exactly-one-primary, verified account linking, profile/user field agreement, role checks, expiry/replay consumption and privacy/retention actions remain service work. Auth secrets follow the pinned library's format and must stay out of DTOs/logs. Consent mutation trigger is custom SQL not modeled in the Drizzle snapshot; retain it through future migrations and review privileged retention separately.

No localization strategy was chosen. Raw country/contact-city/other legacy fields, orphan product links and historical currency remain the existing protected source/staging reconciliation obligations; never invent values or discard real source records to satisfy new constraints.

## Recovery / next session

No real-data rollback is required. Revert only this task's owned files if abandoning the draft; do not reset the dirty checkout. Test logs and the local pre-task source-data safety snapshot are ignored under `temp/backend-task-03a/` and must not be staged/published.

Next: **Task 03B only — catalog/default variants/taxonomy/attributes/prices/relations/media**. Append a new migration after 0000. Use KZT base prices, preserve public product keys/legacy source IDs and keep translation modeling deferred. Update the migration journal-count assertion in `identity-customers.test.mjs` to the new expected history size (prefer the journal entry count) when adding a migration; do not rewrite existing history to keep an assertion at 1. Reuse this schema/adapter mapping and append-only trigger, rerun appropriate constraint and migration tests, then save `task-03b.md` and stop.
