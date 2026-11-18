import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { parseAuthConfig, AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { requirePrincipal } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createCartService } from "./service.ts";
import { createCartHandler } from "./http.ts";
import { enforceRateLimit, trustedClientAddress } from "../operations/rate-limit.ts";

// Task 21A: per trusted client address (review C1/C2/I2), shared by every instance. Generous enough
// for a shared office or mobile-carrier address; without a trusted proxy (development) no limit.
const LIMITS = { quote: 120, checkout: 30 } as const;

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
      // O07: the demo adapter is for tests and development only; production checkout is manual.
      allowDemoPayments: process.env.NODE_ENV !== "production",
      // Hold-abuse limit: unpaid manual orders are also counted per trusted client address.
      clientAddress: headers => trustedClientAddress(headers),
      identify: async headers => {
        try { return await requirePrincipal(runtime, headers); }
        catch (error) { if (error instanceof AuthFailure && error.status === 401) return null; throw error; }
      },
    });
    const pool = getDatabase().pool;
    handler = createCartHandler({ service, baseURL: config.baseURL, limit: async (scope, headers) => {
      const address = trustedClientAddress(headers);
      if (address) await enforceRateLimit(pool, { scope: `cart:${scope}`, identifier: address, limit: LIMITS[scope], windowMs: 60_000 }, config.secret);
    } });
  }
  return handler;
}
export async function handleCartRequest(request: Request): Promise<Response> {
  try { return await getCartHandler()(request); } catch (error) { return authErrorResponse(error); }
}
