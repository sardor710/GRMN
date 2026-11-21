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
// Sandbox captures are the D03a demo purchases: each row carries an explicit "Demo (sandbox)" label.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 92;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const summaryInput = z.strictObject({ from: z.string().regex(DATE), to: z.string().regex(DATE), timeZone: z.string().min(1).max(64) });
const stockInput = z.strictObject({ limit: z.number().int().min(1).max(50).optional() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}
const day = (value: string) => { const date = new Date(value + "T00:00:00Z"); return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? invalid() : date; };

/** D03a: "Live" is real money; "Demo (sandbox)" is demo purchases (sandbox environment). The two are never added together. */
export type RevenueSeriesLabel = "Live" | "Demo (sandbox)";
export const seriesLabel = (environment: string): RevenueSeriesLabel => environment === "live" ? "Live" : "Demo (sandbox)";
export interface CurrencyTotalDTO { currency: string; environment: "sandbox" | "live"; label: RevenueSeriesLabel; capturedMinor: string; refundedMinor: string; netMinor: string; ordersPaid: number }
export interface DayTotalDTO { date: string; currency: string; environment: "sandbox" | "live"; label: RevenueSeriesLabel; capturedMinor: string; refundedMinor: string; netMinor: string }
export interface SummaryDTO { from: string; to: string; timeZone: string; totals: CurrencyTotalDTO[]; days: DayTotalDTO[] }
export interface LowStockDTO { variantId: string; productKey: string; name: string; sku: string | null; onHand: number; reserved: number; available: number }

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }

export function createReportsService({ pool, authorize }: Options) {
  return {
    async summary(headers: Headers, input: unknown): Promise<SummaryDTO> {
      await authorize(headers, "orders:read");
      const command = parse(summaryInput, input);
      const from = day(command.from), to = day(command.to);
      const span = (to.getTime() - from.getTime()) / 86_400_000;
      if (span < 0 || span >= MAX_DAYS) invalid();
      if (!(await pool.query("SELECT 1 FROM pg_timezone_names WHERE name=$1", [command.timeZone])).rowCount) invalid();
      const args = [command.from, command.to, command.timeZone];
      const window = `bounds AS (SELECT ($1::date)::timestamp AT TIME ZONE $3 AS lo,(($2::date)+1)::timestamp AT TIME ZONE $3 AS hi),
        captured AS (SELECT t.currency,t.environment,(t.created_at AT TIME ZONE $3)::date AS day,t.amount_minor,t.order_id FROM payment_transactions t,bounds b WHERE t.kind='capture' AND t.created_at>=b.lo AND t.created_at<b.hi),
        succeeded AS (SELECT r.currency,r.environment,r.amount_minor,COALESCE(e.occurred_at,e.recorded_at,r.updated_at) AS at FROM refunds r LEFT JOIN order_events e ON e.dedupe_key='refund-succeeded:'||r.id::text WHERE r.status='succeeded'),
        refunded AS (SELECT s.currency,s.environment,(s.at AT TIME ZONE $3)::date AS day,s.amount_minor FROM succeeded s,bounds b WHERE s.at>=b.lo AND s.at<b.hi)`;
      const [totals, days] = await Promise.all([
        pool.query<{ currency: string; environment: "sandbox" | "live"; captured: string; refunded: string; orders: number }>(`WITH ${window}
          SELECT currency,environment,sum(captured)::text AS captured,sum(refunded)::text AS refunded,max(orders)::int AS orders FROM (
            SELECT currency,environment,sum(amount_minor) AS captured,0 AS refunded,count(DISTINCT order_id) AS orders FROM captured GROUP BY currency,environment
            UNION ALL SELECT currency,environment,0,sum(amount_minor),0 FROM refunded GROUP BY currency,environment) x GROUP BY currency,environment ORDER BY environment,currency`, args),
        pool.query<{ day: string; currency: string; environment: "sandbox" | "live"; captured: string; refunded: string }>(`WITH ${window}
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
