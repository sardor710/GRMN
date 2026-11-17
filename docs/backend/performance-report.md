# Performance report (Task 21A, partial)

**Status:** query-plan evidence, index decisions and shared rate limits, 2026-11-18.

**Not done:**
- Section 3 load runs (21B).
- Full-volume (scale 1) plans.
- Catalog and search plans.
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

## Not measured (review I9)

- **Catalog listing and search.** The real query (`catalog/service.ts` eligible CTE: per-product lateral variant, price and inventory aggregation, media and option subqueries, `ILIKE` on name or description, ordering by a computed price or name) needs categories, options, media and attributes, and this seed creates none of them. The earlier simplified probes have been removed.
- **No search or trigram decision is made yet.** This is 21B work, on a seed with catalog relations.

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
- catalog and search plans on a seed with catalog relations.
