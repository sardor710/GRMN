import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { requireFreshPermission, requireStaffPrincipal } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createOperationsService } from "./admin.ts";
import { createOperationsHTTP } from "./http.ts";

let handler: ReturnType<typeof createOperationsHTTP> | undefined;

// Task 12B. The job queue exists only in PostgreSQL mode. Replaying a job re-runs its side effects,
// so reading and replaying both need staff with settings:write and MFA from the last 15 minutes.
function getOperationsHandler() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Operations services are not available");
  if (!handler) {
    const runtime = getAuthRuntime();
    const service = createOperationsService({
      pool: getDatabase().pool,
      authorize: async headers => {
        await requireStaffPrincipal(runtime, headers);
        return requireFreshPermission(runtime, headers, "settings:write");
      },
    });
    handler = createOperationsHTTP({ service, baseURL: new URL(process.env.AUTH_BASE_URL!).origin });
  }
  return handler;
}
export async function handleOperationsRequest(request: Request): Promise<Response> {
  try { return await getOperationsHandler()(request); } catch (error) { return authErrorResponse(error); }
}
