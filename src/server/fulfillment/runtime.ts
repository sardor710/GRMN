import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createFulfillmentService } from "./service.ts";
import { createFulfillmentHTTP } from "./http.ts";

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
    handler = createFulfillmentHTTP({ service, baseURL: new URL(process.env.AUTH_BASE_URL!).origin });
  }
  return handler;
}
export async function handleFulfillmentRequest(request: Request): Promise<Response> {
  try { return await getFulfillmentHandler()(request); } catch (error) { return authErrorResponse(error); }
}
