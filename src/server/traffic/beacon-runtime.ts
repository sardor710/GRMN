import "server-only";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { parseAuthConfig } from "../auth/config.ts";
import { getSessionIdentity } from "../auth/principal.ts";
import { cmsBackend } from "../cms/source.ts";
import { createBeaconHandler, createTrafficCollector } from "./collect.ts";

// Owner 2026-11-25: POST /api/t wiring. PostgreSQL mode with auth only; otherwise the beacon is accepted
// and dropped (204), so the storefront never shows an error for analytics.

let handler: ReturnType<typeof createBeaconHandler> | undefined;

function getHandler() {
  if (handler) return handler;
  const config = parseAuthConfig(process.env), runtime = getAuthRuntime(), pool = getDatabase().pool;
  const collector = createTrafficCollector({
    pool, ownHost: new URL(config.baseURL).hostname,
    // Only browsers carrying a session cookie can be staff; everyone else skips the session lookup.
    isStaff: async headers => (headers.get("cookie") ?? "").includes("grmn-auth") && Boolean((await getSessionIdentity(runtime, headers))?.staff),
  });
  handler = createBeaconHandler({ collector, pool, baseURL: config.baseURL, secret: config.secret, trustedProxy: config.trustedIPHeader !== null });
  return handler;
}

export async function handleBeaconRequest(request: Request): Promise<Response> {
  if (cmsBackend() !== "postgres" || process.env.AUTH_ENABLED !== "1") return new Response(null, { status: request.method === "POST" ? 204 : 405 });
  return getHandler()(request);
}
