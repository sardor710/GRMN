# Traffic analytics + campaign link builder — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done – partial | 4 | 8/8 | 2026-11-25 | Owner: rerun full smoke when memory allows; then "deploy" (+ edge nginx 8k body limit on /api/t) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

- **Goal (owner's words, 2026-11-25):** know which source brings the most clicks. Google/Yandex have their own analytics, but Instagram posts, stories and ads cannot be tracked today. Gather every source in one place in the GRMN admin.
- **Approach chosen by owner:** A — built into the GRMN store (first-party tracker → own PostgreSQL table → admin screens). Rejected: B self-hosted Umami/Plausible (extra service on shared VPS, rollups don't match), C server-log only (bots/link-preview crawlers inflate, no reliable device data).
- **Deliverables:**
  1. **Tracker** on every storefront page (`/[lang]/…`), firing on full loads *and* client-side navigations. Sends path, referrer, UTM params, click IDs, locale, product id (on product pages) to a public collect endpoint.
  2. **Visitor cookie** (first-party, owner approved cookies): anonymous visitor id (13 months) + a visit/session id (30 min idle). Short cookie notice banner in EN/RU/KK (informational, "OK" dismiss; tracking is first-party only).
  3. **Storage**: `traffic_events` table (one row per page view) via a migration; retention 13 months, older rows pruned by the existing ops/scheduled job.
  4. **Admin ▸ Traffic** page (new sidebar item), date range picker (today / 7d / 30d / custom), showing:
     - **Sources:** clicks per platform (Google, Yandex, Instagram, Facebook, Telegram, Other referral, Direct), expandable to **format** (post / story / reels / bio / ad / …) and **campaign**; platform total = sum of its campaigns + untagged clicks.
     - **Visits over time:** per day chart; **by hour of day** and **by weekday** (heat-grid hour × weekday).
     - **Top product pages:** most viewed products (name, views, unique visitors).
     - **Devices:** OS (Windows, macOS, Android, iOS, Linux, Other) and device type (mobile / desktop / tablet).
     - Headline tiles: clicks (landings), unique visitors, page views.
  5. **Admin ▸ Traffic ▸ Link builder:** pick platform, format, campaign name, target page (any store URL/product) → tagged link to copy (`?utm_source=instagram&utm_medium=story&utm_campaign=fenix9-december`). Saved links listed with their click counts; campaigns roll up to their platform. Includes the snippet for Meta Ads Manager "URL parameters".
- **Definitions (fixed):**
  - **Click = landing** = the first page view of a visit (new session). Campaign and platform counts are landings, so campaigns sum exactly to the platform total (owner: 5 campaigns × 200 = Instagram 1 000). Unique visitors shown as a secondary figure (they do not sum across campaigns).
  - **Source is decided at landing** and carried for the whole visit; later pages (own-site referrer) inherit it. Precedence: `utm_source` → click id (`fbclid` → Meta, `gclid` → Google, `yclid` → Yandex) → in-app browser user agent (`Instagram` → Instagram, `FBAN`/`FBAV` → Facebook) → referrer host (google.*, yandex.*/ya.ru, instagram.com/l.instagram.com, facebook.com/l.facebook.com/m.facebook.com/fb.me, t.me/telegram) → Other referral (host kept) → Direct.
  - `utm_source` spellings normalised to one platform (ig, insta, instagram → Instagram; fb, facebook → Facebook; …); unknown values kept as their own platform name.
  - `fbclid` is added by Meta to outbound links generally (not only ads) and does not tell Instagram from Facebook — so untagged fbclid-only clicks count as "Meta (unspecified)" unless UA/referrer resolves it. *(Correction of what I told the owner earlier: fbclid ≠ ad-only.)*
  - Product views keyed by **product id**, not URL (survives `/p/<uuid>` → `/p/{code}` and `/ru` `/kk` prefixes).
  - Hours/weekdays bucketed in store-local time `Asia/Almaty` (UTC+5), server stores UTC.
- **Constraints:**
  - Live is `homepage-deploy` (e73a53e); `beta5` holds unshipped migrations 0029 (when 1795419564832) and 0030 (1795450413871). Drizzle (verified `node_modules/drizzle-orm/pg-core/dialect.js:62`) applies a migration only if `last applied created_at < journal when`. → The traffic migration goes on `homepage-deploy` with a `when` **between** 0028 (1795375500228) and 0029, SQL idempotent (`IF NOT EXISTS`). At merge into `beta5`, add a re-apply migration after 0030 with the same idempotent SQL so a DB already at 0030 also gets the table. Grants come from `ALTER DEFAULT PRIVILEGES` in `deploy/db/10-roles.sh` (grmn_app gets SELECT/INSERT/UPDATE/DELETE automatically).
  - Collect endpoint is public: validate & cap every field (pattern of `src/server/public-input.ts`), body size limit, per-IP rate limit; never store IP or full UA (only parsed OS/device/browser family). Bots (UA bot patterns, link-preview fetchers) dropped.
  - Not counted: `/admin`, `/api`, signed-in staff sessions, prerender/prefetch.
  - Admin HTTP handlers build URLs with `requestURL()`; admin access via existing `authorizeAdminPage` / permission model.
  - No `$` anywhere customer-facing; admin UI in the existing Garmin admin style.
  - New client strings namespace must be added to `CLIENT_NAMESPACES` in `src/app/[lang]/layout.tsx`.
  - Deployment is a separate owner-triggered step ("deploy"), staging rehearsal first.
- **Non-goals:** orders/revenue per source (owner: clicks only); importing Google/Yandex/Meta platform data via their APIs; historic data before launch; A/B tests; per-person tracking or profiles; consent-gated blocking (banner is informational).
- **Assumptions:** traffic volume is small (hundreds–low thousands of views/day) → plain SQL aggregation over a raw table with indexes is enough, no rollup tables. Admin traffic page reachable by roles that can read reports (orders:read) — builder may add a dedicated permission if the permission model makes that trivial.
- **Open questions:** none blocking.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Source classifier maps UTM/click-id/UA/referrer cases to the right platform/format/campaign by the precedence above, incl. spelling normalisation | auto | unit tests |
| A2 | UA parser yields correct OS + device type for Windows/macOS/Android/iOS/iPadOS/Linux sample UAs; bots rejected | auto | unit tests |
| A3 | Collect endpoint rejects oversized/invalid input, ignores staff + `/admin`, rate-limits, stores no IP | auto | integration tests |
| A4 | Landing = first view of a session; later views inherit source; campaigns sum to platform total | auto | integration test with seeded events |
| A5 | Report queries: daily series, hour×weekday in Asia/Almaty, top products by product id, OS/device shares | auto | integration tests |
| A6 | Migration applies on a DB at 0028 (homepage-deploy line) and beta5's 0029/0030 still apply afterwards; re-apply migration on a DB at 0030 creates the table | auto/manual | staging DB copies, `drizzle-kit migrate` both orders |
| A7 | Tracker fires on full load and client-side navigation; one event per view | auto | CMS smoke (Playwright) |
| A8 | Admin ▸ Traffic and Link builder render with data, copy link works, built link lands and is attributed to its campaign | auto | CMS smoke |
| A9 | Typecheck, lint, existing unit + integration + smoke suites pass | auto | `npm run check`, `npm run test:integration`, `npm run test:cms-ui` |
| A10 | Cookie notice shows once in EN/RU/KK, dismiss persists | auto | smoke |

Manual spot checks (owner, after deploy):
- From a phone, tap a **tagged** link in an Instagram story and an **untagged** link (bio/sticker without UTM) → both appear under Instagram; the tagged one under its campaign; platform total = campaigns + untagged.
- Same from a Facebook post. Visit from a Windows PC and an iPhone → devices split correctly.
- Staff browsing while signed in does not move the numbers.

## 3. Anti-drift
- **Primary objective:** the owner can see, in the GRMN admin, how many clicks each platform — especially Instagram and Facebook, broken down by format and campaign — sends, plus when people visit, which products are viewed most, and on what devices.
- **Proxy signals (not success by themselves):** tests green; a `curl` with `utm_source` being counted; charts rendering with seeded data; build passes. Success = real phone taps from Instagram/Facebook land in the right buckets on the live site.
- **Intended scope:** GRMN `homepage-deploy` line (worktree `/home/nick/worktrees/grmn-homepage-deploy`): tracker + cookie notice (storefront), collect API, traffic schema/migration, report service, Admin ▸ Traffic + Link builder, retention prune, tests. Plus the beta5 re-apply migration noted for the merge.
- **Completion target:** full delivery on the branch, verified on staging; production deploy only on the owner's "deploy".

## 4. Modules and skill map

**Architecture:** a client tracker sends one beacon per page view to `POST /api/t`. The server decides the visit: no valid session cookie, an expired one (30 min idle), or new campaign params → new `traffic_sessions` row (= one **click**), classified once. Every view → a `traffic_views` row. Reports are SQL over these two tables in `Asia/Almaty`. Saved builder links live in `traffic_links`.
**Tech:** Next.js 16 route handlers, pg Pool + drizzle schema/migrations, zod, node:test with temporary Postgres (`startCatalogFixture` pattern), Playwright CMS smoke, hand-drawn SVG charts as in `DailyRevenueChart.tsx`.

| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Schema + migration | 3 tables, idempotent migration with `when` 1795400000000 | `agent_direct` (owner), `database-optimizer` checklist for indexes (support) | `src/server/db/schema/traffic.ts`, `drizzle/0029_traffic-analytics.sql`, `drizzle/meta/*` | – |
| M2 Classifier + UA parser | pure functions: source + device | `superpowers:test-driven-development` (owner) | `src/server/traffic/classify.ts`, `src/server/traffic/user-agent.ts`, `tests/unit/traffic-*.test.mjs` | – |
| M3 Collect + retention | `/api/t`, cookies, staff/bot/admin skip, rate limit, prune job | `superpowers:test-driven-development` (owner), `appsec-engineer` review of the public endpoint (verifier) | `src/server/traffic/collect.ts`, `src/app/api/t/route.ts`, `src/server/operations/registry.ts`, `tests/integration/traffic-collect.test.mjs` | M1, M2 |
| M4 Reports + links API | report views + builder links service, admin API | `superpowers:test-driven-development` (owner) | `src/server/traffic/reports.ts`, `src/server/traffic/links.ts`, `src/server/traffic/runtime.ts`, `src/app/api/admin/traffic/route.ts`, `src/server/auth/admin-runtime.ts`, `tests/integration/traffic-reports.test.mjs` | M1, M2 |
| M5 Storefront tracker + notice | beacon on load + client nav, product id marker, cookie notice EN/RU/KK | `frontend-developer` (owner) | `src/components/traffic/*`, `src/app/[lang]/layout.tsx`, `src/app/[lang]/p/[id]/page.tsx`, `messages/*.json` | M3 (contract only) |
| M6 Admin Traffic + Link builder UI | `/admin/traffic`, `/admin/traffic/links`, sidebar item | `frontend-developer` (owner), `dataviz` skill (support) | `src/app/admin/traffic/**`, `src/components/admin/AdminSidebar.tsx` | M4 |
| M7 E2E + migration rehearsal | smoke block `traffic`, both migration orders on staging copies, beta5 re-apply branch | `evidence-collector` (verifier), `superpowers:verification-before-completion` | `tests/ui/cms-smoke.mjs`, local branch `beta5-traffic-reapply` | M1–M6 |
| Review | whole-branch review | `code-reviewer` + `superpowers:requesting-code-review` (verifier) | read-only | M7 |

Gaps: none. Real-phone Instagram/Facebook checks are owner manual spot checks after deploy (cannot be automated here).

Waves (≤2 parallel, disjoint scopes). Default execution is serial in this session; the parallel pairs may be split into worktree agents if useful:
- Wave 1: M1 ‖ M2
- Wave 2: M3 ‖ M4 (shared file: none — M3 touches `registry.ts`, M4 touches `admin-runtime.ts`)
- Wave 3: M5 ‖ M6
- Wave 4: M7, then Review

## 5. Tasks

**Global constraints (every task):** TypeScript strict, no `any`; `import "server-only"` in server modules; admin handlers build URLs with `requestURL()`; never store IP or raw UA; no `$` in customer copy; store time zone constant `STORE_TIME_ZONE = "Asia/Almaty"`; retention 13 months; session idle 30 min; visitor cookie 13 months.

**Review focus (failure modes no happy-path test covers — each pinned by a test in its owning task):**
1. A visitor clicks a second tagged link while a session is still alive → must start a **new** session credited to the new campaign (M3 test `new campaign params start a new visit`).
2. Instagram in-app browser with no referrer and no UTM → Instagram, not Direct (M2 test `in-app UA wins over empty referrer`).
3. Same product under `/p/<uuid>`, `/ru/p/<uuid>`, `/kk/p/<uuid>` → one product row (M4 test `product views merge across locales`).
4. A view at 23:30 UTC lands on the next Almaty day/hour (04:30) (M4 test `buckets in Asia/Almaty`).
5. Garbage/oversized beacon, wrong origin, or a signed-in staff browser → 204/400 with no row (M3 tests).

### M1 — Schema + migration (wave 1, owner: agent_direct)
> ✅ 5613be3 — database.test 4/4; migration re-applied twice on a temp DB without error; journal `when` 1795400000000.
**Files:** Create `src/server/db/schema/traffic.ts`, `drizzle/0029_traffic-analytics.sql`, `drizzle/meta/0029_snapshot.json`; Modify `drizzle/meta/_journal.json`.
**Produces:** tables
- `traffic_sessions(id uuid pk, visitor_id uuid not null, started_at timestamptz not null default now(), last_seen_at timestamptz not null, platform text not null, medium text, campaign text, referrer_host text, landing_path text not null, locale text, os text not null, device_type text not null, browser text, views integer not null default 1)` — indexes `(started_at)`, `(platform, started_at)`, `(visitor_id)`; checks on lengths (platform ≤40, medium/campaign ≤80, host ≤253, path ≤512), `device_type IN ('mobile','tablet','desktop')`.
- `traffic_views(id uuid pk, session_id uuid not null references traffic_sessions(id) on delete cascade, occurred_at timestamptz not null default now(), path text not null, product_id uuid, locale text)` — indexes `(occurred_at)`, `(product_id, occurred_at)`, `(session_id)`. No FK to products (a deleted product must not delete history).
- `traffic_links(id uuid pk, platform text not null, medium text not null, campaign text not null, target_path text not null, label text, created_by text, created_at timestamptz default now(), archived_at timestamptz)` — unique `(platform, medium, campaign, target_path)` where archived_at is null.
- [x] Write the drizzle schema, run `npx drizzle-kit generate --name traffic-analytics` (offline generate needs no DB; if it asks for one, set a dummy `DATABASE_MIGRATION_URL`). Verify the generated file is `0029_traffic-analytics.sql`.
- [x] Hand-edit the SQL: every `CREATE TABLE`/`CREATE INDEX` → `IF NOT EXISTS`; FKs/constraints wrapped in `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$`. Header comment: additive, older images ignore it.
- [x] Set its journal `when` to `1795400000000` (between 0028 `1795375500228` and beta5's 0029 `1795419564832`) — verify: `node -e` prints the journal tail in ascending `when`.
- [x] Verify: `npm run test:integration -- tests/integration/database.test.mjs` passes (migrates a fresh DB through 0029), and applying the SQL file twice by hand on that temp DB raises no error.
- [x] Commit `feat(traffic): schema and idempotent migration for visits, page views and campaign links`.

### M2 — Classifier + UA parser (wave 1, owner: TDD)
> ✅ f598ad8 — traffic-classify 6/6, traffic-user-agent 3/3; unit suite 625 pass / 0 fail.
**Files:** Create `src/server/traffic/classify.ts`, `src/server/traffic/user-agent.ts`, `tests/unit/traffic-classify.test.mjs`, `tests/unit/traffic-user-agent.test.mjs`.
**Produces:**
- `type Platform = "Google" | "Yandex" | "Instagram" | "Facebook" | "Meta" | "Telegram" | "Other referral" | "Direct" | string` (unknown utm_source kept, title-cased, ≤40 chars).
- `classifySource(input: { url: URL; referrer: string | null; userAgent: string; ownHost: string }): { platform: string; medium: string | null; campaign: string | null; referrerHost: string | null }` — precedence: utm_source → fbclid (Meta, refined by UA/referrer to Instagram/Facebook) / gclid (Google) / yclid (Yandex) → UA (`Instagram` → Instagram; `FBAN|FBAV|FB_IAB` → Facebook) → referrer host (own host = ignored) → Other referral → Direct. Medium from utm_medium (normalised lowercase; `cpc|paid|ad|ads` → `ad`), else `organic` for search engines, `referral` otherwise, null for Direct. utm_source aliases: `ig|insta|instagram` → Instagram, `fb|facebook` → Facebook, `google` → Google, `yandex|ya` → Yandex, `tg|telegram` → Telegram.
- `parseUserAgent(ua: string): { os: "Windows"|"macOS"|"iOS"|"iPadOS"|"Android"|"Linux"|"Other"; deviceType: "mobile"|"tablet"|"desktop"; browser: string | null; bot: boolean }`.
- [x] Tests first (table-driven): `utm_source=ig&utm_medium=Story&utm_campaign=fenix9-december` → `{Instagram, story, fenix9-december}`; `?fbclid=x` + UA `Instagram 300.0` → Instagram; `?fbclid=x` + plain Chrome UA → Meta; referrer `https://l.instagram.com/` → Instagram; `https://www.google.kz/` → Google/organic; `https://yandex.kz/search` and `https://ya.ru/` → Yandex; `https://t.me/x` → Telegram; `https://garmin.2well.cloud/c/x` (own host) → Direct; `https://example.org/` → Other referral, host example.org; **`in-app UA wins over empty referrer`** (UA `… Instagram 312.0.0 …`, no referrer) → Instagram; `?utm_source=Newsletter` → `Newsletter`. UA samples for Windows Chrome, macOS Safari, iPhone, iPad (both old `iPad` UA → iPadOS/tablet), Android phone (`Mobile`), Android tablet (no `Mobile`), Linux, Googlebot / `facebookexternalhit` / `TelegramBot` / `HeadlessChrome` → `bot: true`.
- [x] Run `npm run test:unit` — new tests fail; implement; run again — pass.
- [x] Commit `feat(traffic): source classifier and user-agent parser`.

### M3 — Collect endpoint + retention (wave 2, owner: TDD; verifier: appsec-engineer)
> ✅ 5a8ed48 + 474f44d (appsec fixes: bounded body, new-visit limit 10/min per address, IPv6 by /64, unknown product ids dropped, admin look-alike paths ignored, exact session cookie) — traffic-collect 13/13.
**Files:** Create `src/server/traffic/collect.ts`, `src/app/api/t/route.ts`, `tests/integration/traffic-collect.test.mjs`; Modify `src/server/operations/registry.ts` (new job `TRAFFIC_PRUNE_KIND = "traffic.prune"`, every 86 400 000 ms).
**Interfaces:** consumes M1 tables, `classifySource`, `parseUserAgent`, `enforceRateLimit`/`trustedClientAddress`, `getSessionIdentity`.
**Produces:**
- Beacon body (JSON, `text/plain` via `navigator.sendBeacon`, ≤4 KB): `{ v: 1, url: string /* full page URL */, referrer: string, productId?: string /* uuid */, locale?: "en"|"ru"|"kk" }`.
- `createTrafficCollector({ pool, isStaff(headers): Promise<boolean>, ownHost, now? })` with `collect(headers: Headers, body: unknown, cookies: { vid?: string; sid?: string }): Promise<{ stored: boolean; setCookies: { vid: string; sid: string } | null }>`.
- `POST /api/t` → always `204` on accepted-or-ignored, `400` on invalid body, `403` on foreign `Origin`, `429` on rate limit (60/min per trusted IP; skipped when no trusted proxy configured). Cookies: `grmn_vid` (uuid, Max-Age 34 128 000 = 395 days), `grmn_sid` (uuid, Max-Age 1800, refreshed on every view), both `Path=/; SameSite=Lax; HttpOnly; Secure` in production.
- Rules: ignore when bot, path starts `/admin` or `/api`, header `Purpose: prefetch` / `Sec-Purpose` contains `prefetch`, or `isStaff`. New session when: no/unknown `sid`, `last_seen_at` older than 30 min, or the URL carries utm_source/fbclid/gclid/yclid whose classification differs from the session's (platform, medium, campaign). Otherwise append view, bump `views` and `last_seen_at`.
- `pruneTraffic(pool, { olderThanMonths = 13 })` deletes sessions with `started_at < now() - interval '13 months'` (views cascade).
- [x] Tests first: first beacon creates 1 session + 1 view and returns both cookies; second beacon with `sid` appends a view to the same session; `sid` older than 30 min → new session; **`new campaign params start a new visit`** (same sid, URL `?utm_source=fb&utm_campaign=b` after `?utm_source=ig&utm_campaign=a`) → 2 sessions; staff headers → `stored:false`, 0 rows; `/admin/x` url → 0 rows; bot UA → 0 rows; body 5 KB / unknown field / non-uuid productId / url on another host → 400-class `AuthFailure`, 0 rows; route returns 403 for `Origin: https://evil.example`; prune removes a 14-month-old session and its views, keeps a 12-month-old one; no column contains the test IP or full UA (`SELECT row_to_json` scan).
- [x] Run `npm run test:integration -- tests/integration/traffic-collect.test.mjs` — fail; implement; pass.
- [x] appsec-engineer review of `collect.ts` + `route.ts` (scope: input validation, cookie flags, origin check, rate limit, PII). Fix findings (≤1 repair round).
- [x] Commit `feat(traffic): page-view collector with visit cookies, staff/bot skip, rate limit and 13-month retention`.

### M4 — Reports + links API (wave 2, owner: TDD)
> ✅ bbc593e — traffic-reports 8/8 (rollup invariant, Almaty buckets, locale merge, permissions, unsafe link targets).
**Files:** Create `src/server/traffic/reports.ts`, `src/server/traffic/links.ts`, `src/server/traffic/runtime.ts`, `src/app/api/admin/traffic/route.ts` (GET/POST/DELETE → `handleAdminRequest("traffic", …)`), `tests/integration/traffic-reports.test.mjs`; Modify `src/server/auth/admin-runtime.ts` (add `"traffic"` resource).
**Permissions:** read views `orders:read`; create/archive links `content:write`.
**Produces** (`GET /api/admin/traffic?view=<v>&from=YYYY-MM-DD&to=YYYY-MM-DD`, max 366 days, range in Asia/Almaty):
- `summary` → `{ clicks: number; visitors: number; pageViews: number }`
- `sources` → `{ platforms: { platform: string; clicks: number; visitors: number; mediums: { medium: string | null; clicks: number; campaigns: { campaign: string | null; clicks: number }[] }[] }[] }` sorted by clicks desc; invariant: `platform.clicks = Σ mediums.clicks = Σ campaigns.clicks` (untagged = campaign null).
- `timeline` → `{ days: { date: string; clicks: number; pageViews: number }[] }` (every day in range, zeros filled)
- `heatmap` → `{ cells: { weekday: 1..7 /* ISO, Mon=1 */; hour: 0..23; pageViews: number }[] }`
- `products` → `{ products: { productId: string; name: string | null; views: number; visitors: number }[] }` top 20, name from products (current EN name; null if deleted)
- `devices` → `{ os: { os: string; clicks: number }[]; deviceTypes: { deviceType: string; clicks: number }[] }`
- `links` → `{ links: { id; platform; medium; campaign; targetPath; label; url: string; clicks: number; createdAt }[] }`; POST `{ action: "create_link", platform, medium, campaign, targetPath, label? }` (campaign slugified `[a-z0-9-]{1,60}`, targetPath must start with `/` and not `//` or `/admin`); POST `{ action: "archive_link", id }`. `url` = `${origin}${targetPath}?utm_source=<platform lower>&utm_medium=<medium>&utm_campaign=<campaign>`; clicks = sessions matching the triple in the requested range.
- [x] Tests first (seed rows directly): campaigns a=200, b=300 under Instagram + 50 untagged → Instagram 550, sum invariant holds; **`product views merge across locales`**; **`buckets in Asia/Almaty`** (view at `2026-11-24T23:30Z` → date 2026-11-25, weekday 3, hour 4); timeline fills zero days; viewer without `orders:read` → 403; create_link without `content:write` → 403; create_link with `targetPath: "//evil.com"` → 400; built link clicks count only its triple.
- [x] Run `npm run test:integration -- tests/integration/traffic-reports.test.mjs` — fail; implement; pass.
- [x] Commit `feat(traffic): admin traffic reports and campaign link builder API`.

### M5 — Storefront tracker + cookie notice (wave 3, owner: frontend-developer)
> ✅ 31eafc6 — verified in the M7 smoke: beacon on load + client navigation, product id, cookie notice once.
**Files:** Create `src/components/traffic/PageViewTracker.tsx` (client), `src/components/traffic/ProductViewMarker.tsx`, `src/components/traffic/CookieNotice.tsx`; Modify `src/app/[lang]/layout.tsx` (mount both inside providers; add `"CookieNotice"` to `CLIENT_NAMESPACES`), `src/app/[lang]/p/[id]/page.tsx` (render `<ProductViewMarker productId={product.id} />` = `<span hidden data-grmn-product={id} />`), `messages/{en,ru,kk}.json` (`CookieNotice.text`, `CookieNotice.ok`).
- Tracker: `usePathname()` + `useSearchParams()` effect → one `sendBeacon("/api/t", JSON)` per distinct `pathname+search` (guard against React strict double-run with a ref), reads `[data-grmn-product]` at send time; falls back to `fetch(..., { keepalive: true })`.
- Notice: bottom bar, Garmin style, shown until `localStorage.grmn_cookie_ok = "1"`. Copy EN: "We use cookies to count visits and see which links bring you here. No personal data is shared." / OK. RU: «Мы используем cookie, чтобы считать посещения и понимать, по каким ссылкам вы к нам пришли. Личные данные не передаются.» / «OK». KK: «Біз келулерді санау және сізді қай сілтеме әкелгенін білу үшін cookie файлдарын қолданамыз. Жеке деректер берілмейді.» / «OK».
- [x] Verify: `npm run typecheck && npm run lint`; dev server + headless browser (`/home/nick/tools/browser`): load `/`, click to a product, back → exactly 3 POSTs to `/api/t` in the network log, the product one carries `productId`; notice shows in `/ru` with Russian text and stays hidden after OK + reload.
- [x] Commit `feat(traffic): storefront page-view tracker and cookie notice (EN/RU/KK)`.

### M6 — Admin Traffic + Link builder UI (wave 3, owner: frontend-developer; support: dataviz)
> ✅ c679eee (+190203d tick fix) — screenshots smoke/admin-traffic-1440*.png, -390.png, admin-campaign-links-1440.png reviewed.
**Files:** Create `src/app/admin/traffic/page.tsx`, `src/app/admin/traffic/_components/TrafficScreen.tsx`, `SourcesTable.tsx`, `VisitsChart.tsx`, `HourWeekdayGrid.tsx`, `TopProducts.tsx`, `DevicesCard.tsx`, `src/app/admin/traffic/links/page.tsx`, `src/app/admin/traffic/links/_components/LinkBuilder.tsx`; Modify `src/components/admin/AdminSidebar.tsx` (Overview: "Traffic" `/admin/traffic`, "Campaign links" `/admin/traffic/links`; `navPermissions` `orders:read`).
- Read `dataviz` skill before charts; reuse the `DailyRevenueChart` mark style (columns, hairline grid, readout + table view). Range buttons Today / 7 days / 30 days / custom, default 30 days.
- Sources table: platform rows with clicks, share %, visitors; expand → medium rows → campaign rows ("Untagged" for null). Headline tiles: Clicks, Visitors, Page views. Empty state: "No visits yet — data starts from the day tracking went live."
- Link builder: platform select (Instagram, Facebook, Telegram, Google, Yandex, Other…free text), format select (post, story, reels, bio, ad, message, other), campaign text, target page (path or pasted store URL → path), Create → shows URL + Copy button; list of saved links with clicks (last 30 days), archive bin; a help box with the Meta Ads Manager "URL parameters" string `utm_source=instagram&utm_medium=ad&utm_campaign={{campaign.name}}` (and the facebook variant).
- [x] Verify: `npm run typecheck && npm run lint`; headless browser screenshots of `/admin/traffic` (seeded + empty) and `/admin/traffic/links` reviewed by eye (`review.mjs`).
- [x] Commit `feat(admin): Traffic page and campaign link builder`.

### M7 — E2E + migration rehearsal (wave 4, verifier: evidence-collector)
> ✅ smoke `CMS_SMOKE_ONLY=traffic` PASS; migration order rehearsal 2/2 on temp DBs + prod copy (predeploy-menu-columns-ece41ba.dump, throwaway postgres:18.6): 29→30→33; branch `beta5-traffic-reapply` 06e1660 (local, not pushed).
**Files:** Modify `tests/ui/cms-smoke.mjs` (block `CMS_SMOKE_ONLY=traffic`).
- [x] Smoke block: create a link in Admin ▸ Campaign links (Instagram/story/smoke-test), open its URL in a fresh (non-staff) browser context, navigate to one product, then as admin open Traffic → Instagram row ≥1 click, expands to story → smoke-test 1; product appears in Top products; signed-in admin browsing added no clicks. Run `CMS_TEST_BUNDLER=webpack CMS_TEST_CHROME=… CMS_TEST_CHROME_NO_SANDBOX=1 CMS_SMOKE_ONLY=traffic npm run test:cms-ui` → pass.
- [x] Migration order 1 (live line): restore latest prod dump into grmn-staging (procedure in memory), run ops image of this branch → `migrate` → `\d traffic_sessions` exists; then from a beta5 build migrate same DB → 0029_product-code / 0030 applied (check `drizzle.__drizzle_migrations` rows and `products.code` column).
- [x] Migration order 2: local branch `beta5-traffic-reapply` off `beta5` with migration `0031_traffic-analytics-reapply.sql` (same idempotent SQL, `when` > 0030); fresh temp DB migrated by beta5 to 0030 then 0031 → tables exist; and a DB from order 1 → 0031 is a no-op. Record evidence. Not pushed, not merged.
- [x] Commit smoke `test(ui): traffic smoke — campaign link click attributed, staff excluded`.

### Review (after M7, verifier: code-reviewer)
- [x] `superpowers:requesting-code-review` on `e73a53e..HEAD`; fix confirmed findings (≤1 round), rerun §6.
> ✅ code-reviewer (opus): 0 critical, 4 important + 3 minor fixed in 36d23e1 (tests RED→GREEN), rest ruled/deferred in the ledger.

## 6. Verification
- `npm run test:unit` — all pass (incl. traffic-classify, traffic-user-agent)
- `npm run test:integration` — all pass (was 606/606 + new traffic suites)
- `npm run check` (lint + typecheck + build); `npm run check:boundaries`
- `CMS_TEST_BUNDLER=webpack CMS_TEST_CHROME=/home/nick/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome CMS_TEST_CHROME_NO_SANDBOX=1 npm run test:cms-ui` — full smoke incl. `traffic`
- Staging migration rehearsal both orders (M7) with recorded output
- Owner manual spot checks (§2) after the owner says "deploy"

## 7. Rollback
- All changes are additive commits on `homepage-deploy` after `e73a53e`; code rollback = `git reset` to e73a53e on the branch (local, unpushed) or, once deployed, `switch-version.sh e73a53e` — older image ignores the traffic tables; the tracker disappears with the image.
- Migration is additive (three new tables); no data in existing tables changes. To fully remove: `DROP TABLE traffic_views, traffic_sessions, traffic_links` + delete its `__drizzle_migrations` row (only if beta5 has not been migrated after it).
- Pre-deploy dump + env backup as usual (deploy step, owner-triggered).
- Unrelated dirty paths not ours: `/home/nick/GRMN` working tree (`docs/plans/2026-11-23-…`, `.claude/worktrees/`) and `node_modules` symlink in this worktree — untouched.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|
| §6 full `npm run test:cms-ui` | Run on 36d23e1 stops at the existing demo-checkout block: "no demo wording" matches the fixture product name "UI DEMO FIXTURE" in the cart (code this branch does not touch). The baseline run on e73a53e and the per-block reruns were stopped by the host for low memory. | Rerun when memory allows: baseline e73a53e to confirm the failure predates this branch, then the remaining blocks (variant-switch, compare, dashboard, categories, homepage-archive, variant-delete, variant-content) | 2026-11-25 |

## Revisions
- 2026-11-25: requirement drafted (approach A chosen by owner; clicks only; platform rollup of campaigns).
- 2026-11-25: requirement approved by owner. Plan (sections 4–7) drafted.
- 2026-11-25: plan approved by owner; executed inline.

## Result
**Delivered** (branch `homepage-deploy`, commits 5613be3..36d23e1, local, not pushed, not deployed):
Admin ▸ Traffic (clicks by platform → format → campaign with sum invariant, tiles, visits by day, hour × weekday heatmap in Asia/Almaty, most viewed products, devices), Admin ▸ Campaign links (builder, copy, per-link clicks, Meta Ads URL-parameter lines), storefront tracker + cookie notice EN/RU/KK, `POST /api/t` collector (visit cookies, staff/bot/admin skip, bounded body, per-address limits, 13-month prune job), idempotent migration 0029_traffic-analytics (when 1795400000000). Branch `beta5-traffic-reapply` (06e1660, local) carries 0031 re-apply for the beta5 merge.
**Checks run:** unit 626 pass / 0 fail; integration 629/629; check:boundaries pass; lint 0 errors; tsc 0; `next build --webpack` pass (turbopack `npm run check` build cannot run in this worktree: node_modules symlink); smoke `CMS_SMOKE_ONLY=traffic` PASS on 36d23e1; migration orders 2/2 on temp DBs + prod copy (29→30→33, rows kept); appsec review (fixes 474f44d); whole-branch code review (fixes 36d23e1).
**Gaps:** full browser smoke not green (see Blockers: existing demo-wording assertion + memory-killed reruns). Real-phone Instagram/Facebook taps only possible after deploy.
**Follow-ups:** at deploy add `location = /api/t { client_max_body_size 8k; }` in /home/nick/edge/conf.d/garmin.conf; at beta5 merge move ProductViewMarker into beta5's `/p/{code}[/{sku}]` page (variant path changes will count as views there) and take branch beta5-traffic-reapply; Cyrillic campaign names are refused (Latin only).

## Handoff
All modules built and verified except a green full browser smoke (Blockers). Code on homepage-deploy 36d23e1 (worktree /home/nick/worktrees/grmn-homepage-deploy), ledger .superpowers/sdd/2026-11-25-traffic-analytics-xl/progress.md. Next: rerun full smoke (baseline e73a53e first) when memory allows; deploy only on the owner's "deploy" using the usual GRMN steps (build grmn:<commit>/grmn-ops:<commit>, migrate, up -d app worker proxy, restart proxy) plus the nginx 8k location for /api/t. Work happens in `/home/nick/worktrees/grmn-homepage-deploy` (branch homepage-deploy, live e73a53e). Migration `when` must sit between 1795375500228 and 1795419564832 (see Constraints).
