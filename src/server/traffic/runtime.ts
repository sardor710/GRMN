import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import type { Permission } from "../context.ts";
import { cmsBackend } from "../cms/source.ts";
import { requestURL } from "../auth/request-url.ts";
import { createTrafficReports } from "./reports.ts";
import { createTrafficLinks } from "./links.ts";

// Owner 2026-11-25, PostgreSQL mode only (permissions are checked in each service):
// /api/admin/traffic  GET ?view=summary|sources|timeline|heatmap|products|devices|links&from=YYYY-MM-DD&to=YYYY-MM-DD  (orders:read)
//                     POST { action: "create_link", platform, medium, campaign, targetPath, label? } | { action: "archive_link", id }  (content:write)

const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };
function ready() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Traffic reports are not available");
  const runtime = getAuthRuntime(), pool = getDatabase().pool;
  const authorize = async (headers: Headers, permission: Permission) => { await requireStaffPrincipal(runtime, headers); return requirePermission(runtime, headers, permission); };
  const baseURL = new URL(process.env.AUTH_BASE_URL!).origin;
  return { reports: createTrafficReports({ pool, authorize }), links: createTrafficLinks({ pool, authorize, origin: baseURL }), authorize, baseURL };
}
function query(request: Request, baseURL: string): Record<string, string> {
  const url = requestURL(request, baseURL);
  if (url.origin !== baseURL) bad();
  if (request.method !== "GET" && request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
  const params = [...url.searchParams];
  if (new Set(params.map(([name]) => name)).size !== params.length) bad();
  return Object.fromEntries(params);
}

export async function handleTrafficRequest(request: Request): Promise<Response> {
  try {
    const { reports, links, authorize, baseURL } = ready(), params = query(request, baseURL);
    if (request.method === "GET") {
      const { view, ...range } = params;
      if (view === "summary") return adminJSON(await reports.summary(request.headers, range));
      if (view === "sources") return adminJSON(await reports.sources(request.headers, range));
      if (view === "timeline") return adminJSON(await reports.timeline(request.headers, range));
      if (view === "heatmap") return adminJSON(await reports.heatmap(request.headers, range));
      if (view === "products") return adminJSON(await reports.products(request.headers, range));
      if (view === "devices") return adminJSON(await reports.devices(request.headers, range));
      if (view === "links") return adminJSON(await links.list(request.headers, range));
      return bad();
    }
    if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
    if (Object.keys(params).length) bad();
    // Authorized before the body is read (as settings do); the service checks again.
    await authorize(request.headers, "content:write");
    const body = await readAdminJSON(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad();
    const { action, ...rest } = body as Record<string, unknown>;
    if (action === "create_link") return adminJSON(await links.create(request.headers, rest));
    if (action === "archive_link") return adminJSON(await links.archive(request.headers, rest));
    return bad();
  } catch (error) { return authErrorResponse(error); }
}
