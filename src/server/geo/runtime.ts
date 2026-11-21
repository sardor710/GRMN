import "server-only";
import { getDatabase } from "../db/client.ts";
import { parseAuthConfig } from "../auth/config.ts";
import { cmsBackend } from "../cms/source.ts";
import { enforceRateLimit, trustedClientAddress } from "../operations/rate-limit.ts";
import { createYandexGeocoder } from "./geocoder.ts";
import { createGeocodeHandler, GeoFailure } from "./http.ts";

// Per trusted client address (shared PostgreSQL budget, like cart/checkout): typing is debounced
// to one call per ~600 ms, so 60 per minute leaves room for pin drags. A per-process ceiling also
// protects the Yandex quota when there is no trusted proxy (development) or no database (legacy).
const PER_CLIENT_PER_MINUTE = 60;
const PROCESS_PER_MINUTE = 600;

let handler: ReturnType<typeof createGeocodeHandler> | undefined;
let windowStart = 0, windowHits = 0;

function processCeiling() {
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; windowHits = 0; }
  if (++windowHits > PROCESS_PER_MINUTE) throw new GeoFailure("RATE_LIMITED", 429, "Too many requests; try again shortly", Math.max(1, Math.ceil((windowStart + 60_000 - now) / 1000)));
}

function getHandler() {
  if (!handler) {
    let baseURL: string | null = null, secret: string | undefined;
    try { const config = parseAuthConfig(process.env); baseURL = config.baseURL; secret = config.secret; } catch { /* legacy setup: own origin only */ }
    // The geocoder key is read on the server only and never returned or logged by this route.
    // YANDEX_GEOCODER_API_KEY is preferred; the owner's NEXT_PUBLIC_ name is accepted as provided.
    const apiKey = process.env.YANDEX_GEOCODER_API_KEY || process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY || "";
    handler = createGeocodeHandler({
      geocoder: apiKey ? createYandexGeocoder({ apiKey }) : null,
      origins: request => [baseURL ?? new URL(request.url).origin],
      limit: async headers => {
        processCeiling();
        const address = trustedClientAddress(headers);
        if (address && cmsBackend() === "postgres") {
          await enforceRateLimit(getDatabase().pool, { scope: "geo:geocode", identifier: address, limit: PER_CLIENT_PER_MINUTE, windowMs: 60_000 }, secret);
        }
      },
    });
  }
  return handler;
}

export async function handleGeocodeRequest(request: Request): Promise<Response> {
  return getHandler()(request);
}
