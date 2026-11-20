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
// best-sellers count paid orders only (paid or partially refunded, not cancelled), real and demo apart.

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
export interface CurrencyTotalDTO { currency: string; environment: ReportEnvironment; capturedMinor: string; refundedMinor: string; netMinor: string; ordersPaid: number }
export interface DayTotalDTO { date: string; currency: string; environment: ReportEnvironment; capturedMinor: string; refundedMinor: string; netMinor: string }
export interface SummaryDTO { from: string; to: string; timeZone: string; totals: CurrencyTotalDTO[]; days: DayTotalDTO[] }
export interface StatusCountsDTO { orderStatus: Record<string, number>; fulfillmentStatus: Record<string, number>; demo: number; real: number }
export interface RecentOrderDTO { id: string; number: string; createdAt: string; totalMinor: string; currency: string; paymentStatus: string; fulfillmentStatus: string; demo: boolean }
export interface BestSellerDTO { variantId: string; sku: string | null; name: string; units: number; revenueMinor: string }
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
        totals: totals.rows.map(row => ({ currency: row.currency, environment: row.environment, capturedMinor: row.captured, refundedMinor: row.refunded, netMinor: net(row.captured, row.refunded), ordersPaid: row.orders })),
        days: days.rows.map(row => ({ date: row.day, currency: row.currency, environment: row.environment, capturedMinor: row.captured, refundedMinor: row.refunded, netMinor: net(row.captured, row.refunded) })),
      };
    },

    /** Every order shown in the window (real and demo, any status) counted by order and fulfillment status. */
    async statusCounts(headers: Headers, input: unknown): Promise<StatusCountsDTO> {
      const command = await windowed(headers, summaryInput, input);
      const rows = (await pool.query<{ order_status: string; fulfillment_status: string; demo: boolean; n: number }>(
        `SELECT o.order_status,o.fulfillment_status,(o.payment_mode='demo') AS demo,count(*)::int AS n FROM orders o
         WHERE ${ordersInWindow} GROUP BY 1,2,3`, [command.from, command.to, command.timeZone])).rows;
      const result: StatusCountsDTO = { orderStatus: {}, fulfillmentStatus: {}, demo: 0, real: 0 };
      for (const row of rows) {
        result.orderStatus[row.order_status] = (result.orderStatus[row.order_status] ?? 0) + row.n;
        result.fulfillmentStatus[row.fulfillment_status] = (result.fulfillmentStatus[row.fulfillment_status] ?? 0) + row.n;
        if (row.demo) result.demo += row.n; else result.real += row.n;
      }
      return result;
    },

    /** The newest orders shown in the window (default 10), each marked demo or not. */
    async recentOrders(headers: Headers, input: unknown): Promise<{ items: RecentOrderDTO[] }> {
      const command = await windowed(headers, listInput, input);
      const rows = (await pool.query<{ id: string; order_number: string; shown_at: Date; total_minor: string; currency: string; payment_status: string; fulfillment_status: string; demo: boolean }>(
        `SELECT o.id,o.order_number,COALESCE(o.placed_at,o.created_at) AS shown_at,o.total_minor::text AS total_minor,o.currency,o.payment_status,o.fulfillment_status,(o.payment_mode='demo') AS demo
         FROM orders o WHERE ${ordersInWindow} ORDER BY COALESCE(o.placed_at,o.created_at) DESC,o.id DESC LIMIT $4`,
        [command.from, command.to, command.timeZone, command.limit ?? 10])).rows;
      return { items: rows.map(row => ({ id: row.id, number: row.order_number, createdAt: row.shown_at.toISOString(), totalMinor: row.total_minor, currency: row.currency, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status, demo: row.demo })) };
    },

    /**
     * Best-selling variants of the paid orders shown in the window (paid or partially refunded, never
     * cancelled), real and demo listed apart (default 8 each). Revenue is the order lines' totals.
     */
    async bestSellers(headers: Headers, input: unknown): Promise<BestSellersDTO> {
      const command = await windowed(headers, listInput, input);
      const rows = (await pool.query<{ demo: boolean; variant_id: string; sku: string | null; name: string; units: number; revenue: string }>(
        `SELECT demo,variant_id,sku,name,units,revenue FROM (
           SELECT x.*,row_number() OVER (PARTITION BY x.demo ORDER BY x.units DESC,x.revenue_n DESC,x.variant_id) AS rank FROM (
             SELECT (o.payment_mode='demo') AS demo,i.variant_id,
               (array_agg(i.sku ORDER BY COALESCE(o.placed_at,o.created_at) DESC,i.id))[1] AS sku,
               (array_agg(i.name ORDER BY COALESCE(o.placed_at,o.created_at) DESC,i.id))[1] AS name,
               sum(i.quantity)::int AS units,sum(i.total_minor) AS revenue_n,sum(i.total_minor)::text AS revenue
             FROM orders o JOIN order_items i ON i.order_id=o.id
             WHERE ${ordersInWindow} AND o.payment_status IN ('paid','partially_refunded') AND o.order_status<>'cancelled' AND i.variant_id IS NOT NULL
             GROUP BY 1,2) x) ranked
         WHERE rank<=$4 ORDER BY demo,rank`, [command.from, command.to, command.timeZone, command.limit ?? 8])).rows;
      const item = (row: (typeof rows)[number]): BestSellerDTO => ({ variantId: row.variant_id, sku: row.sku, name: row.name, units: row.units, revenueMinor: row.revenue });
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
