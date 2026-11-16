# Task 09 handoff

Status: **complete — 2026-11-16** (09A catalog/details + 09B blog/home/SEO/static consumers), including the independent review fix pass and final repository/build/browser gates. Implementation was written by Codex; Claude Code closed the remaining verification gates and the review findings.

Commit / branch / working tree: worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, branch `codex/backend-task-02`, base `f05050f`. **Nothing committed** — all Tasks 02–09 work is still uncommitted. No push, merge, deployment, real import or backend activation.

## Files changed in the closing session

- `src/lib/route-params.ts` (new): `decodeRouteParam()`. Next.js handed non-ASCII dynamic segments to pages still percent-encoded, so `/blog/қазақша-…` returned 404.
- `src/server/public-input.ts` (new): `isInvalidPublicInput()` / `readOr()`. Invalid public filter/cursor/key (`AuthFailure` 400) becomes a not-found fallback; real failures still throw.
- `src/app/blog/[slug]/page.tsx`, `src/app/p/[id]/page.tsx`: decode route params in both `generateMetadata` and the page; `/p` guards the detail read.
- `src/app/c/[...slug]/page.tsx`, `src/app/compare/page.tsx`, `src/app/blog/page.tsx`: invalid filters/cursors give 404 instead of 500.
- `src/proxy.ts`: malformed URIs and invalid redirect sources (spaces/control chars) pass through to normal 404 handling; only genuine failures return 503.
- `src/app/sitemap.ts`: category URLs generated from real `catalogues` (five hard-coded `/c/*` URLs were 404s).
- Tests: `tests/unit/route-params.test.mjs`, `tests/unit/task09-review-fixes.test.mjs` (new); `tests/ui/cms-smoke.mjs` gained real-HTTP 404 / no-503 assertions.

## Checks run and actual results

- Public browser smoke (first rerun): FAIL "Unicode URL failed" — Next log `GET /blog/%D2%9B… 404`. Root cause: encoded param. Fixed RED→GREEN (`route-params.test.mjs`); rerun PASS.
- Review fixes: `task09-review-fixes.test.mjs` 5 fail / 1 pass (503 control) RED → 6/6 GREEN; typecheck clean.
- Final `npm test` (PowerShell) exit 0: **300/300** = 21 legacy + 110 unit + 169 PostgreSQL integration; server/client boundaries passed (`temp/backend-next-three/09/claude-final-test.log`).
- Final `npm run check` exit 0: lint/typecheck/build pass, same 28 pre-existing lint warnings (`claude-final-check.log`).
- Final full admin+public Chrome smoke exit 0 against disposable PostgreSQL + real Next (`claude-full-smoke.log`): Task 08 admin flows; Task 09 catalog/filters/Compare/exact JSON-LD KZT/sitemap/404/Unicode/admin-created product visible without rebuild; new invalid-input 404 and malformed-URL non-503 checks.
- Run `npm test` from PowerShell/cmd. Under Git Bash, MSYS rewrites `whoami /user /fo csv /nh`, failing 6 migration-export tests for environmental reasons only.

## Review (independent code-reviewer, read-only)

No Critical. Four Important fixed in one TDD pass (above): undecoded `/p/[id]`; 500 on invalid public input/stale cursors; proxy 503 on malformed/space URLs; dead sitemap category URLs.

Rulings:
- Invalid/stale public cursors return 404 rather than silently restarting at page 1, so a tampered cursor is not crawled as a duplicate first page. Cost if wrong: a user holding a cursor across a USD rate-version change sees 404 instead of page 1.
- On `/compare`, a failed `getProductsByKeys` (bad `selected` value) falls back to an empty selection rather than 404, so one bad value does not hide the page.

Deferred minors (not fixed): Postgres blog listing ordered by UUID rather than `publishedAt`; static `getPost()` metadata overrides DB blog fields when slugs match; sitemap blog URLs not encoded; `getProductsByKeys` loses key order (Compare/related order); `/p` detail query runs twice (wrap in React `cache()`); uncached redirect lookup on every public request (Section 8 TTL); redirects drop the query string; filtered/cursor pages lack canonical/noindex; product canonical host hard-coded to `www.garmin.com` vs `NEXT_PUBLIC_SITE_URL`; `generateStaticParams` capped at 100 (unverified whether called under `force-dynamic`); `ProductTop` receives the full detail DTO.

## Environment notes

C: had ~4 GB free (98%) when this session started — the cause of Codex's earlier "disk pressure" browser failures. Keep C: space available for builds and Chrome profiles; `temp/` holds old receipts.

## Next task and prerequisites

Task 10 (customer profiles, addresses, order ownership), 10A then 10B in separate sessions. **First commit this worktree on `codex/backend-task-02`**: Tasks 02–09 exist only as uncommitted files in a Codex-managed worktree. Stop before Task 11.
