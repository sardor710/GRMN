# Customer signup + test code 1234, compact Traffic page — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done (deployed) | – | 12/12 | 2026-11-26 | Owner checks Traffic page look (A7) |

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
- [x] 2.1 Before screenshots — scratchpad/traffic/before-*.png
- [x] 2.2 Compact KPI strip, group headings, 2-column grid, shorter charts, top-10 products, one-line empty states. — agent commit 029550b, merged d3e7c40; page 2429→1457px at 1440. Pairs go 2-column at xl (1280), not lg, because Devices overflowed at 1024. Tile reads "Pages / visitor" (pageViews÷visitors).
- [x] 2.3 After screenshots at 1440 and 390, filled and empty; selectors intact; tsc and lint clean on the touched files. — lead re-ran on merge: tsc 0, eslint clean, unit 724/0, legacy 335/0, boundaries ok. Smoke selectors counted live by agent; full cms-smoke not run (memory).

### M3 — account UI (wave 2)
- [x] 3.1 Client: `signUp`, `authMode`; code inputs `pattern="[0-9]{4,6}"`. — commit db17886
- [x] 3.2 Tabs, Sign up form, code note; en/ru/kk. The note avoids "test" wording because `customer-demo-wording.test.mjs` (owner rule 2026-11-22) forbids it: "SMS codes are not sent yet. Enter code 1234."
- [x] 3.3 Unit tests done (account-dashboard +2; unit 724/0 after rewording; legacy 335/0; account-claims 12/12; tsc 0; eslint clean; boundaries ok). Browser (local stack, AUTH_TEST_OTP_CODE=1234, Playwright `tools/browser/account-flow.mjs`): sign up → account shown; sign out → phone + 1234 → signed in. Screenshots scratchpad/account/*. Label "6-digit code" → "Verification code" (6808b0d).

### M4 — QA and merge
- [x] 4.1 Finish-gate review: PASS. Applied optional items 1–3 (chevron icon, Devices not stretched, "Arrivals on the store" / "Traffic by day"): 6eccc33. Re-shot final-1440.png, selectors intact, 0 page errors.
- [x] 4.2 Final `npm test` on HEAD 84a85cb (exit 0): tsc 0; legacy 335/335; unit 724 pass / 0 fail (725 total, 1 not run); integration 674/674; boundaries ok. Earlier: tsc 0, eslint clean, unit 724/0, legacy 335/0, auth-foundation 20/20, account-claims 12/12, boundaries ok.

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
Delivered (branch `signup-traffic-ui`: db17886, d3e7c40 merge of 029550b, 6808b0d, 6eccc33):
- `AUTH_TEST_OTP_CODE` (4–6 digits; compose passthrough). With it set, every phone code is that value and nothing is sent. Also adds `POST /api/auth/grmn/signup` (direct signup with audit `customer.signup_unverified`) and `GET /api/auth/grmn/mode`.
- Account page Sign in | Sign up tabs, shown in en/ru/kk. The note reads "SMS codes are not sent yet. Enter code 1234."
- Compact grouped Traffic page (layout A).

Checks run: listed in 4.2. Browser: signup → account; sign-out → phone + 1234 → account (local stack).

Gaps: full `cms-smoke` not run (memory); selectors were checked via Playwright instead. `next build` not run on this branch. Not deployed.

Follow-ups:
- At deploy, add `AUTH_TEST_OTP_CODE=1234` to production.env, then do the usual image rebuild, migrate (no new migrations), and proxy restart.
- When SMS goes live, unset the flag and review accounts with audit `customer.signup_unverified`.
- 84a85cb: the sign-in intro ("We send a one-time code…") is hidden while the no-SMS note shows.
- Screenshots: docs/design-references/2026-11-26-signup-traffic/.
- Proxies (deploy/nginx, edge garmin.conf) have no /api/auth path rules, so the new GET/POST paths pass through.
- Optional review items 4–5: a bordered empty-range note; a 6–23h heatmap on phones.

## Handoff
Work is complete on branch `signup-traffic-ui` (6eccc33, based on beta5 e1892be), but it is not pushed or deployed. Deploy only on the owner's "deploy": first add `AUTH_TEST_OTP_CODE=1234` to /home/nick/grmn-production/production.env, then follow the deploy steps in the grmn-production memory. There are no DB migrations. The `customer-demo-wording` test forbids "test" in customer text.

## Deploy (2026-11-26, owner "deploy")
Live is grmn:1d5e957 / grmn-ops:1d5e957 (built from a clean `git archive`; this was the first `next build` of the branch, and it passed). AUTH_TEST_OTP_CODE=1234 is in production.env. Migrate: no-op (35). Pre-deploy dump: predeploy-signup-traffic-e1892be.dump. Env backup: production.env.bak-e1892be-pre-signup. Live checks: /api/auth/grmn/mode → code 1234. In the browser, signing up on the live site and then signing in with 1234 both worked. The throwaway account cannot be deleted (audit_events is immutable, with an FK on actor), so it was disabled and anonymised. Rollback: `switch-version.sh e1892be` (no DB changes), and optionally remove AUTH_TEST_OTP_CODE. The Traffic admin UI was not opened live (no staff session).
