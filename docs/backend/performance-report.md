# Performance report (Tasks 21A and 21B)

**Status (2026-11-18):** 21A query plans, index decisions and shared rate limits (on a laptop), and **21B Section 3 load and failure injection on the VPS** (below).

**21B verdict:** checkout, contention and every correctness invariant **pass**. The public browsing targets **fail** by an order of magnitude: about 10 rps is sustainable with this mix, against 100 rps steady and 500 rps burst. The cause is measured: the uncached catalog listing query uses about 98% of database time, and price-sorted listings alone about 60%. **Decision: price-sorted listings need the offer summary, and the 100/500 rps targets additionally need the shared cache.** See "21B decision" below.

Nothing here certifies production capacity.

## Task 21B: Section 3 load on the VPS (2026-11-18)

### Hardware, topology and generator

| Item | Value |
|---|---|
| Host | The O05 VPS: KVM guest, 6 vCPU AMD EPYC, 11.7 GiB RAM, no swap, 200 GB virtual SSD, Ubuntu 24.04.5, Docker 29.1.3. Region and provider are not identifiable from inside the guest |
| Sharing | 14 unrelated containers (ERPNext, Odoo, VPN, nginx, PostgreSQL 16) share the host. They used about 4% CPU on average during the runs (short peaks up to about 2 vCPU) |
| App | The production image built from `Dockerfile` (`runner` stage, Next.js 16.2.1 standalone, Node 24.14.1), one instance, `NODE_ENV=production`, PostgreSQL mode, auth on, `DATABASE_POOL_MAX=10`. **Cap: 1.5 vCPU, 2 GB** |
| Database | `postgres:18.6-bookworm` with `shared_buffers=1GB`, `effective_cache_size=3GB`, `work_mem=8MB`, `random_page_cost=1.1` and `pg_stat_statements`. **Cap: 2.5 vCPU, 4 GB** |
| Worker | `scripts/workers/outbox-worker.mjs`: pool 6, concurrency 4. **Cap: 0.5 vCPU** |
| Proxy | `nginx:1.29-alpine` with TLS termination and the trusted client-address header, as in Section 11. **Cap: 0.5 vCPU** |
| Network | A private Docker bridge. Only loopback ports are published (database and proxy on 127.0.0.1); nothing is reachable from the internet |
| Load generator | **k6 1.4.2** (`grafana/k6`) inside the same Docker network, HTTPS to the proxy. Constant-arrival-rate executors; at most 2,000 VUs, 1 vCPU, 3 GB. Each request carries a synthetic client address, so every virtual shopper has its own rate-limit bucket |
| Files | `tests/load/compose.perf.yml`, `tests/load/nginx.perf.conf`, `tests/load/k6-runs.js`, `scripts/perf/load-seed.mjs`, `scripts/perf/monitor.mjs`, `scripts/perf/invariants.sql` |

The caps total the host's 6 vCPU and leave the co-hosted services their idle share. They are the GRMN budget on a shared host, not the whole machine.

### Data

`scripts/perf/load-seed.mjs` seeds a disposable database with the Section 3 envelope at scale 1, in 6 minutes:
- 5,000 products and 50,000 variants with options, categories, activities, attributes and 70,000 media rows (the `catalog-explain.mjs` catalog seed);
- 150,000 users, 1,000,000 orders, 3,000,000 items and 800,000 captures (the `explain-report.mjs` history seed);
- checkout fixtures (200 deep-stock variants and one single-unit product), the repository's homepage content, 300 customer sessions, and tax and shipping settings.

The database is 3.0 GB, and the buffer-cache hit ratio stayed at or above 0.99 throughout. Every seeded stock level has an opening ledger movement.

### Endpoint mix (steady, burst and injection runs)

Everything is uncached, because the public cache was withdrawn in 21A (`force-dynamic`).

| Weight | Request |
|---|---|
| 15% | homepage `/` |
| 15% | listing, newest |
| 10% | listing with a filter (activity, level, case size) |
| 8% / 4% | listing sorted by price ascending / descending |
| 10% | search |
| 28% | product page |
| 5% | `GET /api/cart` (guest) |
| 5% | `GET /api/account/orders` (signed-in customer) |

### Results

All times are HTTP p50/p95/p99 in ms at the generator, through TLS. "Unexpected" means 5xx or a network error; business rejections are counted separately.

| Run | Achieved rps | p50 / p95 / p99 | Unexpected | DB CPU (avg / max of 250%) | Pool wait p95 (worst 5 s) | Verdict |
|---|---|---|---|---|---|---|
| Unloaded baseline, 2 rps | 2 | 77 / 1,383 / 1,489 | 0% | — | — | Price sort costs 1.3 s even alone |
| Step, 10 rps | 9.7 | 398 / 3,929 / 5,120 | 1.9% | 254 / 310 | 1,114 ms | **Already saturated** |
| Step, 25 rps | 23.9 | 2,375 / 7,937 / 8,303 | 64% | 277 / 393 | 2,005 ms | fail |
| Step, 50 rps | 45.8 | 2,599 / 6,786 / 8,460 | 77% | 282 / 452 | 2,125 ms | fail |
| **Steady, 100 rps × 30 min** | 97.2 | 2,799 / 7,907 / 12,953 | **85%** | 263 / 404 | 2,851 ms | **fail** |
| **Burst, 500 rps × 5 min** | 138 (104,248 iterations dropped) | 3,522 / 8,783 / 10,765 | **88%** | 240 / 310 | 2,917 ms | **fail** |
| **Checkout, 20/s × 5 min** (cart add, quote, checkout) | 60 | 38 / 205 / 1,134 | **0%** | 139 / 258 | 766 ms | **pass** |

**Checkout run:**
- 6,000 orders placed, all 6,000 checks passed.
- Checkout request p95 **268 ms** (target <800), p99 1,239 ms.
- Quote p95 130 ms and cart add p95 133 ms (target <400).
- The worker opened 6,000 payment sessions; the oldest waiting job was 1 s at most.

**Unloaded per-endpoint cost (2 rps, p50):**
- price-sorted listing **1,343 ms**;
- newest listing 185 ms; search 159 ms;
- product page 45 ms; homepage 31 ms; filtered listing 24 ms;
- account orders 45 ms; cart 9 ms.

**Steady run, per endpoint (p95 / unexpected):**
- homepage 5,476 ms / 90%; newest 5,767 / 89%; filtered 5,700 / 89%; price ascending 7,682 / 92%; search 5,645 / 89%;
- **product 9,488 / 99.7%**;
- account orders 2,141 / 18%; cart 680 / 19%.

**Mechanism:**
- The database is CPU-bound at its cap from 10 rps.
- Listings hold the app's 10 pooled connections for seconds, so cheap requests queue behind them. The product page (45 ms alone) needs several acquisitions and fails most: up to 433 requests waited for a connection. Waits beyond `DATABASE_CONNECT_TIMEOUT_MS` (2 s) become 503s.
- The app process used about 1.1 vCPU. Next.js rendering is not the bottleneck at these rates.
- No deadlocks, no lock waits that matter (at most 1), and worker lag stayed at 0 throughout.
- App memory was 878 MB after the 30 minutes.

**Where database time goes** (steady run, `pg_stat_statements`):
- the catalog `eligible` listing statements total about **98%**;
- the two price sorts alone are **59.6%**: 1,809 calls averaging 3.6 s under load;
- name/newest listings 19.0%; search and filters most of the rest.

### Correctness under contention

| Run | Result |
|---|---|
| **Last unit:** 100 guests quote the final unit, then all check out at the same instant | **Exactly 1 order.** 9 refused `INSUFFICIENT_STOCK`; 90 refused `CART_NOT_QUOTABLE` (the quote revalidation saw the unit held). Stock afterwards: on hand 1, reserved 1 |
| **Duplicate key:** one cart's checkout sent 50 times at once with one idempotency key | **Exactly 1 order:** 1 placed and 29 replayed with the same order id. 20 were refused 429 by the checkout rate limit (30/min per address), which is expected for 50 attempts from one shopper |

### Failure injection (6 minutes, 5 rps browsing plus 3 checkouts/s; clients retry with the same key)

| Time | Injected | Observed |
|---|---|---|
| t+60 s | Worker SIGKILL mid-lease; restarted after 40 s | Jobs queued (124 ready, oldest 41 s), then drained within 10 s of the restart. All 7,223 `payments.session.start` jobs are `done`, none dead |
| t+160 s | Database paused for 20 s | Requests failed with 503 when pool acquisition (2 s) or statement timeouts fired. They recovered as soon as the database resumed |
| t+250 s | App SIGKILL and immediate restart | Back within about 1 s |

Overall: 1,020 checkouts and **1,020 orders, 0 checkout errors**; 159 5xx (3.2%) in the browse traffic, concentrated in the pause window.

**Invariants** (`scripts/perf/invariants.sql`) were checked after **every** run (10 runs, 10 checks each) and **all held**:
- no negative or over-reserved stock;
- reserved equals the active hold lines;
- on hand equals the ledger;
- one order per checkout attempt and per idempotency key;
- at most one payable attempt per order;
- no capture recorded twice;
- no new order paid without a capture;
- no refund over captured cash;
- no cart with two owners.

Provider timeouts, webhook reorder and replay, and the expiry/capture and refund races have no live provider to inject on the VPS. They are covered by the integration suite, which passes **362/362 on this VPS** (14B `payments.test.mjs`, 16B `aftersales.test.mjs`, 12A/12B worker tests).

### Large history queries at full volume (1,000,000 orders)

`EXPLAIN_EXISTING=1 node --conditions=react-server scripts/perf/explain-report.mjs 1` runs the 21A literal service SQL against the seeded perf database; warm results are below. Raw output: [perf-explain-scale-1-vps.json](perf-explain-scale-1-vps.json).

| Query | Time | Plan |
|---|---|---|
| Account order history (10A) | 0.7 ms | `orders_customer_history_idx` |
| Admin queue, newest | 1.9 ms | `orders_shown_at_idx` |
| Admin queue, shipped | 19.6 ms | `orders_shown_at_idx` |
| Admin queue, rare `exception` (1%) | 35.5 ms | `orders_shown_at_idx`, 11,150 buffers. The 21A watch item stays acceptable; no new index |
| Dashboard totals, 30 days (66,108 captures) | 208 ms | staff-only; acceptable |
| Order export count, 30 days | 131 ms | bitmap on `orders_shown_at_idx` |
| Low-stock list | 75 ms | staff-only |

**Seed bug found, which changes the 21A numbers:**
- The `explain-report.mjs` history seed drew each order's time and amount in an *uncorrelated* `CROSS JOIN LATERAL`. PostgreSQL evaluates that once, so **every order and capture had the same timestamp and amount**. That window apparently fell outside the last 30 days at scale 0.1, so the 21A "dashboard 0.15 ms" and "export count 0.03 ms" figures measured an empty window.
- The seed now references the series row in both scripts, and the numbers above use spread timestamps (66,108 captures in 30 days out of 800,000).

### 21B decision: price-sorted listings

The numbers:
1. **The offer summary is required for price sorts.**
   - A price-sorted page costs **1.3 s unloaded** and **3.6 s under load**, with or without traffic.
   - A prototype summary table (one row per product: chosen price and availability, indexed on price) selects the page in **0.3 ms** instead of about 1.3 s, and a full rebuild for 5,000 products takes **138 ms**.
   - Price sort would then cost about as much as the newest listing, around 185 ms.
   - The shared cache cannot replace it: cursor pages, filters and misses are never cached (21A ruling), and every cache miss would still take 1.3–3.6 s.
2. **The offer summary is not enough for the 100/500 rps targets.**
   - Replacing price sorts with newest listings in the same mix (`NOPRICE=1`) is the best case an offer summary can reach.
   - That mix passes at **10 rps** (p95 215 ms, database CPU 80%, no errors), saturates at **25 rps** (p95 2.1 s), and fails at 50 rps (48% errors).
   - With about 2.5 database vCPU, uncached listings, search and homepage at 25–185 ms of database time each support roughly 20 rps, still 5× short of 100 rps.
3. **So the 100/500 rps targets need the shared, bounded cache as well**, for the public listing, homepage and product reads. It must be the 21A design: a shared handler, immediate expiry on writes, the rate version in the key, and no caching of cursors, search or misses.
4. **Interim protection, independent of both:** a slow listing must not starve cheap reads. Options are a separate pool or a concurrency cap for catalog listings, or a statement timeout for listings below the 2 s acquisition timeout. Without one, product pages and the cart fail first under load, as they did here.

**Cost if wrong:**
- Without the summary, price sorting stays at seconds per page.
- Without the cache, the store sustains about 10 rps of browsing on this budget. That is roughly 36,000 page views an hour, more than the owner's forecast of 200–5,000 daily users needs, but not the Section 3 stress envelope.
- Building both is the plan's documented trigger ("add Redis only on measurement"), and this is that measurement.

### Rulings and fixes made during 21B

- **Fixed: every same-origin API check failed behind the TLS proxy** (found by this run).
  - The Next.js standalone server builds `request.url` from its own bind address (`https://0.0.0.0:3000/...`), so all `url.origin !== baseURL` checks returned 400 for cart, checkout, account, admin, CMS, content, reports, inventory, operations and auth requests.
  - The browser smoke never saw it, because the dev server binds the same `localhost:port` as `AUTH_BASE_URL`.
  - `requestURL()` in `src/server/auth/request-url.ts` now maps a request onto the public origin only when the proxy's forwarded host and protocol name exactly that origin. The Origin-header check on writes is unchanged.
  - Tests: `tests/unit/request-url.test.mjs` (4), written first and failing.
  - Production proxies must forward `Host` (or `X-Forwarded-Host`) and `X-Forwarded-Proto: https`. The perf proxy config shows the headers.
- **Added: opt-in pool wait measurement** (`DATABASE_POOL_STATS_MS`, off by default). It logs acquisition-wait percentiles and pool occupancy as one JSON line per interval; nothing else is logged.
- **Fixed: smoke race.** The Task 13A smoke step navigated away while the first page's cart import could still be in flight, which imported twice into two guest carts. The step now waits for the import before navigating. It was a test race: production's single-flight controller is unchanged.
- **One app process uses several pools.** Next.js bundles give route handlers and server components separate module instances of `getDatabase()`. Up to 34 app connections were seen with `DATABASE_POOL_MAX=10`, so Section 8.1 budgets must count pools per bundle, not per process.
- **Perf proxy only:** the client address comes from the generator's `x-perf-client` header. A production proxy must set `x-grmn-client-ip` from the peer address and drop client values.

### Not done in 21B

- Multi-instance scaling, alternative pool sizes, and more database CPU. Any of them moves the saturation point, but none changes the per-request cost that makes uncached browsing about 10 rps on this budget.
- Cache-hit latency, because no cache exists.
- Measuring the offer summary and the cache once they are built: each is a follow-up task, followed by a re-run of these runs (the stack and scripts are reusable).

Raw per-run results (latency by endpoint, CPU, pool, database, worker, invariants): [perf-21b-results.json](perf-21b-results.json).

## 21A method (laptop)

`node --conditions=react-server scripts/perf/explain-report.mjs <scale>` runs these steps:
1. Starts a temporary PostgreSQL 18.6 and applies **every migration**, including 0011.
2. Bulk-loads synthetic, internally consistent data at a fraction of the Section 3 envelope. Scale 1 means 5,000 products, 50,000 variants, 150,000 users, 1,000,000 orders and 3,000,000 items.
   - There is no personal data. Guard triggers are bypassed for the load, but CHECK constraints still apply.
   - 1% of orders are fulfillment `exception`, so the selective status queue is measured too.
3. Times each query with `EXPLAIN (ANALYZE, BUFFERS)`, twice:
   - after dropping the two 21A indexes (baseline);
   - with the **shipped** index definitions read back from the migrated schema.

The queries are the services' **literal SQL**, copied verbatim:
- `fulfillment/service.ts` `listOrders`, including the item-count subquery;
- `reports/service.ts` `summary`, with the bounds CTE, the time zone and the refund-event join;
- `reports/exports.ts` `countRows`;
- `reports/service.ts` `lowStock`;
- the 10A account history.

Raw output: [perf-explain-scale-0.1.json](perf-explain-scale-0.1.json).

## 21A results at scale 0.1 (see the 21B seed-bug note: the dashboard and export rows measured an empty window)

Data: 500 products, 5,000 variants, 15,000 users, 100,000 orders, 300,000 items, 80,000 captures. The seed took 73 s.

Shipped indexes:
- `orders_shown_at_idx` on `(COALESCE(placed_at, created_at) DESC, id DESC)`;
- `payment_transactions_capture_time_idx` on `(created_at) WHERE kind = 'capture'`.

| Query (service) | Baseline | Plan before | Shipped | Plan after |
|---|---|---|---|---|
| Account order history (10A) | 0.43 ms | `orders_customer_history_idx` | 0.04 ms | same |
| Admin queue, newest (16A `listOrders`) | **52.98 ms**, 3,150 buffers | Seq Scan + sort on orders | **0.76 ms**, 262 | `orders_shown_at_idx` |
| Admin queue, `shipped` (16A) | **38.51 ms**, 3,315 | bitmap on `orders_fulfillment_queue_idx` + sort | **0.67 ms**, 477 | `orders_shown_at_idx` |
| Admin queue, rare `exception` (1%) (16A) | 10.47 ms, 390 | bitmap on `orders_fulfillment_queue_idx` + sort | 3.31 ms, 4,709 | `orders_shown_at_idx`, filtering as it walks |
| Dashboard totals, 30 days (18B `summary`) | **16.91 ms**, 2,500 | Seq Scan on payment_transactions | **0.15 ms**, 2 | `payment_transactions_capture_time_idx` |
| Order export count, 30 days (18B `countRows`) | **14.94 ms**, 2,942 | Seq Scan on orders | **0.03 ms**, 3 | `orders_shown_at_idx` |
| Low-stock list (18B `lowStock`) | 6.66 ms | Seq Scan + top-N on 5,000 balances | 5.08 ms | unchanged (no index added) |

These scans grow linearly with orders and captures. At Section 3 volume (10× this run) the unindexed queue would cost about 0.5 s and the export count about 0.15 s per request.

### Watch items for 21B

- **Rare-status queue:** the planner walks `orders_shown_at_idx` and filters as it goes. That is 3.3 ms here, but 4,709 buffers, so a 1% status at 1M orders reads roughly 10× more. If 21B measures it as slow, add a `(fulfillment_status, COALESCE(placed_at, created_at) DESC, id DESC)` index; the existing queue index sorts on `placed_at`, not the shown time.
- **Dashboard refunds:** the seed has no refunds, so the refunds × `order_events` join was not exercised at volume. It joins on the unique `order_events.dedupe_key` index.
- **Low-stock list:** a top-N over balances, about 50–70 ms at 50,000 variants (staff only). Revisit if 21B puts it on a hot path.

## Catalog listing and search (review I9 follow-up)

**Method:** `node --conditions=react-server scripts/perf/catalog-explain.mjs <scale>`.
- It seeds a temporary PostgreSQL 18.6 with **catalog relations**: at scale 1, 5,000 products and 50,000 variants.
  - Every product has two options (size × color, 10 variants), one primary category, three activities, and level and case-size attributes.
  - Every variant has a price and a stock row (about 20% out of stock). There are 70,000 public media rows: 4 per product and 1 per variant.
- It calls the **real** `catalog/service.ts` through a pool that records every statement, then runs `EXPLAIN (ANALYZE, BUFFERS)` on exactly that SQL. Nothing is copied by hand.
- Raw output: [before](perf-catalog-scale-1-before.json) and [after](perf-catalog-scale-1-after.json), on the same seed. The seed took 7.5 s.

**Finding:** the listing built every published product's full variant, option, stock and gallery JSON before it filtered, sorted and applied LIMIT 24. Every listing request scaled with the whole catalog: about 7.5 s per page at 5,000 products, against the Section 3 target of p95 under 300 ms for public uncached reads.

**Fix** (`catalog/service.ts`, no migration):
- `eligible` now holds only what filtering, sorting and paging need: id, key, name, description, creation time and, for price sorts, the chosen offer's price.
- Category, activity, level and case-size keys are computed only when a filter uses them.
- Non-price sorts check eligibility with `EXISTS`, which stops at the first eligible variant.
- Display columns and the variant, gallery and option JSON are built only for the selected rows.

The DTOs are unchanged. The catalog integration tests (26) pass, including a new mutation-checked test: price sorting and cursors follow the chosen offer when a cheaper variant is out of stock.

| Scenario (real service call) | Before | After |
|---|---|---|
| Listing, first page, by name | **7,848 ms** | **135 ms** |
| Listing, second page via cursor | 7,836 ms | 129 ms |
| Listing, newest | 7,296 ms | 130 ms |
| Listing, price ascending | 7,314 ms | **751 ms** |
| Listing, category filter | 1,331 ms | 79 ms |
| Running catalogue (`activitiesAll`) | 2,693 ms | 88 ms |
| Level + case-size filters | 907 ms | 113 ms |
| Search, common term | 1,466 ms | 90 ms |
| Search, rare term / no match | 6 / 4 ms | 6 / 4 ms |
| Product detail by key | 2.4 ms | 2.3 ms |
| Compare / related by keys | 6.7 ms | 7.5 ms |

Times are single runs of database execution time on a developer laptop, not p95 under load.

**Tried and rejected:** checking "chooses every option" by comparing counts instead of the nested `NOT EXISTS`. It made the price sort slower (1,165 ms) and the name sort slower (171 ms), so it was reverted. The database already rejects an active variant that misses an option at commit (now covered by a test), so the query check is defense in depth.

**Remaining:**
- **Price sorts** (about 750 ms at full volume) still rank every eligible variant by stock state and price, which is roughly 18 buffers per variant. Getting under 300 ms needs a maintained per-product offer summary (chosen price and availability, updated with price, stock and variant changes) or the shared cache. Both are schema or infrastructure decisions, and 21B should confirm on the VPS whether price sort is used enough to matter.
- **Search:** `ILIKE '%term%'` is applied while scanning products, before the per-product work: a rare term costs 6 ms in total, so the scan itself is cheap at 5,000 products. A common term costs about 90 ms because of the matching rows' eligibility checks, which a trigram index would not reduce. **Decision: no trigram index at Section 3 volume.** Revisit if the catalog grows by an order of magnitude.

## Decisions (migration `0011_performance-throttle`)

- **Add `orders_shown_at_idx`** for the 16A staff queue, newest first with or without a status filter, and for the 18B order export (count and rows).
- **Add `payment_transactions_capture_time_idx`** for the 18B revenue windows.
- **Write cost:** one index entry per order insert and per capture insert; negligible against the read savings.
- **Cutover note (review M5):** 0011 creates both indexes without `CONCURRENTLY`, inside the migration transaction. Apply it before importing production data (Task 23 order), not to a populated live database during traffic.

## Shared rate limits

The limits live in PostgreSQL (`rate_limit_buckets`): a fixed window on the database clock, one atomic upsert per check. Every app instance shares one budget. In the test, two pools send 30 concurrent hits against a limit of 10, and exactly 10 are allowed.

**Identity** follows the auth layer's trusted-proxy convention (review C1/C2):
- The client address comes only from `AUTH_TRUSTED_IP_HEADER=x-grmn-client-ip`. The TLS proxy sets and overwrites this header, and production requires it.
- A missing or invalid value is 503.
- Cookies and client-supplied forwarding headers are never used: clients can rotate or forge them.
- With no trusted proxy (development), per-client limits are skipped instead of sharing one global bucket.
- Bucket keys are HMAC-SHA-256 with the auth secret, so no raw address is stored.

| Scope | Limit per trusted address |
|---|---|
| Payment webhooks | 600/min, counted before anything is stored. Separate per sender, so junk traffic cannot crowd out the provider. |
| Cart quotes | 120/min |
| Checkouts | 30/min |

Windows are pruned hourly; anything older than 2 hours is removed. Redis is not needed at these rates (Section 8).

## Public data cache: withdrawn (review I3–I7)

A first version cached the catalog and CMS public reads with `unstable_cache` (60 s, tagged) and invalidated them after commits. The review showed five problems:
- `revalidateTag(tag, "max")` and lifetime expiry are stale-while-revalidate, so a takedown or price change can still be served once more, even long after the 60 s.
- Invalidation reaches only the local instance and was not retried from the outbox.
- Stock, media and scheduled windows were not invalidated.
- The rate version was missing from the key, which breaks USD cursors.
- The file-system cache would grow without bound from search and miss keys.

A cache that can show an unpublished product is worse than none, so it was removed. Every public page stays per-request (`force-dynamic`), with the indexed queries above.

A correct version needs two things:
- **A shared, bounded cache handler** (for example Redis with eviction), or worker-driven fan-out of invalidation to every instance. This is an infrastructure choice: Section 8 adds Redis only on measurement.
- **Immediate expiry in route handlers** (`revalidateTag(tag, { expire: 0 })`), no caching of search, cursor or miss keys, the rate version in the key, and a time bucket or worker invalidation at scheduled boundaries.

21B's load run decides whether the cache is needed at all.

## What 21B had to measure

Measured on the VPS on 2026-11-18; see "Task 21B" at the top of this report.
