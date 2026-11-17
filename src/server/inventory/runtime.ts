import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createInventoryService } from "./service.ts";
import { createInventoryHTTP } from "./http.ts";

let handler: ReturnType<typeof createInventoryHTTP> | undefined;

// Inventory exists only in PostgreSQL mode. Legacy JSON stock is never edited from here.
function getInventoryHandler() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Inventory services are not available");
  if (!handler) {
    const runtime = getAuthRuntime();
    const service = createInventoryService({
      pool: getDatabase().pool,
      authorize: async (headers, permission) => {
        await requireStaffPrincipal(runtime, headers);
        return requirePermission(runtime, headers, permission);
      },
    });
    handler = createInventoryHTTP({ service, baseURL: new URL(process.env.AUTH_BASE_URL!).origin });
  }
  return handler;
}
export async function handleInventoryRequest(request: Request): Promise<Response> {
  try { return await getInventoryHandler()(request); } catch (error) { return authErrorResponse(error); }
}
