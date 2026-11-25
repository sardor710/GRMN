import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";

// Owner 2026-11-25: Admin ▸ Traffic reports (plan docs/plans/2026-11-25-traffic-analytics-xl.md).
// A "click" is a visit (traffic_sessions row, counted by when it started); page views are traffic_views rows.
// Ranges are whole local days in the store time zone; hours and weekdays too. Campaign counts add up to
// their format (medium), and formats to their platform: every visit has exactly one (platform, medium, campaign).

export const STORE_TIME_ZONE = "Asia/Almaty";
const MAX_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const rangeSchema = z.strictObject({ from: z.string().regex(DATE), to: z.string().regex(DATE) });
const invalid = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };

export type Authorize = (headers: Headers, permission: Permission) => Promise<Principal>;
export interface Range { from: string; to: string }

const day = (value: string) => {
  const date = new Date(value + "T00:00:00Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? invalid() : date;
};
/** Validates a {from,to} range of local dates (to ≥ from, at most 366 days). */
export function parseRange(input: unknown): Range {
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const from = day(parsed.data.from), to = day(parsed.data.to);
  const days = (to.getTime() - from.getTime()) / 86_400_000 + 1;
  if (days < 1 || days > MAX_DAYS) invalid();
  return parsed.data;
}
// $1 = from date, $2 = to date (inclusive), local days in the store time zone.
const WINDOW = (column: string) => `${column} >= ($1::date)::timestamp AT TIME ZONE '${STORE_TIME_ZONE}' AND ${column} < ($2::date + 1)::timestamp AT TIME ZONE '${STORE_TIME_ZONE}'`;

export interface SummaryDTO { clicks: number; visitors: number; pageViews: number }
export interface CampaignDTO { campaign: string | null; clicks: number }
export interface MediumDTO { medium: string | null; clicks: number; campaigns: CampaignDTO[] }
export interface PlatformDTO { platform: string; clicks: number; visitors: number; mediums: MediumDTO[] }
export interface SourcesDTO { platforms: PlatformDTO[] }
export interface TimelineDTO { days: { date: string; clicks: number; pageViews: number }[] }
export interface HeatmapDTO { cells: { weekday: number; hour: number; pageViews: number }[] }
export interface ProductViewsDTO { products: { productId: string; name: string | null; views: number; visitors: number }[] }
export interface DevicesDTO { os: { os: string; clicks: number }[]; deviceTypes: { deviceType: string; clicks: number }[] }

const byClicks = <T extends { clicks: number }>(a: T, b: T) => b.clicks - a.clicks;

export function createTrafficReports({ pool, authorize }: { pool: Pick<Pool, "query">; authorize: Authorize }) {
  async function prepare(headers: Headers, input: unknown) {
    await authorize(headers, "orders:read");
    const range = parseRange(input);
    return [range.from, range.to];
  }

  async function summary(headers: Headers, input: unknown): Promise<SummaryDTO> {
    const args = await prepare(headers, input);
    const row = (await pool.query<{ clicks: number; visitors: number; page_views: number }>(
      `SELECT (SELECT count(*)::int FROM traffic_sessions WHERE ${WINDOW("started_at")}) AS clicks,
              (SELECT count(DISTINCT visitor_id)::int FROM traffic_sessions WHERE ${WINDOW("started_at")}) AS visitors,
              (SELECT count(*)::int FROM traffic_views WHERE ${WINDOW("occurred_at")}) AS page_views`, args)).rows[0];
    return { clicks: row.clicks, visitors: row.visitors, pageViews: row.page_views };
  }

  async function sources(headers: Headers, input: unknown): Promise<SourcesDTO> {
    const args = await prepare(headers, input);
    const rows = (await pool.query<{ platform: string; medium: string | null; campaign: string | null; clicks: number }>(
      `SELECT platform, medium, campaign, count(*)::int AS clicks FROM traffic_sessions WHERE ${WINDOW("started_at")} GROUP BY 1,2,3`, args)).rows;
    const visitors = new Map((await pool.query<{ platform: string; visitors: number }>(
      `SELECT platform, count(DISTINCT visitor_id)::int AS visitors FROM traffic_sessions WHERE ${WINDOW("started_at")} GROUP BY 1`, args)).rows.map(r => [r.platform, r.visitors]));
    const platforms = new Map<string, PlatformDTO>();
    for (const row of rows) {
      const platform = platforms.get(row.platform) ?? { platform: row.platform, clicks: 0, visitors: visitors.get(row.platform) ?? 0, mediums: [] };
      platforms.set(row.platform, platform);
      let medium = platform.mediums.find(m => m.medium === row.medium);
      if (!medium) { medium = { medium: row.medium, clicks: 0, campaigns: [] }; platform.mediums.push(medium); }
      medium.campaigns.push({ campaign: row.campaign, clicks: row.clicks });
      medium.clicks += row.clicks;
      platform.clicks += row.clicks;
    }
    const list = [...platforms.values()].sort((a, b) => byClicks(a, b) || a.platform.localeCompare(b.platform));
    for (const p of list) { p.mediums.sort(byClicks); for (const m of p.mediums) m.campaigns.sort(byClicks); }
    return { platforms: list };
  }

  async function timeline(headers: Headers, input: unknown): Promise<TimelineDTO> {
    const args = await prepare(headers, input);
    const rows = (await pool.query<{ date: string; clicks: number; page_views: number }>(
      `WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d),
            c AS (SELECT (started_at AT TIME ZONE '${STORE_TIME_ZONE}')::date AS d, count(*)::int AS n FROM traffic_sessions WHERE ${WINDOW("started_at")} GROUP BY 1),
            v AS (SELECT (occurred_at AT TIME ZONE '${STORE_TIME_ZONE}')::date AS d, count(*)::int AS n FROM traffic_views WHERE ${WINDOW("occurred_at")} GROUP BY 1)
       SELECT to_char(days.d, 'YYYY-MM-DD') AS date, coalesce(c.n, 0) AS clicks, coalesce(v.n, 0) AS page_views
         FROM days LEFT JOIN c ON c.d = days.d LEFT JOIN v ON v.d = days.d ORDER BY days.d`, args)).rows;
    return { days: rows.map(r => ({ date: r.date, clicks: r.clicks, pageViews: r.page_views })) };
  }

  async function heatmap(headers: Headers, input: unknown): Promise<HeatmapDTO> {
    const args = await prepare(headers, input);
    const rows = (await pool.query<{ weekday: number; hour: number; page_views: number }>(
      `SELECT extract(isodow FROM occurred_at AT TIME ZONE '${STORE_TIME_ZONE}')::int AS weekday,
              extract(hour FROM occurred_at AT TIME ZONE '${STORE_TIME_ZONE}')::int AS hour, count(*)::int AS page_views
         FROM traffic_views WHERE ${WINDOW("occurred_at")} GROUP BY 1,2 ORDER BY 1,2`, args)).rows;
    return { cells: rows.map(r => ({ weekday: r.weekday, hour: r.hour, pageViews: r.page_views })) };
  }

  async function products(headers: Headers, input: unknown): Promise<ProductViewsDTO> {
    const args = await prepare(headers, input);
    const rows = (await pool.query<{ product_id: string; name: string | null; views: number; visitors: number }>(
      `SELECT v.product_id, p.name, count(*)::int AS views, count(DISTINCT s.visitor_id)::int AS visitors
         FROM traffic_views v JOIN traffic_sessions s ON s.id = v.session_id LEFT JOIN products p ON p.id = v.product_id
        WHERE v.product_id IS NOT NULL AND ${WINDOW("v.occurred_at")}
        GROUP BY v.product_id, p.name ORDER BY views DESC, v.product_id LIMIT 20`, args)).rows;
    return { products: rows.map(r => ({ productId: r.product_id, name: r.name, views: r.views, visitors: r.visitors })) };
  }

  async function devices(headers: Headers, input: unknown): Promise<DevicesDTO> {
    const args = await prepare(headers, input);
    const os = (await pool.query<{ os: string; clicks: number }>(`SELECT os, count(*)::int AS clicks FROM traffic_sessions WHERE ${WINDOW("started_at")} GROUP BY 1 ORDER BY 2 DESC, 1`, args)).rows;
    const types = (await pool.query<{ device_type: string; clicks: number }>(`SELECT device_type, count(*)::int AS clicks FROM traffic_sessions WHERE ${WINDOW("started_at")} GROUP BY 1 ORDER BY 2 DESC, 1`, args)).rows;
    return { os, deviceTypes: types.map(r => ({ deviceType: r.device_type, clicks: r.clicks })) };
  }

  return { summary, sources, timeline, heatmap, products, devices };
}
