import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import type { InventoryService } from "./service.ts";
import { requestURL } from "../auth/request-url.ts";

// /api/admin/inventory. GET ?variantId= reads a balance and its recent ledger (catalog:read);
// GET ?view=reconciliation compares balances with the ledger (inventory:write);
// POST records an audited stock adjustment (inventory:write). Permissions live in the service.
const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };

export function createInventoryHTTP(input: { service: InventoryService; baseURL: string }) {
  const { service, baseURL } = input;
  return async function handleInventory(request: Request): Promise<Response> {
    try {
      const url = requestURL(request, baseURL);
      if (url.origin !== baseURL || url.pathname !== "/api/admin/inventory") bad();
      const params = [...url.searchParams];
      if (new Set(params.map(([key]) => key)).size !== params.length) bad();
      const query = Object.fromEntries(params);
      if (request.method === "GET") {
        if (params.length === 1 && query.view === "reconciliation") return adminJSON(await service.reconcile(request.headers));
        if (params.length === 1 && query.variantId !== undefined) return adminJSON(await service.getStock(request.headers, query.variantId));
        return bad();
      }
      if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
      if (request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      if (params.length) bad();
      return adminJSON(await service.adjust(request.headers, await readAdminJSON(request)));
    } catch (error) { return authErrorResponse(error); }
  };
}
