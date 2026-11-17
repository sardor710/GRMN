# Task 10C handoff: account UI wiring

**Status: complete, 2026-11-17.** The review fix pass is included. **Task 10 is complete.**

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `7d615b9` (Task 10B). 10C is committed on the same branch (see `git log`). No push, merge, deployment, real import or backend activation has been done.

## Files

### New

- `src/lib/account-client.ts` — browser client. It calls only `/api/auth/get-session`, `/api/auth/grmn/phone/{send,verify,complete}`, `/api/auth/change-password`, `/api/auth/sign-out` and `/api/account/{profile,addresses,addresses/:id,orders,orders/:id,phone,claims}`.
  - Every request uses `no-store`. Writes send strict JSON (address create omits `id`/`expectedVersion`; blank optional address fields are omitted).
  - Ids and the cursor are wrapped in `encodeURIComponent`. No call accepts an email, phone or user ID as a selector.
  - Failures become `AccountRequestError(status, code, message)`. A network failure is status 0, and a non-JSON error body still gets a message.
  - `formatKzt` gives exact KZT from minor-unit strings (BigInt, via `formatMinorMoney`), and `—` for null.
  - `deliveryAddressLines` handles structured, legacy-raw and missing snapshots. `COUNTRY_OPTIONS` maps ISO codes to names.
- `tests/unit/account-client.test.mjs` — 5 tests.
- `tests/unit/account-dashboard.test.mjs` — 18 tests. It drives the real component through `tests/helpers/component-fixture.mjs` with a routed fake `fetch`.

### Changed

- `src/components/AccountDashboard.tsx` — rewritten.
  - **Phases:**
    - `loading`.
    - `signed_out`: phone sign-in (send code → verify; `complete_profile` → name/email completion).
    - `unavailable`: a 503 from session or account reads. Nothing is rendered and no mutation is offered.
    - `error`: any partial load failure. Nothing is rendered; it offers "Try again".
    - `ready`.
  - **Profile:** name and email are edited with `expectedVersion`. Phone is read-only, and editing is disabled without a verified phone. An unverified email shows an "Unverified" badge.
  - **Addresses:** create, edit, delete and set-primary, all with versions.
    - After a write succeeds, the list is reloaded best-effort. A failed reload does not turn the success into an error (I2).
    - A 409 on edit reloads the list and swaps in the fresh version (I3).
  - **Orders:** cursor pages ("Load more orders"). The detail modal shows items and exact KZT totals; missing legacy money shows `—`. It also shows the delivery address (structured, legacy raw, or "No delivery address on record"), customer-visible events, and an imported-order note.
  - **Sign-in & Security:**
    - Customers see that there is no password. "Change phone number" texts `phone_change_new` first and then `phone_change_current`, after an E.164 check. On `signedOut:true` the page goes to signed-out with a "sign in with your new number" notice.
    - Staff see "Change password", which calls `/api/auth/change-password` with `revokeOtherSessions:true`, shows the server's real errors, and on success signs out locally and navigates to `/admin/login`.
  - **Claim a previous order:** order UUID, receipt and a fresh `order_claim` code. A failed claim drops the spent code (I6). Each flow's send resets the other flow's challenge, because `request()` consumes every open challenge for that phone (I7).
  - **Sign-out** clears every form and modal state (I1).
  - Devices and Subscriptions say "not available yet". There is no fake data and there are no fake buttons.
- `src/app/account/page.tsx` — mounts `<AccountDashboard />`, with `robots: noindex`. It renders no customer data on the server.
- `tests/unit/auth-entrypoints.test.mjs` — the account-page test now requires the dashboard mount and forbids `data.json`, `seed` and `cms/store` in the page. The dashboard must import `@/lib/account-client` and must not contain `?email=`, `@/lib/cms` or `data.json`.
- `tests/helpers/component-fixture.mjs` — `nodes()` also walks `props.action`, so card header actions are visible to tests. The reviewer confirmed this is safe for the other users of the fixture.
- `tests/ui/cms-smoke.mjs` — new Task 10C section:
  - A signed-out `/account` offers phone sign-in and shows no customer data.
  - A customer session loads its own profile.
  - Creating an address in the UI persists it in PostgreSQL (primary, profile phone) and survives a reload.
  - An owned legacy order appears in history at `43.21 KZT`; its detail shows the legacy raw address and `Subtotal —`.
  - No "Send Reset Link" text appears.
  - Account checks compare lowercased `innerText`, because CSS `uppercase` changes it.
- Docs: the XL plan's Task 10 status and last checkbox, `task-progress.md` and this handoff.

## Commands and results

All runs were from PowerShell. Receipts are in `temp/backend-next-three/10c/` (git-ignored).

| Run | Result | Receipt |
|---|---|---|
| Route test RED | 7 pass / 1 fail: page does not match `/AccountDashboard/` | `red-entry.log` |
| Client tests RED → GREEN | `ERR_MODULE_NOT_FOUND` → 5/5 | `red-1.log`, `green-client.log` |
| Dashboard tests RED | 0/12. The source guard fails, and every render throws on the old component's `formatOrderDate` import | `red-dashboard.log` |
| Slice GREEN | 25/25 (client + dashboard + entrypoints); `tsc --noEmit` exit 0; ESLint on the slice clean | `green-2.log`, `tsc.log` |
| `npm test` before review | 343/343 (21 + 129 + 193), boundaries passed | `npm-test-1.log` |
| `npm run check` before review | exit 0; lint 0 errors / 23 warnings; build lists `○ /account` | `check-1.log` |
| Fix-pass RED | 11 pass / 7 fail (I1, I2, I3, I4/I5, I6/I7, I8, and the strengthened I9 phone-change test) | `fix-red.log` |
| Fix-pass GREEN | 31/31 (slice) | `fix-green.log` |
| Final `npm test` | **349/349** (21 legacy + 135 unit + 193 integration), server/client boundaries passed | `final-test.log` |
| Final `npm run check` | exit 0; lint 0 errors / 23 warnings (the 28 existing warnings dropped to 23); typecheck and build pass | `final-check.log` |
| Browser smoke, first run | Failed at "Signed-out account page did not offer phone sign-in" | `final-smoke` (first run, overwritten) |
| Smoke debug run (`CMS_SMOKE_PUBLIC_ONLY=1`) | Captured `account-body.txt`. The page rendered correctly ("SIGN IN WITH YOUR PHONE"); CSS `uppercase` broke the case-sensitive check. Root cause: test assertion, not the app | `debug-smoke.log`, `account-body.txt` |
| Final browser smoke (full admin + public + account) | exit 0, including "PASS Task10C account page…"; no `Compiling / ...` stall | `final-smoke.log` |

**Disk:** C: had 7.6 GB free before the gates and 7.5 GB before the final run.

## Review

A read-only code reviewer (Opus) reviewed the changed files against the server contracts.

**No Critical findings.** It confirmed:
- Reads are session-owned and `no-store`.
- A failed load shows nothing and offers no mutation.
- Money is exact.
- Customers get no password reset.
- There is no `dangerouslySetInnerHTML`, and the only redirect is the fixed `/admin/login`.
- Sending the new-number code cannot consume the current-number challenge.

**Nine Important findings, all fixed test-first in one pass:**
- **I1** — form state survived sign-out, a shared-device leak. `signedOut()` now resets every form, modal, tab and error. Test "review I1…".
- **I2** — a failed list reload after a successful address write looked like a failed write, which invites duplicates. The write and the refresh are now separate; the modal closes and a refresh warning is shown. Test "review I2…".
- **I3** — a 409 on address edit could never be resolved. The fresh row replaces `editingAddress`. Test "review I3…" (PUT versions `[1, 2]`).
- **I4** — a failed phone change kept spent challenges. They and the codes are cleared, with "Send new codes". Test "review I4/I5…".
- **I5** — the current number was texted before the new number was validated. There is now a client E.164 check, and the new number is texted first. Same test.
- **I6** — a failed claim kept the spent code. It is cleared on any non-network error. Test "review I6/I7…".
- **I7** — one flow's send silently cancelled the other's code. Each send now resets the other flow's challenge. Same test.
- **I8** — mis-encoded characters (`вЂ¦`, `В·`). A PowerShell `Get-Content`/`Set-Content` round trip had read the UTF-8 file as cp1251; the cp1251 mapping was reversed. Test "review I8…" guards the source.
- **I9** — the phone-change test could not catch swapped challenge ids. The routed fake now returns a different id per purpose.

## Rulings

Each ruling below has the cost if it is wrong.
1. **The dashboard shows only fields the API stores.** Country/city/birth date on the profile, "Member since", devices and subscriptions were removed or replaced with "not available yet", against the template's 1:1-look principle, because the profile contract holds only name, email and phone, and fake data is forbidden by the acceptance rule.
   - Cost: a visual difference from the old mock until Task 20 adds the remaining account domains.
2. **The ready state needs all three reads** (profile, addresses, first order page). One failing read means the error state, with no partial account.
   - Cost: a transient orders outage hides the profile too. The user can retry.
3. **Phone sign-in is a real UI, but SMS delivery is not configured** (no provider; O04 and the provider are open), so "Send code" shows the server's 503 message. The smoke signs the customer in by inserting a session directly, not by OTP.
   - Cost: the send/verify happy path is covered only by unit tests until a provider exists.
4. **Staff password success navigates to `/admin/login`.** Every session was revoked (10B ruling 4).
5. **The new number's code is sent before the current number's** (I5).
   - Cost: if the second send fails, the new number got a code that will not be used. Budgets allow 5 sends per 15 minutes.
6. **The claim form asks for the order UUID** ("Order reference") and the receipt that staff hand over out of band (10B ruling 7). There is no staff receipt UI yet (Task 18/19).
7. **The SDD ledger scripts were not used.** The repository's handoff/progress docs are the record for this chain.
   - Cost: none for this single-slice session.

## Deferred minors (not fixed)

From the review:
- **Order detail race.** A slow response for order A can fill the modal after order B is opened. Ignore responses whose id differs from `selectedOrderId`.
- **The claim form is shown to staff**, although the server returns 403 for them. Hide it when `isStaff`.
- **Staff password change:**
  - Success briefly renders the customer sign-in before navigating.
  - A 503 "audit failed" after the credential changed is shown as an error with no redirect.
- **401 from a mutation** (expired session) shows an error instead of moving to signed-out. A 401 from sign-out shows a toast.
- **No retry button** in the `unavailable` state.
- **Toast timer** is never cleared; an earlier timer can cut a later toast short.
- **Dialogs** have no Escape handling, focus trap or focus return. Labels and `role="dialog"`/`aria-modal` are present.
- **Profile 409** refreshes the version but keeps the user's edits, so the next save overwrites the concurrent change without showing it.
- **"Order reference"** should say that the order UUID is needed, not the order number.
- **Test gaps:**
  - Delete-address flow (the fixture's `confirm` returns false).
  - Staff password success path.
  - Load-more orders.
  - The sign-in `complete_profile` branch.

Still open from 10A/10B: see `task-10b.md` "Deferred minors" (receipt not tied to order version, missing audit rows, re-claim key, password-change MFA freshness, dual approval, and the named server test gaps).

**Declined to judge (reviewer):** Better Auth `revokeOtherSessions` internals, `factory.ts` verify internals beyond the returned `state`, `minorToMajor` with negative amounts, and visual fidelity.

## Exact next step

**Task 11 — inventory ledger and race-safe reservations.**
1. Read the Task 11 section of `docs/plans/2026-11-10-postgresql-backend-migration-xl.md` and the plan sections it cites. Read `docs/backend/decisions.md` for any open owner decision Task 11 needs; stop if one is open.
2. Split it into sub-slices if it does not fit one reviewable session.
3. Run the gates from PowerShell. If the smoke stalls on `Compiling / ...`, remove `.next/dev`.
4. **Do not round-trip source files through PowerShell `Get-Content -Raw` / `Set-Content`.** It reads UTF-8 without a BOM as cp1251 and writes a BOM (see I8). Use the Edit tool or Node for scripted edits.

**STOP_AFTER is Task 22.**
