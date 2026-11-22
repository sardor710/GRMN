import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";

// Task 18B. Dashboard summaries computed in SQL (no order or customer lists reach the browser).
// Revenue is captured money minus succeeded refunds, grouped by currency, in a time window of local
// calendar days in the requested IANA time zone (at most 92 days). A capture belongs to the day it
// was recorded, a refund to the day it succeeded (its immutable refund.succeeded event, review I6).
// Different currencies and payment environments (sandbox, live) are never added together (review I5).
// Task 4.1: demo captures and refunds (environment 'demo', Task 3.2) are not money. They are reported
// as their own 'demo' environment row, so a demo total is never summed into a live or sandbox total.
// The order views (status_counts, recent_orders, best_sellers) use the same window over the time an
// order is shown (placed_at, else created_at). Status counts include every order, real and demo;
// best-sellers are net sales of paid orders (paid, partially refunded or refunded, never cancelled, minus
// refunded line quantities and amounts), real and demo apart, one row per variant and currency.
// Sandbox captures are the D03a demo purchases: each row carries an explicit "Demo (sandbox)" label.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 92;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const summaryInput = z.strictObject({ from: z.string().regex(DATE), to: z.string().regex(DATE), timeZone: z.string().min(1).max(64) });
const stockInput = z.strictObject({ limit: z.number().int().min(1).max(50).optional() });
const listInput = summaryInput.extend({ limit: z.number().int().min(1).max(50).optional() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}
const day = (value: string) => { const date = new Date(value + "T00:00:00Z"); return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? invalid() : date; };

export type ReportEnvironment = "sandbox" | "live" | "demo";
/** D03a: "Live" is real money; "Demo (sandbox)" is demo purchases (sandbox environment); "Demo" is the Task 3.2 demo checkout. They are never added together. */
export type RevenueSeriesLabel = "Live" | "Demo (sandbox)" | "Demo";
export const seriesLabel = (environment: string): RevenueSeriesLabel => environment === "live" ? "Live" : environment === "demo" ? "Demo" : "Demo (sandbox)";
export interface CurrencyTotalDTO { currency: string; environment: ReportEnvironment; label: RevenueSeriesLabel; capturedMinor: string; refundedMinor: string; netMinor: string; ordersPaid: number }
export interface DayTotalDTO { date: string; currency: string; environment: ReportEnvironment; label: RevenueSeriesLabel; capturedMinor: string; refundedMinor: string; netMinor: string }
export interface SummaryDTO { from: string; to: string; timeZone: string; totals: CurrencyTotalDTO[]; days: DayTotalDTO[] }
/**
 * Task 4.2: awaitingShipment counts orders shown in the window that staff should still ship, real and
 * demo apart: order_status 'confirmed', payment_status 'paid' or 'partially_refunded', and
 * fulfillment_status 'unfulfilled', 'processing' or 'partially_shipped' (not yet shipped in full).
 * Excluded: cancel_requested (and every other non-confirmed order status), unpaid or fully refunded
 * orders, fulfillment 'exception' orders (they must not ship), and shipped or delivered orders.
 */
export interface StatusCountsDTO { orderStatus: Record<string, number>; fulfillmentStatus: Record<string, number>; demo: number; real: number; awaitingShipment: { real: number; demo: number } }
export interface RecentOrderDTO { id: string; number: string; createdAt: string; totalMinor: string; currency: string; paymentStatus: string; fulfillmentStatus: string; demo: boolean }
/** A best-selling variant in one currency. units and revenueMinor are net of refunds (refunded line quantities and amounts). */
export interface BestSellerDTO { variantId: string; sku: string | null; name: string; currency: string; units: number; revenueMinor: string }
export interface BestSellersDTO { real: BestSellerDTO[]; demo: BestSellerDTO[] }
export interface LowStockDTO { variantId: string; productKey: string; name: string; sku: string | null; onHand: number; reserved: number; available: number }

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

export function createReportsService({ pool, authorize }: Options) {
  /** Authorizes orders:read, then checks the window: real calendar dates, at most MAX_DAYS, a known time zone. */
  async function windowed<T extends { from: string; to: string; timeZone: string }>(headers: Headers, schema: z.ZodType<T>, input: unknown): Promise<T> {
    await authorize(headers, "orders:read");
    const command = parse(schema, input);
    const from = day(command.from), to = day(command.to);
    const span = (to.getTime() - from.getTime()) / 86_400_000;
    if (span < 0 || span >= MAX_DAYS) invalid();
    if (!(await pool.query("SELECT 1 FROM pg_timezone_names WHERE name=$1", [command.timeZone])).rowCount) invalid();
    return command;
  }
  // Orders shown in the window ($1 from, $2 to, $3 time zone); the expression is the one orders_shown_at_idx indexes.
  const ordersInWindow = `COALESCE(o.placed_at,o.created_at)>=($1::date)::timestamp AT TIME ZONE $3 AND COALESCE(o.placed_at,o.created_at)<(($2::date)+1)::timestamp AT TIME ZONE $3`;

  return {
    async summary(headers: Headers, input: unknown): Promise<SummaryDTO> {
      const command = await windowed(headers, summaryInput, input);
      const args = [command.from, command.to, command.timeZone];
      const window = `bounds AS (SELECT ($1::date)::timestamp AT TIME ZONE $3 AS lo,(($2::date)+1)::timestamp AT TIME ZONE $3 AS hi),
        captured AS (SELECT t.currency,t.environment,(t.created_at AT TIME ZONE $3)::date AS day,t.amount_minor,t.order_id FROM payment_transactions t,bounds b WHERE t.kind='capture' AND t.created_at>=b.lo AND t.created_at<b.hi),
        succeeded AS (SELECT r.currency,r.environment,r.amount_minor,COALESCE(e.occurred_at,e.recorded_at,r.updated_at) AS at FROM refunds r LEFT JOIN order_events e ON e.dedupe_key='refund-succeeded:'||r.id::text WHERE r.status='succeeded'),
        refunded AS (SELECT s.currency,s.environment,(s.at AT TIME ZONE $3)::date AS day,s.amount_minor FROM succeeded s,bounds b WHERE s.at>=b.lo AND s.at<b.hi)`;
      const [totals, days] = await Promise.all([
        pool.query<{ currency: string; environment: ReportEnvironment; captured: string; refunded: string; orders: number }>(`WITH ${window}
          SELECT currency,environment,sum(captured)::text AS captured,sum(refunded)::text AS refunded,max(orders)::int AS orders FROM (
            SELECT currency,environment,sum(amount_minor) AS captured,0 AS refunded,count(DISTINCT order_id) AS orders FROM captured GROUP BY currency,environment
            UNION ALL SELECT currency,environment,0,sum(amount_minor),0 FROM refunded GROUP BY currency,environment) x GROUP BY currency,environment ORDER BY environment,currency`, args),
        pool.query<{ day: string; currency: string; environment: ReportEnvironment; captured: string; refunded: string }>(`WITH ${window}
          SELECT to_char(day,'YYYY-MM-DD') AS day,currency,environment,sum(captured)::text AS captured,sum(refunded)::text AS refunded FROM (
            SELECT day,currency,environment,amount_minor AS captured,0 AS refunded FROM captured UNION ALL SELECT day,currency,environment,0,amount_minor FROM refunded) x
          GROUP BY day,currency,environment ORDER BY day,environment,currency`, args),
      ]);
      const net = (captured: string, refunded: string) => (BigInt(captured) - BigInt(refunded)).toString();
      return {
        from: command.from, to: command.to, timeZone: command.timeZone,
        totals: totals.rows.map(row => ({ currency: row.currency, environment: row.environment, label: seriesLabel(row.environment), capturedMinor: row.captured, refundedMinor: row.refunded, netMinor: net(row.captured, row.refunded), ordersPaid: row.orders })),
        days: days.rows.map(row => ({ date: row.day, currency: row.currency, environment: row.environment, label: seriesLabel(row.environment), capturedMinor: row.captured, refundedMinor: row.refunded, netMinor: net(row.captured, row.refunded) })),
      };
    },

    /** Every order shown in the window (real and demo, any status) counted by order and fulfillment status. */
    async statusCounts(headers: Headers, input: unknown): Promise<StatusCountsDTO> {
      const command = await windowed(headers, summaryInput, input);
      const rows = (await pool.query<{ order_status: string; fulfillment_status: string; demo: boolean; n: number; awaiting: number }>(
        `SELECT o.order_status,o.fulfillment_status,(o.payment_mode IN ('demo','sandbox')) AS demo,count(*)::int AS n,
           (count(*) FILTER (WHERE o.order_status='confirmed' AND o.payment_status IN ('paid','partially_refunded')
             AND o.fulfillment_status IN ('unfulfilled','processing','partially_shipped')))::int AS awaiting
         FROM orders o WHERE ${ordersInWindow} GROUP BY 1,2,3`, [command.from, command.to, command.timeZone])).rows;
      const result: StatusCountsDTO = { orderStatus: {}, fulfillmentStatus: {}, demo: 0, real: 0, awaitingShipment: { real: 0, demo: 0 } };
      for (const row of rows) {
        result.orderStatus[row.order_status] = (result.orderStatus[row.order_status] ?? 0) + row.n;
        result.fulfillmentStatus[row.fulfillment_status] = (result.fulfillmentStatus[row.fulfillment_status] ?? 0) + row.n;
        if (row.demo) { result.demo += row.n; result.awaitingShipment.demo += row.awaiting; } else { result.real += row.n; result.awaitingShipment.real += row.awaiting; }
      }
      return result;
    },

    /** The newest orders shown in the window (default 10), each marked demo or not. */
    async recentOrders(headers: Headers, input: unknown): Promise<{ items: RecentOrderDTO[] }> {
      const command = await windowed(headers, listInput, input);
      const rows = (await pool.query<{ id: string; order_number: string; shown_at: Date; total_minor: string; currency: string; payment_status: string; fulfillment_status: string; demo: boolean }>(
        `SELECT o.id,o.order_number,COALESCE(o.placed_at,o.created_at) AS shown_at,o.total_minor::text AS total_minor,o.currency,o.payment_status,o.fulfillment_status,(o.payment_mode IN ('demo','sandbox')) AS demo
         FROM orders o WHERE ${ordersInWindow} ORDER BY COALESCE(o.placed_at,o.created_at) DESC,o.id DESC LIMIT $4`,
        [command.from, command.to, command.timeZone, command.limit ?? 10])).rows;
      return { items: rows.map(row => ({ id: row.id, number: row.order_number, createdAt: row.shown_at.toISOString(), totalMinor: row.total_minor, currency: row.currency, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status, demo: row.demo })) };
    },

    /**
     * Best-selling variants of the paid orders shown in the window (paid, partially refunded or refunded,
     * never cancelled), net of refunds, real and demo listed apart (default 8 each), one row per variant
     * and currency so currencies are never summed. Variants with no net units left are dropped.
     */
    async bestSellers(headers: Headers, input: unknown): Promise<BestSellersDTO> {
      const command = await windowed(headers, listInput, input);
      // Each line is netted against the item lines (refund_items kind 'item') of its succeeded refunds:
      // refunded quantity off the units, refunded line amount off the revenue. Shipping and adjustment
      // refunds have no line and do not change a variant's numbers.
      const rows = (await pool.query<{ demo: boolean; currency: string; variant_id: string; sku: string | null; name: string; units: number; revenue: string }>(
        `SELECT demo,currency,variant_id,sku,name,units,revenue FROM (
           SELECT x.*,row_number() OVER (PARTITION BY x.demo ORDER BY x.units DESC,x.revenue_n DESC,x.currency,x.variant_id) AS rank FROM (
             SELECT (o.payment_mode IN ('demo','sandbox')) AS demo,o.currency,i.variant_id,
               (array_agg(i.sku ORDER BY COALESCE(o.placed_at,o.created_at) DESC,i.id))[1] AS sku,
               (array_agg(i.name ORDER BY COALESCE(o.placed_at,o.created_at) DESC,i.id))[1] AS name,
               sum(i.quantity-COALESCE(r.quantity,0))::int AS units,
               sum(i.total_minor-COALESCE(r.amount,0)) AS revenue_n,sum(i.total_minor-COALESCE(r.amount,0))::text AS revenue
             FROM orders o JOIN order_items i ON i.order_id=o.id
             LEFT JOIN LATERAL (SELECT sum(ri.quantity) AS quantity,sum(ri.amount_minor) AS amount FROM refund_items ri JOIN refunds rf ON rf.id=ri.refund_id
               WHERE ri.order_item_id=i.id AND ri.kind='item' AND rf.status='succeeded') r ON true
             WHERE ${ordersInWindow} AND o.payment_status IN ('paid','partially_refunded','refunded') AND o.order_status<>'cancelled' AND i.variant_id IS NOT NULL
             GROUP BY 1,2,3 HAVING sum(i.quantity-COALESCE(r.quantity,0))>0) x) ranked
         WHERE rank<=$4 ORDER BY demo,rank`, [command.from, command.to, command.timeZone, command.limit ?? 8])).rows;
      const item = (row: (typeof rows)[number]): BestSellerDTO => ({ variantId: row.variant_id, sku: row.sku, name: row.name, currency: row.currency, units: row.units, revenueMinor: row.revenue });
      return { real: rows.filter(row => !row.demo).map(item), demo: rows.filter(row => row.demo).map(item) };
    },

    /** The variants with the least available stock at the main location (the admin restock list). */
    async lowStock(headers: Headers, input: unknown = {}): Promise<{ items: LowStockDTO[] }> {
      await authorize(headers, "catalog:read");
      const command = parse(stockInput, input ?? {});
      const rows = (await pool.query<{ variant_id: string; public_key: string; name: string; sku: string | null; on_hand: number; reserved: number; available: number }>(
        `SELECT b.variant_id,p.public_key,p.name,v.sku,b.on_hand,b.reserved,(b.on_hand-b.reserved) AS available
         FROM inventory_balances b JOIN stock_locations l ON l.id=b.location_id AND l.key='main'
         JOIN product_variants v ON v.id=b.variant_id AND v.status='active' JOIN products p ON p.id=v.product_id AND p.status<>'archived'
         ORDER BY (b.on_hand-b.reserved),b.variant_id LIMIT $1`, [command.limit ?? 10])).rows;
      return { items: rows.map(row => ({ variantId: row.variant_id, productKey: row.public_key, name: row.name, sku: row.sku, onHand: row.on_hand, reserved: row.reserved, available: row.available })) };
    },
  };
}
export type ReportsService = ReturnType<typeof createReportsService>;
