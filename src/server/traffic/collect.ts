import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { enforceRateLimit, trustedClientAddress } from "../operations/rate-limit.ts";
import { classifySource, type Source } from "./classify.ts";
import { parseUserAgent } from "./user-agent.ts";

// Owner 2026-11-25: page-view collector behind POST /api/t (plan docs/plans/2026-11-25-traffic-analytics-xl.md).
// - A visit (traffic_sessions row) is one "click" for its source. A new visit starts when the browser has no
//   valid visit cookie for this visitor, the visit was idle for more than 30 minutes, or the landing URL
//   carries campaign params (utm_source / fbclid / gclid / yclid) that classify differently from the visit.
// - Every accepted beacon is one traffic_views row. Staff browsers, bots, /admin and /api, and prefetches
//   are ignored. No IP address or raw user agent is stored: only parsed OS / device type / browser family.
// - Cookies: grmn_vid (visitor, 395 days) and grmn_sid (visit, 30 minutes, renewed on every view).

export const MAX_BEACON_BYTES = 4096;
export const VISITOR_COOKIE = "grmn_vid", VISIT_COOKIE = "grmn_sid";
export const VISITOR_MAX_AGE = 34_128_000, VISIT_MAX_AGE = 1800;
const IDLE_MINUTES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPAIGN_PARAMS = ["utm_source", "fbclid", "gclid", "yclid"];

const beaconSchema = z.strictObject({
  v: z.literal(1),
  url: z.string().min(1).max(2048),
  referrer: z.string().max(2048),
  productId: z.string().regex(UUID).optional(),
  locale: z.enum(["en", "ru", "kk"]).optional(),
});

const invalid = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid beacon"); };

export interface CollectResult { stored: boolean; setCookies: { vid: string; sid: string } | null }
export interface TrafficCollectorDeps { pool: Pick<Pool, "query">; ownHost: string; isStaff: (headers: Headers) => Promise<boolean> }

function parseBeacon(raw: string, ownHost: string) {
  if (Buffer.byteLength(raw, "utf8") > MAX_BEACON_BYTES) invalid();
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return invalid(); }
  const parsed = beaconSchema.safeParse(json);
  if (!parsed.success) return invalid();
  let url: URL;
  try { url = new URL(parsed.data.url); } catch { return invalid(); }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname.toLowerCase() !== ownHost.toLowerCase()) invalid();
  return { ...parsed.data, url };
}

const isPrefetch = (headers: Headers) => /prefetch|prerender/i.test(`${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("x-moz") ?? ""}`);
const localeOf = (path: string, given?: string) => given ?? (/^\/(ru|kk|en)(?:\/|$)/.exec(path)?.[1] ?? null);
const sameSource = (a: Source, row: { platform: string; medium: string | null; campaign: string | null }) =>
  a.platform === row.platform && a.medium === row.medium && a.campaign === row.campaign;

export function createTrafficCollector({ pool, ownHost, isStaff }: TrafficCollectorDeps) {
  async function collect(headers: Headers, body: string, cookies: { vid?: string; sid?: string }): Promise<CollectResult> {
    const beacon = parseBeacon(body, ownHost);
    const path = beacon.url.pathname.slice(0, 512) || "/";
    const ua = parseUserAgent(headers.get("user-agent") ?? "");
    if (ua.bot || isPrefetch(headers) || /^\/(?:admin|api)(?:\/|$)/.test(path)) return { stored: false, setCookies: null };
    if (await isStaff(headers)) return { stored: false, setCookies: null };

    const locale = localeOf(path, beacon.locale);
    const source = classifySource({ url: beacon.url, referrer: beacon.referrer || null, userAgent: headers.get("user-agent") ?? "", ownHost });
    const vid = cookies.vid && UUID.test(cookies.vid) ? cookies.vid.toLowerCase() : randomUUID();
    const hasCampaign = CAMPAIGN_PARAMS.some(name => beacon.url.searchParams.get(name)?.trim());

    let sid: string | null = null;
    if (cookies.sid && UUID.test(cookies.sid)) {
      const current = (await pool.query<{ id: string; platform: string; medium: string | null; campaign: string | null }>(
        `SELECT id, platform, medium, campaign FROM traffic_sessions
          WHERE id=$1 AND visitor_id=$2 AND last_seen_at > now() - ($3::int * interval '1 minute')`,
        [cookies.sid, vid, IDLE_MINUTES])).rows[0];
      if (current && (!hasCampaign || sameSource(source, current))) sid = current.id;
    }
    if (sid) {
      await pool.query("UPDATE traffic_sessions SET views = views + 1, last_seen_at = now() WHERE id=$1", [sid]);
    } else {
      sid = randomUUID();
      await pool.query(
        `INSERT INTO traffic_sessions(id, visitor_id, platform, medium, campaign, referrer_host, landing_path, locale, os, device_type, browser)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [sid, vid, source.platform, source.medium, source.campaign, source.referrerHost, path, locale, ua.os, ua.deviceType, ua.browser]);
    }
    await pool.query("INSERT INTO traffic_views(id, session_id, path, product_id, locale) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), sid, path, beacon.productId ?? null, locale]);
    return { stored: true, setCookies: { vid, sid } };
  }
  return { collect };
}
export type TrafficCollector = ReturnType<typeof createTrafficCollector>;

function readCookies(header: string | null): { vid?: string; sid?: string } {
  const out: { vid?: string; sid?: string } = {};
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (name === VISITOR_COOKIE) out.vid = value;
    if (name === VISIT_COOKIE) out.sid = value;
  }
  return out;
}

export interface BeaconHandlerDeps {
  collector: TrafficCollector; pool: Pick<Pool, "query">; baseURL: string; secret?: string;
  /** true when the TLS proxy sets x-grmn-client-ip (production); without it there is no per-address limit. */
  trustedProxy: boolean; limit?: number;
}

/** POST /api/t: 204 accepted-or-ignored, 400 malformed, 403 foreign origin, 405 other methods, 429 rate limited. */
export function createBeaconHandler({ collector, pool, baseURL, secret, trustedProxy, limit = 60 }: BeaconHandlerDeps) {
  const origin = new URL(baseURL).origin, secure = origin.startsWith("https:");
  const empty = (status: number, headers?: Headers) => new Response(null, { status, headers });
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return empty(405, new Headers({ allow: "POST" }));
    try {
      const sentOrigin = request.headers.get("origin");
      if (sentOrigin ? sentOrigin !== origin : request.headers.get("sec-fetch-site") !== "same-origin") throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      const declared = Number(request.headers.get("content-length") ?? "0");
      if (declared > MAX_BEACON_BYTES) invalid();
      const address = trustedProxy ? trustedClientAddress(request.headers, { AUTH_TRUSTED_IP_HEADER: "x-grmn-client-ip" }) : null;
      if (address) await enforceRateLimit(pool, { scope: "traffic:beacon", identifier: address, limit, windowMs: 60_000 }, secret);
      const body = await request.text();
      const result = await collector.collect(request.headers, body, readCookies(request.headers.get("cookie")));
      const headers = new Headers({ "cache-control": "no-store" });
      if (result.setCookies) {
        const flags = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
        headers.append("set-cookie", `${VISITOR_COOKIE}=${result.setCookies.vid}; Max-Age=${VISITOR_MAX_AGE}; ${flags}`);
        headers.append("set-cookie", `${VISIT_COOKIE}=${result.setCookies.sid}; Max-Age=${VISIT_MAX_AGE}; ${flags}`);
      }
      return empty(204, headers);
    } catch (error) {
      if (error instanceof AuthFailure) {
        const headers = new Headers({ "cache-control": "no-store" });
        if (error.status === 429 && error.retryAfter) headers.set("retry-after", String(error.retryAfter));
        return empty(error.status, headers);
      }
      throw error;
    }
  };
}

/** Worker: deletes visits (and, by cascade, their page views) older than the retention period (13 months). */
export async function pruneTraffic(pool: Pick<Pool, "query">, { olderThanMonths = 13 }: { olderThanMonths?: number } = {}): Promise<{ deleted: number }> {
  const result = await pool.query("DELETE FROM traffic_sessions WHERE started_at < now() - ($1::int * interval '1 month')", [olderThanMonths]);
  return { deleted: result.rowCount ?? 0 };
}
