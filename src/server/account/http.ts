import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import type { AccountService } from "./service.ts";
import type { WishlistService } from "../wishlist/service.ts";

// HTTP mapping for /api/account/*. Identity always comes from the session cookie inside the
// service; query strings accept only pagination, and bodies never carry an owner.
const bad = (message = "Invalid or unknown fields"): never => { throw new AuthFailure("INVALID_INPUT", 400, message); };
const missing = (): never => { throw new AuthFailure("NOT_FOUND", 404, "Not found"); };
const method = (): never => { throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed"); };

function query(url: URL, allowed: readonly string[]): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of url.searchParams) { if (!allowed.includes(key) || Object.hasOwn(result, key)) bad(); result[key] = value; }
  return result;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : bad();
}

export function createAccountHandler(input: { service: AccountService; baseURL: string; wishlist?: WishlistService }) {
  const { service, baseURL, wishlist } = input;
  return async function handleAccount(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== baseURL) bad();
      const read = request.method === "GET";
      if (!read && request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      const prefix = "/api/account/";
      if (!url.pathname.startsWith(prefix)) missing();
      const [resource, id, ...rest] = url.pathname.slice(prefix.length).split("/");
      if (rest.length || id === "") missing();
      if (resource === "profile" && id === undefined) {
        query(url, []);
        if (read) return adminJSON(await service.getProfile(request.headers));
        if (request.method === "PUT") return adminJSON(await service.saveProfile(request.headers, await readAdminJSON(request)));
        return method();
      }
      if (resource === "addresses") {
        query(url, []);
        if (id === undefined) {
          if (read) return adminJSON(await service.listAddresses(request.headers));
          if (request.method !== "POST") return method();
          const body = object(await readAdminJSON(request));
          if ("id" in body || "expectedVersion" in body) bad();
          return adminJSON(await service.saveAddress(request.headers, body));
        }
        if (request.method === "PUT") {
          const body = object(await readAdminJSON(request));
          if ("id" in body) bad();
          return adminJSON(await service.saveAddress(request.headers, { ...body, id }));
        }
        if (request.method === "DELETE") {
          const body = object(await readAdminJSON(request));
          if (Object.keys(body).some(key => key !== "expectedVersion")) bad();
          return adminJSON(await service.deleteAddress(request.headers, id, body.expectedVersion));
        }
        return method();
      }
      if ((resource === "phone" || resource === "claims") && id === undefined) {
        query(url, []);
        if (request.method !== "POST") return method();
        const body = object(await readAdminJSON(request));
        return adminJSON(resource === "phone" ? await service.changePhone(request.headers, body) : await service.claimLegacyOrder(request.headers, body));
      }
      if (resource === "wishlist" && wishlist) {
        query(url, []);
        if (id === undefined) {
          if (read) return adminJSON(await wishlist.list(request.headers));
          return request.method === "POST" ? adminJSON(await wishlist.add(request.headers, await readAdminJSON(request))) : method();
        }
        let key = "";
        try { key = decodeURIComponent(id); } catch { bad(); }
        return request.method === "DELETE" ? adminJSON(await wishlist.remove(request.headers, key)) : method();
      }
      if (resource === "orders") {
        if (!read) return method();
        if (id !== undefined) { query(url, []); return adminJSON(await service.getOwnOrder(request.headers, id)); }
        const params = query(url, ["limit", "cursor"]);
        if (params.limit !== undefined && !/^\d{1,3}$/.test(params.limit)) bad();
        return adminJSON(await service.getOwnOrders(request.headers, { ...(params.limit !== undefined ? { limit: Number(params.limit) } : {}), ...(params.cursor !== undefined ? { cursor: params.cursor } : {}) }));
      }
      return missing();
    } catch (error) { return authErrorResponse(error); }
  };
}

// POST /api/admin/order-claims: staff issue a legacy-claim receipt (customers:write + MFA admission,
// enforced by the service principal). Same-origin only; no query parameters.
export function createClaimApprovalHandler(input: { service: AccountService; baseURL: string }) {
  const { service, baseURL } = input;
  return async function handleClaimApproval(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== baseURL || url.pathname !== "/api/admin/order-claims") missing();
      if (request.method !== "POST") return method();
      if (request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      query(url, []);
      return adminJSON(await service.approveLegacyClaim(request.headers, object(await readAdminJSON(request))));
    } catch (error) { return authErrorResponse(error); }
  };
}
