# Task 05A handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete — secure authentication/bootstrap foundation. Task 05B has not started; Task 05 as a whole remains incomplete.

Date: 2026-11-11. Workspace: `C:\Users\Freakman\.codex\worktrees\backend-task-02\GRMN`; branch `codex/backend-task-02`. Reused the isolated dirty checkout. Preserve prior UI/account/backend changes. No commit, merge, push, deployment, persistent migration, real provider send, real staff bootstrap or actual source import.

## Owned outputs

- `src/server/auth/{config,validation,phone-service,bootstrap,factory,principal,http,runtime}.ts`: configuration, customer phone proof/completion, controlled staff bootstrap/MFA, signed session resolution and reusable permission guards.
- `src/app/api/auth/[...all]/route.ts`: restricted Node GET/POST dispatch, disabled by default. Existing CMS auth handlers, cookies, admin routes and UI are unchanged and remain **Task 05B**.
- `src/server/db/schema/auth-runtime.ts`, `drizzle/0005_auth-runtime.sql`, snapshot and appended journal: three new tables, 97 total. Existing 0000–0004 migrations/snapshots/schema definitions are preserved.
- `scripts/auth/bootstrap.mjs`, package script and `.env.example`: protected-stdin first-operator tool and explicit disabled activation flags; no default credential.
- `tests/unit/auth-config.test.mjs` and `tests/integration/auth-foundation.test.mjs`: two configuration cases and 19 real-DB authentication/concurrency/failure cases.
- [auth-foundation.md](../auth-foundation.md), dictionary/local-development/decisions, the same XL plan and this handoff. Zod 4.6.7 is now an explicit direct dependency for request schemas; it was already installed transitively.

## Contracts and activation state

New auth defaults unavailable with `AUTH_ENABLED=0`; it does not need DB/secret configuration to build. Explicit runtime activation requires a private random 64-hex secret and origin-only URL. Production requires HTTPS plus the dedicated proxy-overwritten IP header and blocked direct app access. Pool maximum must be at least two because a held staff-MFA advisory-lock connection is separate from library queries. Default remains five; no VPS sizing or throughput claim follows from these tests.

The production runtime supplies no phone sender. Tests inject a synthetic sender and never contact real recipients. OTP delivery/provider abuse policy and lost/recycled-phone recovery remain launch gates. Email/newsletter and translation strategy remain deferred. Password reset, MFA disable and generic recovery routes are not exposed; staff recovery/lifecycle operations need a deliberate later policy. Do not activate routes by falling back to legacy credentials.

Phone challenges store HMAC digests, expire in five minutes, count at most five wrong attempts atomically and consume once. Replacement invalidates prior pending challenges. Failed delivery invalidates its challenge. New-user phone proof supplies a signed HttpOnly path-scoped ten-minute completion capability, not a full session; the DB retains only a random-token digest. Required name/email/proved phone completion consumes proof and creates a new user/profile/audit atomically. It never merges existing provisional contacts/orders by typed phone/email; quick checkout remains outside auth users until full completion. Competing canonical completions have one winner.

Staff password authentication uses library hashing and signed revocable sessions. A password-only session cannot become an admitted staff principal merely because another session enrolls MFA. Successful TOTP or single-use backup proof creates a grant for the actual signed browser session and audit in one transaction. Sensitive permissions need fresh MFA within 15 minutes. Current status, roles, permissions and grant resolve together; session deletion/suspension is effective on the next check without cookie caching. The first-operator tool serializes bootstrap and refuses any existing staff membership; only synthetic bootstrap has been executed.

Library verification commits separately from grant/audit. An admission failure can leave a consumed backup code or rotated session, without a committed admission. After recovery, sign in again with TOTP or another backup code; 05B must handle this safe retry in the UI rather than bypassing admission.

Application budgets use an independent table and HMAC keys so the library's shorter-window cleanup cannot reset them. Fixed-window limits, bounded streamed JSON, origin/field restrictions, safe errors and `Retry-After` apply across two simulated instances. MFA enrollment/verification uses a conservative shared advisory lock; this prevents competing secret replacement/backup replay, at the cost of serializing low-volume staff MFA. Future cleanup must remove expired challenge/capability/budget rows in bounded batches after retention is agreed; no worker is active.

Default roles: super_admin all 12 permissions; product_manager catalog read/write and inventory write; editor catalog read/content write; support customer/order read. Actual admin handlers still need these guards in 05B. Phone proof cannot bypass staff MFA, and new auth ignores the old base64 cookie; the old routes themselves have not been replaced.

## Verification

- Focused auth suite: **19 passed, 0 failed**, 52.1 seconds on disposable PostgreSQL 18.6, using two pools/factories and synthetic identities.
- **`npm test`: 122 passed, 0 failed** — 21 legacy, 15 unit and 86 real-PostgreSQL integration cases; server/client import boundaries passed. The final integration run took 414.3 seconds on this machine.
- **`npm run check`: passed** — lint 0 errors / 28 existing warnings, typecheck and production build, without backend activation or DB credentials. Existing workspace-root/metadataBase build warnings remain unrelated to this slice.
- Baseline hashes cover 227 existing source/test/script/migration/config files. Only the migration journal, package manifests and `.env.example` changed. All existing business JSON/app sources, completed migrations/snapshots and prior schema files remain byte-identical. Snapshot 0005 links to 0004 and preserves all 94 existing table definitions.
- Sixteen owned source/SQL/test/reference files have no trailing whitespace; document links resolve. All disposable PostgreSQL directories were removed after confirmed shutdown. No existing source field/value was imported or rewritten.

Initial RED showed missing challenge/admission tables. The first runtime run exposed enrollment returning an old JSON session token despite rotating the browser cookie. Fresh read-only review also found separate role/permission reads, library cleanup resetting application budgets, a two-step OTP attempt race, credential-enumeration differences, missing enrollment serialization/account budgets, unbounded body buffering and non-atomic admission/audit. Regression RED reproduced the review failures. The corrected scoped suite passes those races, actual library cleanup and injected audit/session-delete failures. Two synthetic fixture mistakes were corrected: using an already-enrolled factor for first-enrollment concurrency, and a text/UUID SQL parameter mismatch. No production credentials or source accounts were used.

The reviewer inspected source only and did not run PostgreSQL or certify production readiness. Verification does not establish complete browser/user journeys, all endpoint ownership checks, provider recovery, infrastructure security or production capacity.

## Rulings, recovery and next task

- Keep the pinned library for credentials, cookies, sessions and TOTP, with custom phone proof because raw OTP storage/MFA coverage did not satisfy this flow. Cost: the bounded challenge/completion service must be maintained and tested when upgrading auth.
- Keep application budgets separate from library state. Cost: a small table and future retention job, rather than vulnerable window sharing.
- Keep per-session staff admission and audit atomic, resolving the signed response cookie rather than trusting a returned raw token. Cost: an extra admission table and explicit guards at every protected service/handler.
- Preserve the custom SQL guards in 0005; they are not modeled in Drizzle snapshots. Once this slice completes, append future changes rather than rewriting 0000–0005.
- PowerShell baseline/log receipts under ignored `temp/backend-task-05a/` replace unavailable Bash workflow helpers. Safety source snapshot/logs remain private and must not be staged/published. No commit range was invented.

Only disposable synthetic databases were changed, so no real-data rollback is required. If abandoning this slice, revert only its owned additions, configuration/package edits and journal append; preserve unrelated dirty work. Never use insecure legacy authentication as a recovery mechanism for a guarded deployment.

Next: **Task 05B only — integrate authentication and protect all existing handlers/services**. Read this handoff, `auth-foundation.md`, the Task 03A auth contract and XL plan. Replace legacy CMS auth/login/logout/cookie consumers, wire the staff enrollment/sign-in flow, enforce permission/ownership checks at each handler/service, and test denial coverage. Keep real providers, staff bootstrap and production cutover gated. Do not start Task 06 or claim Task 05 complete until 05B acceptance and remaining activation/recovery decisions are explicitly accounted for. Save its handoff and stop.
