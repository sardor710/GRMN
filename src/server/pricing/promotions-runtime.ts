import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import type { Permission } from "../context.ts";
import { requestURL } from "../auth/request-url.ts";
import { createPromotionsAdmin } from "./promotions-admin.ts";

// /api/admin/discounts on PostgreSQL (owner 2026-11-19): GET → { discounts }, POST { …discount } →
// { success, discount }, DELETE ?id=<uuid> → { success } (archives; promotions are commerce history).
export async function handleDiscountsRequest(request: Request): Promise<Response> {
  try {
    const runtime = getAuthRuntime(), baseURL = new URL(process.env.AUTH_BASE_URL!).origin;
    const authorize = async (headers: Headers, permission: Permission) => { await requireStaffPrincipal(runtime, headers); return requirePermission(runtime, headers, permission); };
    const promotions = createPromotionsAdmin({ pool: getDatabase().pool, authorize });
    const url = requestURL(request, baseURL);
    if (url.origin !== baseURL) throw new AuthFailure("INVALID_INPUT", 400, "Invalid request");
    if (request.method !== "GET" && request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
    if (request.method === "GET") return adminJSON({ discounts: await promotions.list(request.headers), backend: "postgres" });
    if (request.method === "POST") return adminJSON({ success: true, discount: await promotions.save(request.headers, await readAdminJSON(request)) });
    if (request.method === "DELETE") { const id = url.searchParams.get("id") ?? ""; return adminJSON({ success: true, ...(await promotions.remove(request.headers, id)) }); }
    throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
  } catch (error) { return authErrorResponse(error); }
}
