# Customer signup + test code 1234, compact Traffic page — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Executing | 1–2 | 5/12 | 2026-11-26 | M3 account UI (M2 agent running) |

Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement
- **Goal:** (1) Customers can sign up and sign in on the live site, which isn't public yet. Today sign-in returns 503 in production because no SMS provider exists, and signup is hidden behind the phone-code step. (2) Admin ▸ Traffic becomes compact and easy to read, with clear blocks, grouping, and smaller cards.
- **Deliverables:**
  - The account page has **Sign in | Sign up** tabs.
  - **Sign up** takes name, phone and email. It creates the account and signs the customer in straight away, with no phone verification.
  - **Sign in** takes phone, then code. With the test switch on, the code is always **1234** for every customer and every purpose (sign in, phone change, order claim). A small "test mode" note says so.
  - One runtime switch, `AUTH_TEST_OTP_CODE=1234`, set in production.env and passed through `deploy/compose.yml`. While it's on, the per-phone send limit is relaxed. When it's off, everything behaves as before, and Sign up falls back to the code-then-details flow.
  - Strings in en, ru and kk.
  - The Traffic page uses layout **A**, chosen by the owner 2026-11-26: a compact KPI strip, then three grouped sections. "Where visitors come from" has Sources and Devices side by side, "When they visit" has Visits by day and Busiest hours side by side, and "What they look at" has the top products. Cards are about half their old height, and empty sections collapse to one line.
- **Constraints:** Staff email+password sign-in is unchanged, and staff can't use the phone or signup flows. No `NEXT_PUBLIC_*` variable for test mode, because those are baked in at build time; the server reports it at runtime. Keep existing smoke selectors (`data-platform`, `data-medium`, `data-campaign`, `data-product`, `data-device`, `section[aria-label="Busiest hours and weekdays"]`). `shared.tsx` is also used by Campaign links, which must keep working. Never show `$`.
- **Non-goals:** a real SMS provider; email verification; changes to the Campaign links page beyond what shared pieces cause; new traffic metrics on the backend.
- **Assumptions:** The owner accepts the risk that anyone who knows a customer's phone number can sign in while the switch is on, because the site isn't public (owner, 2026-11-26). Accounts created by signup are stored with `phone_number_verified=true` so profile editing works, and get an audit event `customer.signup_unverified` so they can be found later.
- **Open questions:** none.

## 2. Acceptance
| ID | Criterion | Mode | Check |
|---|---|---|---|
| A1 | With the flag on, send returns a challenge without an SMS sender, and verify with 1234 signs in an existing customer | auto | integration test (auth-foundation) |
| A2 | With the flag on, signup creates user+profile+audit and sets a session; a duplicate phone or email gives 409; staff can't sign up into a staff phone | auto | integration test |
| A3 | With the flag off, signup is refused (403/404), send still 503s without a sender, and 6-digit codes are still required | auto | integration + unit |
| A4 | The flag is rejected in config unless it is exactly 4–6 digits | auto | unit |
| A5 | The account page shows the Sign in / Sign up tabs, and the test-mode note appears only in test mode | auto + manual | unit (account-dashboard) + browser screenshot |
| A6 | The Traffic page renders layout A at 1440 and 390 with seeded data and when empty; smoke selectors are intact | auto + manual | screenshots + `CMS_SMOKE_ONLY=traffic` smoke if memory allows |
| A7 | The owner approves the look of the Traffic page | manual | owner |
| A8 | Typecheck, lint, unit and the relevant integration tests pass | auto | commands in §6 |

## 3. Anti-drift
- **Primary objective:** the owner can sign up and sign in on garmin.2well.cloud, and finds the Traffic page clear.
- **Proxy signals (not success by themselves):** green tsc or build; passing smoke selectors; "layout matches sketch" without screenshots.
- **Intended scope:** auth phone flow + account sign-in screen + traffic UI components + compose env passthrough.
- **Completion target:** full delivery on branch `signup-traffic-ui`; deploy only on the owner's "deploy".

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 | Test-code mode + signup endpoint + mode endpoint + tests | lead, `superpowers:test-driven-development` (owner) | `src/server/auth/*`, `src/app/api/auth/**` if needed, `deploy/compose.yml`, `tests/unit/dev-phone-sender*`, `tests/integration/auth-foundation*` | – |
| M2 | Traffic layout A | `frontend-developer` agent (owner, own worktree), `dataviz` skill (support) | `src/app/admin/traffic/_components/*` | – |
| M3 | Account Sign in / Sign up UI + i18n | lead (owner) | `src/components/AccountDashboard.tsx`, `src/lib/account-client.ts`, `messages/*.json`, `tests/unit/account-*` | M1 |
| M4 | Visual QA | `ui-finish-gate-reviewer` (verifier) on Traffic screenshots | read-only | M2 |

Waves: Wave 1: M1 ‖ M2 (disjoint scopes; M2 in a worktree). Wave 2: M3, then M4 and merge. Checks run one at a time (low memory on this box).

## 5. Tasks
### M1 — auth backend (wave 1)
- [x] 1.1 `testOtpCodeFromEnv` in `dev-phone-sender.ts` (or a new `test-otp.ts`): `AUTH_TEST_OTP_CODE` must be 4–6 digits or unset. Unit test.
- [x] 1.2 `phone-service`: with a test code, `request()` stores the hash of the fixed code, skips sending, and uses a relaxed budget. `consume()` accepts `^[0-9]{4,6}$`. The verify endpoint regex accepts 4–6 digits, and so do the phone-change and order-claim schemas.
- [x] 1.3 `POST /api/auth/grmn/signup` (only when the test code is set): name, email and phone are inserted like `complete()` with an audit event, and a session is set. `GET /api/auth/grmn/mode` returns `{ testCode: boolean }`.
- [x] 1.4 Wire into `runtime.ts`; add `AUTH_TEST_OTP_CODE: ${AUTH_TEST_OTP_CODE:-}` to `deploy/compose.yml`.
- [x] 1.5 Integration tests for A1–A3. — evidence: `tests/unit/test-otp.test.mjs` 4/4; `auth-foundation.test.mjs` 20/20 pass incl. new test-code test

### M2 — Traffic layout A (wave 1, frontend-developer)
- [ ] 2.1 Before screenshots (seeded local).
- [ ] 2.2 Compact KPI strip, group headings, 2-column grid, shorter charts, top-10 products, one-line empty states.
- [ ] 2.3 After screenshots at 1440 and 390, filled and empty; selectors intact; tsc and lint clean on the touched files.

### M3 — account UI (wave 2)
- [ ] 3.1 Client: `signUp`, `mode`; code inputs `pattern="[0-9]{4,6}"`.
- [ ] 3.2 Tabs, the Sign up form, and the test-mode note; en/ru/kk strings.
- [ ] 3.3 Unit tests and a browser screenshot of both tabs.

### M4 — QA and merge
- [ ] 4.1 Finish-gate review of the Traffic screenshots, with at most one fix round.
- [ ] 4.2 Full checks (§6), plan result and handoff.

## 6. Verification
- `npx tsc --noEmit` · `npx eslint <touched>` · `npm run test:unit` · `node --conditions=react-server --test tests/integration/auth-foundation.test.mjs tests/integration/account-claims.test.mjs` · `npm run check:boundaries`

## 7. Rollback
All changes are additive on branch `signup-traffic-ui`. Unset `AUTH_TEST_OTP_CODE` to turn off test mode without a redeploy (restart app). No DB migration. Leave `docs/plans/2026-11-23-…` and `.claude/worktrees/` alone (not ours).

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-26: owner approved approach A and test code on prod ("A, go ahead").

## Result
Delivered: · Checks run: · Gaps: · Follow-ups:

## Handoff
Branch `signup-traffic-ui` off beta5 (e1892be). Wave 1 starting.
