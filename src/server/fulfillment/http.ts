import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import type { FulfillmentService } from "./service.ts";

// /api/admin/orders in PostgreSQL mode (Task 16A).
// GET (orders:read): no query or ?fulfillmentStatus=&cursor=&limit= lists the queue; ?id= reads one order.
// POST (orders:fulfill, same origin): { action: "create_shipment", ... } or
// { action: "dispatch" | "deliver" | "cancel" | "annotate", shipmentId, ... }. Permissions live in the service.
const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };

export function createFulfillmentHTTP(input: { service: FulfillmentService; baseURL: string }) {
  const { service, baseURL } = input;
  return async function handleFulfillment(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== baseURL || url.pathname !== "/api/admin/orders") bad();
      const params = [...url.searchParams];
      if (new Set(params.map(([name]) => name)).size !== params.length) bad();
      const query = Object.fromEntries(params);
      if (request.method === "GET") {
        if (query.id !== undefined) return params.length === 1 ? adminJSON(await service.getOrder(request.headers, query.id)) : bad();
        return adminJSON(await service.listOrders(request.headers, query));
      }
      if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
      if (request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      if (params.length) bad();
      const body = await readAdminJSON(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) return bad();
      const { action, ...rest } = body as Record<string, unknown>;
      if (action === "create_shipment") return adminJSON(await service.createShipment(request.headers, rest));
      if (action === "dispatch" || action === "deliver" || action === "cancel" || action === "annotate") return adminJSON(await service.updateShipment(request.headers, body));
      return bad();
    } catch (error) { return authErrorResponse(error); }
  };
}
