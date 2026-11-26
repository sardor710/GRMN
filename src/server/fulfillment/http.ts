import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import type { FulfillmentService } from "./service.ts";
import type { AfterSalesService } from "./aftersales.ts";
import type { ManualPaymentService } from "../payments/manual.ts";
import { requestURL } from "../auth/request-url.ts";

// /api/admin/orders in PostgreSQL mode (Task 16A).
// GET (orders:read): no query or ?fulfillmentStatus=&paymentMode=&cursor=&limit= lists the queue; ?id= reads one order.
// POST (orders:fulfill, same origin): { action: "create_shipment", ... } or
// { action: "dispatch" | "deliver" | "cancel" | "annotate", shipmentId, ... }; Task 16B adds
// "cancel_order", "refund", "create_return" and "update_return" (the after-sales service). O07 (Task 21C)
// adds "confirm_payment" (payments:confirm) and "complete_manual_refund" (payments:refund). Permissions live in the services.
const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };

export function createFulfillmentHTTP(input: { service: FulfillmentService; aftersales?: AfterSalesService; manualPayments?: ManualPaymentService; baseURL: string }) {
  const { service, aftersales, manualPayments, baseURL } = input;
  return async function handleFulfillment(request: Request): Promise<Response> {
    try {
      const url = requestURL(request, baseURL);
      if (url.origin !== baseURL || url.pathname !== "/api/admin/orders") bad();
      const params = [...url.searchParams];
      if (new Set(params.map(([name]) => name)).size !== params.length) bad();
      const query = Object.fromEntries(params);
      if (request.method === "GET") {
        if (query.id !== undefined) return params.length === 1 ? adminJSON(await service.getOrder(request.headers, query.id)) : bad();
        // 0030: the product editor's serial setting (catalog:read).
        if (query.serialProduct !== undefined) return params.length === 1 ? adminJSON(await service.getProductSerial(request.headers, query.serialProduct)) : bad();
        return adminJSON(await service.listOrders(request.headers, query));
      }
      if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
      if (request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
      if (params.length) bad();
      const body = await readAdminJSON(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) return bad();
      const { action, ...rest } = body as Record<string, unknown>;
      if (action === "create_shipment") return adminJSON(await service.createShipment(request.headers, rest));
      if (action === "set_product_serial_policy") return adminJSON(await service.setProductSerial(request.headers, rest));
      if (action === "dispatch" || action === "deliver" || action === "cancel" || action === "annotate" || action === "set_serials") return adminJSON(await service.updateShipment(request.headers, body));
      if (manualPayments) {
        if (action === "confirm_payment") return adminJSON(await manualPayments.confirm(request.headers, rest));
        if (action === "complete_manual_refund") return adminJSON(await manualPayments.completeRefund(request.headers, rest));
      }
      if (aftersales) {
        if (action === "cancel_order") return adminJSON(await aftersales.cancelOrder(request.headers, rest));
        if (action === "refund") return adminJSON(await aftersales.refund(request.headers, rest));
        if (action === "create_return") return adminJSON(await aftersales.createReturn(request.headers, rest));
        if (action === "update_return") { const { returnAction, ...fields } = rest; return adminJSON(await aftersales.updateReturn(request.headers, { ...fields, action: returnAction })); }
      }
      return bad();
    } catch (error) { return authErrorResponse(error); }
  };
}
