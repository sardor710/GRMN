import "server-only";
import path from "node:path";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import type { Permission } from "../context.ts";
import { cmsBackend } from "../cms/source.ts";
import { createReportsService } from "./service.ts";
import { createExportService } from "./exports.ts";
import { createSettingsService } from "../settings/service.ts";
import { requestURL } from "../auth/request-url.ts";

// Task 18B routes, PostgreSQL mode only (permissions are checked in each service):
// /api/admin/reports   GET ?view=summary&from=&to=&timeZone=  (orders:read)
//                      GET ?view=status_counts&from=&to=&timeZone=             (orders:read, Task 4.1)
//                      GET ?view=recent_orders&from=&to=&timeZone=[&limit=10]  (orders:read, Task 4.1)
//                      GET ?view=best_sellers&from=&to=&timeZone=[&limit=8]    (orders:read, Task 4.1)
//                      GET ?view=low_stock[&limit=]           (catalog:read)
// /api/admin/exports   GET (own jobs) | GET ?id=<uuid> (download CSV) | POST { kind, ... }   (exports:create)
// /api/admin/settings  GET | PUT { expectedVersion, ...fields } | POST { action: "set_exchange_rate", ... } (settings:write)

const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };
export const storageDir = () => process.env.MEDIA_STORAGE_DIR
  ? path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_STORAGE_DIR)
  : path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "media");
function ready() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Reports are not available");
  const runtime = getAuthRuntime(), pool = getDatabase().pool;
  const authorize = async (headers: Headers, permission: Permission) => { await requireStaffPrincipal(runtime, headers); return requirePermission(runtime, headers, permission); };
  return {
    reports: createReportsService({ pool, authorize }), exports: createExportService({ pool, authorize, storageDir: storageDir() }),
    settings: createSettingsService({ pool, authorize }), baseURL: new URL(process.env.AUTH_BASE_URL!).origin,
  };
}
function query(request: Request, baseURL: string): Record<string, string> {
  const url = requestURL(request, baseURL);
  if (url.origin !== baseURL) bad();
  if (request.method !== "GET" && request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
  const params = [...url.searchParams];
  if (new Set(params.map(([name]) => name)).size !== params.length) bad();
  return Object.fromEntries(params);
}
const limit = (value: string | undefined) => value === undefined ? undefined : /^\d{1,3}$/.test(value) ? Number(value) : bad();

export async function handleReportsRequest(request: Request): Promise<Response> {
  try {
    const { reports, baseURL } = ready(), params = query(request, baseURL);
    if (request.method !== "GET") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
    const { view, ...rest } = params;
    if (view === "summary") return adminJSON(await reports.summary(request.headers, rest));
    if (view === "status_counts") return adminJSON(await reports.statusCounts(request.headers, rest));
    if (view === "recent_orders" || view === "best_sellers") {
      const { limit: raw, ...range } = rest, input = raw === undefined ? range : { ...range, limit: limit(raw) };
      return adminJSON(view === "recent_orders" ? await reports.recentOrders(request.headers, input) : await reports.bestSellers(request.headers, input));
    }
    if (view === "low_stock") { const { limit: raw, ...extra } = rest; if (Object.keys(extra).length) bad(); return adminJSON(await reports.lowStock(request.headers, raw === undefined ? {} : { limit: limit(raw) })); }
    return bad();
  } catch (error) { return authErrorResponse(error); }
}

export async function handleExportsRequest(request: Request): Promise<Response> {
  try {
    const { exports, baseURL } = ready(), params = query(request, baseURL);
    if (request.method === "GET") {
      const names = Object.keys(params);
      if (!names.length) return adminJSON(await exports.list(request.headers));
      if (names.length !== 1 || !params.id) bad();
      const file = await exports.download(request.headers, params.id);
      return new Response(new Uint8Array(file.bytes), { headers: {
        "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      } });
    }
    if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
    if (Object.keys(params).length) bad();
    return adminJSON(await exports.request(request.headers, await readAdminJSON(request)));
  } catch (error) { return authErrorResponse(error); }
}

export async function handleSettingsRequest(request: Request): Promise<Response> {
  try {
    const { settings, baseURL } = ready(), params = query(request, baseURL);
    if (Object.keys(params).length) bad();
    if (request.method === "GET") return adminJSON(await settings.get(request.headers));
    if (request.method === "PUT") return adminJSON(await settings.update(request.headers, await readAdminJSON(request)));
    if (request.method === "POST") {
      const body = await readAdminJSON(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) return bad();
      const { action, ...rest } = body as Record<string, unknown>;
      if (action === "set_exchange_rate") return adminJSON(await settings.setExchangeRate(request.headers, rest));
      return bad();
    }
    throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
  } catch (error) { return authErrorResponse(error); }
}
