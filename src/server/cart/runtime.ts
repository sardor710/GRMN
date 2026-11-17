import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { parseAuthConfig, AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { requirePrincipal } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createCartService } from "./service.ts";
import { createCartHandler } from "./http.ts";

let handler: ReturnType<typeof createCartHandler> | undefined;

// Server carts exist only in PostgreSQL mode with real auth. In legacy mode the route is closed (503)
// and the browser keeps its local cart; no shared or demo cart is ever served.
function getCartHandler() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Cart services are not available");
  const runtime = getAuthRuntime();
  if (!handler) {
    const config = parseAuthConfig(process.env);
    const service = createCartService({
      database: getDatabase(), secret: config.secret,
      identify: async headers => {
        try { return await requirePrincipal(runtime, headers); }
        catch (error) { if (error instanceof AuthFailure && error.status === 401) return null; throw error; }
      },
    });
    handler = createCartHandler({ service, baseURL: config.baseURL });
  }
  return handler;
}
export async function handleCartRequest(request: Request): Promise<Response> {
  try { return await getCartHandler()(request); } catch (error) { return authErrorResponse(error); }
}
