import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Task 23 G1: the write freeze used for cutover (plan Section 10, step 8).
 *
 * Maintenance is on when MAINTENANCE_MODE=1 (the operator's switch; needs no database, so it also
 * freezes the legacy site) or when store_settings.maintenance_mode is true (PostgreSQL mode, cached
 * for a few seconds per process). While it is on:
 *   - storefront pages answer 503 with a maintenance page, and every customer /api route answers 503
 *     MAINTENANCE, so no customer write (cart, checkout, account) is accepted;
 *   - staff sign-in (/api/auth), admin pages, the admin API (reads and writes, so staff can prepare
 *     the closed store; each route checks staff permissions), the payment webhook intake (kept
 *     durable during a freeze, plan step 9) and the bypass route stay open;
 *   - a staff member with settings:write (fresh MFA) can take a signed, 2-hour bypass cookie and
 *     use the closed site normally to verify it. The legacy site has no bypass: its freeze is total.
 * Every business write goes through /api (there are no server actions), so the proxy is the one gate.
 */
export const BYPASS_COOKIE = "grmn-maintenance-bypass";
const BYPASS_TTL_MS = 2 * 60 * 60 * 1000;

export type MaintenanceDecision = "allow" | "page" | "api";

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function maintenanceDecision({ active, bypass, path, method }: { active: boolean; bypass: boolean; path: string; method: string }): MaintenanceDecision {
  if (!active || bypass) return "allow";
  const read = method === "GET" || method === "HEAD";
  if (under(path, "/api/auth") || under(path, "/api/payments/webhooks") || path === "/api/admin/maintenance-bypass") return "allow";
  if (under(path, "/admin") && read) return "allow";
  // Staff prepare a closed store (products, garmin.com import, uploads, content, settings): admin API
  // writes stay open, each route enforcing staff sign-in and permissions itself (owner, 2026-11-19).
  // The legacy admin login stays closed.
  if (under(path, "/api/admin") && !under(path, "/api/admin/auth")) return "allow";
  return under(path, "/api") ? "api" : "page";
}

const mac = (secret: string, expires: number) => createHmac("sha256", secret).update(`maintenance-bypass:v1:${expires}`).digest("base64url");

export function issueBypass(secret: string, now = Date.now(), ttlMs = BYPASS_TTL_MS): string {
  const expires = now + ttlMs;
  return `v1.${expires}.${mac(secret, expires)}`;
}

export function verifyBypass(secret: string, token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d{1,16}$/.test(parts[1])) return false;
  const expires = Number(parts[1]);
  if (!(expires > now)) return false;
  const expected = Buffer.from(mac(secret, expires)), given = Buffer.from(parts[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The cached maintenance flag. A failed read is "off": a failing database already answers 503. */
export function createMaintenanceFlag({ env, read, ttlMs = 5000, clock = Date.now }: { env: Readonly<Record<string, string | undefined>>; read: () => Promise<boolean>; ttlMs?: number; clock?: () => number }): () => Promise<boolean> {
  const forced = env.MAINTENANCE_MODE;
  if (forced !== undefined && forced !== "0" && forced !== "1") throw new Error("Missing or invalid server configuration: MAINTENANCE_MODE");
  if (forced === "1") return async () => true;
  let cached: { value: boolean; at: number } | undefined;
  return async () => {
    const now = clock();
    if (cached && now - cached.at <= ttlMs) return cached.value;
    let value = false;
    try { value = await read(); } catch { value = false; }
    cached = { value, at: now };
    return value;
  };
}

export const maintenancePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Maintenance</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fff;color:#111}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.5rem}p{color:#555;line-height:1.5}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}p{color:#aaa}}</style></head>
<body><main><h1>We'll be right back</h1><p>The store is being upgraded. Please check back shortly.</p><p lang="ru">Магазин обновляется. Пожалуйста, зайдите чуть позже.</p><p lang="kk">Дүкен жаңартылуда. Біраз уақыттан кейін қайта кіріңіз.</p></main></body></html>`;

export function maintenanceResponse(kind: "page" | "api"): Response {
  const headers = { "Cache-Control": "no-store", "Retry-After": "300" };
  return kind === "api"
    ? Response.json({ error: { code: "MAINTENANCE", message: "The store is under maintenance; try again shortly" } }, { status: 503, headers })
    : new Response(maintenancePage, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

type Authorize = (headers: Headers, permission: "settings:write") => Promise<{ userId: string }>;

/** POST /api/admin/maintenance-bypass issues the bypass cookie; DELETE clears it. */
export function createBypassHandler({ secret, baseURL, enabled, authorize, audit }: { secret: string; baseURL: string; enabled: boolean; authorize: Authorize; audit: (userId: string, action: string) => Promise<void> }) {
  const error = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
  const secure = new URL(baseURL).protocol === "https:" ? "; Secure" : "";
  return async (request: Request): Promise<Response> => {
    if (!enabled) return error(503, "UNAVAILABLE", "Maintenance bypass is not available");
    if (request.method !== "POST" && request.method !== "DELETE") return error(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    if (request.headers.get("origin") !== baseURL) return error(403, "FORBIDDEN", "Cross-origin request refused");
    let principal: { userId: string };
    try { principal = await authorize(request.headers, "settings:write"); }
    catch (failure) {
      const status = (failure as { status?: unknown }).status;
      return status === 401 || status === 403 ? error(status, String((failure as { code?: unknown }).code ?? "FORBIDDEN"), "Permission is required") : error(503, "UNAVAILABLE", "Authorization is unavailable");
    }
    const issuing = request.method === "POST";
    await audit(principal.userId, issuing ? "maintenance.bypass_issued" : "maintenance.bypass_cleared");
    const value = issuing ? issueBypass(secret) : "";
    const cookie = `${BYPASS_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${issuing ? BYPASS_TTL_MS / 1000 : 0}${secure}`;
    return Response.json({ bypass: issuing }, { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } });
  };
}
