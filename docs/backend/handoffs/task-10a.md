# Task 10A handoff: account APIs and ownership

**Status: complete, 2026-11-17.** The review fix pass is included.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `b92fd0e` (Tasks 02–09).

**Nothing in 10A is committed.** It waits for the owner's confirmation. No push, merge, deployment, real import or backend activation has been done.

**Out of scope here (Task 10B):** AccountDashboard UI wiring, legacy-order claims, verified phone change and recovery, and the credential-reset flow. Task 11 has not started.

## Files

### New

- `src/server/account/service.ts` — `createAccountService({database, authorize, secret})`.
  - The owner is always `principal.userId`, taken from the verified session.
  - Profile:
    - `getProfile` and `saveProfile` use CAS, with `expectedVersion` 0 meaning create.
    - The phone must equal the session's verified phone.
    - The email is stored as an *unverified* contact.
  - Addresses:
    - `listAddresses`, `saveAddress` (create, or edit with id + version) and `deleteAddress` (with version).
    - At most 5 addresses, exactly one primary.
    - Each write locks the owner row first, inside `BEGIN ISOLATION LEVEL READ COMMITTED`.
  - Orders:
    - `getOwnOrders` is paginated: default 20, maximum 100. Cursors are HMAC-signed, carry microsecond timestamps and are bound to the user.
    - `getOwnOrder` returns customer-visible snapshots only: flat string options, `visibility='customer'` events, and no legacy, provider or internal fields.
- `src/server/account/http.ts` — `createAccountHandler({service, baseURL})`.
  - Writes need the same-origin `Origin` header (403 otherwise).
  - Query allowlist: `orders` accepts only `limit` and `cursor`; any other parameter, such as `email` or `userId`, is a 400.
  - Bodies may not carry an `id`. A resource the caller does not own is a 404.
  - Responses send `Cache-Control: no-store`.
- `src/server/account/runtime.ts` — Next wiring. It returns 503 unless `CMS_BACKEND=postgres` and `AUTH_ENABLED=1`, with no shared or demo fallback.
- `src/app/api/account/{profile,addresses,addresses/[id],orders/[id]}/route.ts` — thin `handleAccountRequest` bindings. `orders/route.ts` replaces the old 503 stub.
- `drizzle/0006_account-ownership.sql`, `drizzle/meta/0006_snapshot.json`, plus a `_journal.json` entry:
  - New column `customer_profiles.email_verified_at`.
  - BEFORE trigger `customer_addresses_guard` (insert/update): READ COMMITTED required, owner immutable, owner-row lock, at most 5 addresses.
  - Deferred constraint trigger `customer_addresses_primary_required` (insert/update/delete): a nonempty address book has exactly one primary.
  - Constraint names surfaced in errors: `customer_addresses_limit`, `_primary_required`, `_owner_immutable`, `_isolation`.
- `tests/integration/account-services.test.mjs` — renamed from the draft `account-services.pending.mjs`. It holds 12 tests.
- `tests/integration/account-claims.pending.mjs` — the draft's 10B tests (legacy claim, phone change, phone recovery, password change), still excluded from the test glob. Fix its `order()` fixture before use (see the rulings).

### Changed

- `src/contracts/commerce.ts`:
  - `CustomerProfileDTO.id` and `.phone` are now nullable, and `emailVerified` is new.
  - `OrderDetailDTO` subtotal/discount/shipping/tax and `deliveryAddress` are nullable, for legacy history only.
  - New error code `ADDRESS_LIMIT_REACHED`.
- `src/server/db/schema/customers.ts` — `emailVerifiedAt`.
- `src/server/cms/service.ts` — the staff error for account-linked contacts no longer calls them "verified".
- `tests/unit/auth-entrypoints.test.mjs` — every account route binds the handler and returns 503/no-store in legacy mode or with auth off, even when an `?email=` selector is present.
- Docs: the XL plan's Task 10 checkboxes and completion line, `task-progress.md`, `auth-integration.md`, and this handoff.

## Commands and results

All runs were from PowerShell. Receipts are in `temp/backend-next-three/10a/`.

**TDD runs on `account-services.test.mjs`:**

| Run | Result | Receipt |
|---|---|---|
| RED | 0/10 (no service, no DB triggers) | `red-1.log` |
| GREEN | 10/10 | `green-1.log` |
| Fix-pass RED | 10 pass / 2 fail: isolation not enforced; `emailVerified` missing | `fix-red.log` |
| Fix-pass GREEN | 12/12 | `fix-green.log` |

**Account routes unit test:** RED (ENOENT, files missing), then GREEN. Receipts: `red-routes.log`, `green-routes.log`.

**Full `npm test`:**
- Before the fix pass: 311/311, boundaries passed (`npm-test-1.log`).
- Final: **313/313** (21 legacy + 111 unit + 181 integration), and server/client boundaries passed (`final-test.log`).

**`npm run check`:** exit 0 — lint 0 errors / 28 existing warnings, typecheck and build all pass. The build route list includes the five `/api/account/*` handlers (`final-check-2.log`).

**Drizzle drift check:** `drizzle-kit generate` printed "No schema changes".

**Browser smoke** (`node --conditions=react-server tests/ui/cms-smoke.mjs`):
- **First two runs failed:** both timed out on `CDP timeout: Page.navigate` while `next dev` sat on "Compiling / ..." for more than 240 s.
- **Diagnosis:**
  - In isolation, `/blog` compiled in 3 s while `/` never finished.
  - Nothing under `src/app`, `src/components` or `src/lib` is touched by 10A besides the account routes.
  - After the stale Turbopack dev cache was renamed to `.next/dev-stale-10a`, `/` compiled in 6.3 s.
- **Third run: exit 0** — full Task 08 admin and Task 09 public flows passed (`final-smoke-3.log`).
- `.next/dev-stale-10a` can be deleted.

**Disk:** C: had about 9.6 GB free throughout.

## Review

A read-only identity-access-engineer reviewed the 10A files for ownership, IDOR and concurrency.
- **No Critical or Important findings as labelled.** It confirmed:
  - All owner-scoped SQL is keyed on `principal.userId`.
  - A foreign address returns 404 before the version check, so there is no cross-user 409/404 oracle.
  - Order children are read only after the owner-scoped header query.
  - Cursors are bound to the user.
  - Lock order is consistent for the service.
  - Address edits cannot reach `order_addresses`, which the 0002 immutability triggers protect.
- **Two findings re-graded Important by effect and fixed in one TDD pass:**
  - **M1:** The DB limit and primary counts relied on READ COMMITTED, but nothing enforced it. Under a REPEATABLE READ server default, two concurrent inserts could both count 4 and create a sixth address.
    - Fix: the service begins READ COMMITTED explicitly, and both triggers fail closed under any other isolation.
    - Test: "address writes fail closed outside READ COMMITTED…", RED→GREEN. It covers a raw RR insert being rejected, and a service write still succeeding under an RR database default.
  - **M4:** A customer-typed profile email was indistinguishable from a verified contact. Staff UI wording called it "verified", and the 0004 notification trigger matches on `customer_profiles.email`.
    - Fix: new column `email_verified_at`. It is NULL on create and reset whenever the email changes. The DTO gains `emailVerified`, and the CMS wording is corrected.
    - Test: "a customer-typed profile email is recorded as unverified…", RED→GREEN.

## Rulings

Each ruling below has the cost if it is wrong.
1. **Split the draft test.**
   - The 10A tests went into `account-services.test.mjs`. The four 10B tests stayed in `account-claims.pending.mjs`.
   - The user scoped this session to 10A.
   - Cost: the 10B draft is still unvalidated.
2. **Fixed the draft's order fixture.**
   - Complete orders are now inserted in one transaction with a structured address and lines. The deferred `orders_seal` trigger rejected the draft's autocommit inserts.
   - Cost: none, because the fixture now matches the schema contract.
3. **The profile email is an unverified contact on `customer_profiles`.**
   - It is never written to `users.email`, which is the login identity, and never marked verified.
   - Cost: the login email and the contact email can diverge until 10B or a later email-verification flow.
4. **The profile phone must equal the session's verified phone; otherwise 400.** Phone change belongs to 10B.
   - Cost: users with no verified phone, such as email-only staff accounts, cannot save a customer profile.
5. **`isPrimary:false` on the current primary is a no-op.**
   - The primary moves only when another address is selected or the primary is deleted. Deleting the primary promotes the oldest remaining address.
   - Cost: the UI must explain this, or users may expect "unset primary" to work.
6. **Order ownership is `orders.user_id` only.**
   - A profile link or a matching contact phone/email grants nothing.
   - Cost: provisional and legacy orders stay invisible to customers until the 10B audited claim.
7. **Error codes for bad IDs and cursors.**
   - A forged, tampered or foreign cursor returns 400. A malformed order ID or delete address ID returns 404.
   - Cost: a stale cursor makes the client restart from page 1.
8. **No `audit_events` for customer self-service profile and address writes.**
   - Login identity and phone cannot change in 10A.
   - Cost: there is no trail of address edits. Revisit in 10B when the phone can change.
9. **`originalUsdEquivalent` is always null in 10A.** USD snapshots belong to Task 13B.
   - Cost: none until checkout writes snapshots.
10. **Legacy mode keeps the account API at 503. The unmounted `AccountDashboard.tsx` is untouched** — it still has its `?email=` fetch and demo literals.
    - That component is 10B's UI wiring. No server path honours `?email=` any more.
    - Cost: if someone mounts the old dashboard before 10B, it shows demo literals, but those are not server data.
11. **Contract changes** (nullable legacy money/address, profile id/phone, `emailVerified`, `ADDRESS_LIMIT_REACHED`).
    - The rule is never to invent values for legacy rows.
    - Cost: 10B UI consumers must handle nulls.
12. **The 0006 snapshot is hand-derived from 0005 plus the new column.** The drift check confirmed it matches the schema.
    - Cost: none observed.
13. **Address writes outside READ COMMITTED are rejected** with constraint `customer_addresses_isolation`, which surfaces as a 503.
    - Cost: an operational tool that runs REPEATABLE READ cannot write addresses.
14. **The smoke failure was a stale Turbopack dev cache**, set aside rather than deleted.
    - Cost: the same hang may recur for other sessions with an old `.next/dev`. Remove that directory if `Compiling / ...` stalls.

## Deferred minors (not fixed)

- **M2 — lock order.** The triggers lock `users` after the address row, which is the reverse of the service order. Today the service is the only writer. Rule for any future writer (admin tools, 10B claims): lock the owning `users` row first, or deadlock (503) is possible.
- **M3 — malformed PUT ID.** `PUT /api/account/addresses/not-a-uuid` returns 400, while DELETE returns 404. It is inconsistent but leaks nothing, and it is untested.
- **M5 — pool pressure.**
  - There is no per-user rate limit on account writes.
  - Parallel writes for one user hold pool connections while waiting on the owner lock; the pool max defaults to 5.
  - `getOwnOrder` runs three concurrent pool queries. One connection would give both a consistent snapshot and less pool use.
  - Belongs with Task 21 hardening.
- **M6 — cursor contents.** The cursor payload contains the user's own UUID in base64 and has no expiry.
- **M7 — error wording.** DB faults (deadlock, serialization, timeout) surface as 503 "Authentication is unavailable". The response is safe, but the wording is misleading.
- **M8 — test gaps.** In each case below, a protection could be removed and the current tests would still pass:
  - A tampered-payload or garbage-signature cursor (the existing test is satisfied by the user-binding check alone).
  - A write with no `Origin` header, or `Origin: null`.
  - The primary race asserts no success count.
  - Promotion of the oldest address is not asserted with three or more addresses.
  - A deterministic two-connection version of the raw concurrent-insert test.
  - The malformed PUT ID.
  - A suspended `customer_profiles.status`.
- **Declined to judge, left as is:**
  - Whether `url.origin !== baseURL` holds behind a production reverse proxy. The CMS handler uses the same check. Verify at deployment (Task 22/23).
  - Whether `customer_profiles.status` of suspended/pending should block self-service. There is no requirement yet.
  - Whether imported legacy option strings can contain internal data. Reconcile on import.

## Exact next step

1. The owner confirms the commit of 10A on `codex/backend-task-02`. Only the files listed above are included; `temp/` is git-ignored.
2. In a new session, start **Task 10B** from `tests/integration/account-claims.pending.mjs`:
   - Fix its `order()` fixture first (one transaction, structured address).
   - Then implement audited legacy claims, verified phone change and recovery, and a real credential change.
   - Finally, wire `AccountDashboard.tsx` to `/api/account/*` with loading, empty and error states, removing its `?email=` fetch and literals.
   - Keep account mutation disabled on failure.
3. Run the gates from PowerShell. If the browser smoke stalls on `Compiling / ...`, remove `.next/dev`.
4. Stop before Task 11.
