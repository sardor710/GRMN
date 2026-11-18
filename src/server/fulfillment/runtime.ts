import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createFulfillmentService } from "./service.ts";
import { createFulfillmentHTTP } from "./http.ts";
import { createAfterSalesService } from "./aftersales.ts";
import { paymentProviders } from "../payments/providers.ts";
import { createManualPaymentService } from "../payments/manual.ts";

let handler: ReturnType<typeof createFulfillmentHTTP> | undefined;

// Fulfillment (Task 16A) exists only in PostgreSQL mode; legacy JSON orders are never edited from here.
function getFulfillmentHandler() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Fulfillment services are not available");
  if (!handler) {
    const runtime = getAuthRuntime();
    const service = createFulfillmentService({
      pool: getDatabase().pool,
      authorize: async (headers, permission) => {
        await requireStaffPrincipal(runtime, headers);
        return requirePermission(runtime, headers, permission);
      },
    });
    const authorize = async (headers: Headers, permission: Parameters<typeof requirePermission>[2]) => {
      await requireStaffPrincipal(runtime, headers);
      return requirePermission(runtime, headers, permission);
    };
    // Task 16B: cancellations, refunds (payments:refund needs fresh MFA) and returns.
    const aftersales = createAfterSalesService({ pool: getDatabase().pool, authorize, providers: paymentProviders() });
    // O07 (Task 21C): manual payment confirmation (payments:confirm, fresh MFA) and manual refund payouts.
    const manualPayments = createManualPaymentService({ pool: getDatabase().pool, authorize });
    handler = createFulfillmentHTTP({ service, aftersales, manualPayments, baseURL: new URL(process.env.AUTH_BASE_URL!).origin });
  }
  return handler;
}
export async function handleFulfillmentRequest(request: Request): Promise<Response> {
  try { return await getFulfillmentHandler()(request); } catch (error) { return authErrorResponse(error); }
}
