# Performance report (Task 21A, partial)

**Status:** query-plan evidence, index decisions and shared rate limits, 2026-11-18. Catalog and search plans at full catalog volume, with a listing fix, were added on 2026-11-18 (see "Catalog listing and search").

**Not done:**
- Section 3 load runs (21B).
- Full-volume (scale 1) plans for orders and reports.
- A price-sorted listing under 300 ms (see below).
- The public data cache, which was withdrawn (see below).

Nothing here certifies production capacity. The host was a developer laptop (8 GB RAM, 0.1–0.6 GB free during the runs), not the target VPS (O05 is open).

## Method

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

## Results at scale 0.1

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

## What 21B must still measure

On hardware representative of the VPS (O05), recording generator, hardware, region and database tier:
- Section 3 steady load (100 rps for 30 min), burst (500 rps for 5 min) and checkout (20/s for 5 min);
- last-unit contention;
- p95/p99 latency, 5xx rate, pool wait, database resources and worker/expiry lag;
- catalog listing p95 under that load, and whether price-sorted listings need the offer summary or the cache (catalog plans themselves are measured above).
