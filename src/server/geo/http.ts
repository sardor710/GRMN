import "server-only";
import { z } from "zod";
import { getKzRegion } from "../../lib/kz-regions.ts";
import type { GeocodeResult } from "../../contracts/geo.ts";
import { GeocoderUnavailable, MAX_GEOCODE_TEXT, type YandexGeocoder } from "./geocoder.ts";

// POST /api/geo/geocode. Same-origin JSON only (GET would be callable from any page), small bodies,
// strict fields, a rate limit per trusted client address, and opaque upstream failures.

export class GeoFailure extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;
  constructor(code: string, status: number, message: string, retryAfter?: number) {
    super(message); this.name = "GeoFailure"; this.code = code; this.status = status; this.retryAfter = retryAfter;
  }
}

const MAX_BODY_BYTES = 2048;
const lang = z.enum(["en", "ru", "kk"]).default("en");
const input = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("forward"), text: z.string().trim().min(2).max(MAX_GEOCODE_TEXT), lang, regionCode: z.string().max(40).optional(), city: z.string().trim().max(120).optional() }),
  z.strictObject({ mode: z.literal("reverse"), lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180), lang }),
]);

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}
function failure(error: unknown) {
  if (error instanceof GeoFailure) return json({ error: { code: error.code, message: error.message } }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
  if (error instanceof GeocoderUnavailable) return json({ error: { code: "GEOCODER_UNAVAILABLE", message: "The map search is unavailable right now" } }, 502);
  const status = (error as { status?: unknown } | null)?.status, code = (error as { code?: unknown } | null)?.code;
  // Rate-limit and trusted-proxy failures from the shared operations layer keep their status.
  if (typeof status === "number" && typeof code === "string" && (status === 429 || status === 503)) {
    const retry = (error as { retryAfter?: unknown }).retryAfter;
    return json({ error: { code, message: (error as Error).message } }, status, typeof retry === "number" ? { "Retry-After": String(retry) } : {});
  }
  return json({ error: { code: "GEOCODER_UNAVAILABLE", message: "The map search is unavailable right now" } }, 502);
}

async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new GeoFailure("INVALID_INPUT", 400, "JSON input is required");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new GeoFailure("INVALID_INPUT", 413, "Input is too large");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new GeoFailure("INVALID_INPUT", 413, "Input is too large");
  try { return JSON.parse(raw); } catch { throw new GeoFailure("INVALID_INPUT", 400, "Invalid JSON input"); }
}

export interface GeocodeHandlerOptions {
  /** Null when the key is not configured: the route answers 503 and the form works without the map. */
  geocoder: YandexGeocoder | null;
  /** Allowed request origins (the site's own origin). */
  origins: readonly string[] | ((request: Request) => readonly string[]);
  limit: (headers: Headers) => Promise<void>;
}

export function createGeocodeHandler({ geocoder, origins, limit }: GeocodeHandlerOptions) {
  return async function handleGeocode(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") throw new GeoFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
      const origin = request.headers.get("origin");
      const allowed = typeof origins === "function" ? origins(request) : origins;
      if (!origin || !allowed.includes(origin)) throw new GeoFailure("FORBIDDEN", 403, "Invalid request origin");
      if (new URL(request.url).search) throw new GeoFailure("INVALID_INPUT", 400, "Invalid or unknown fields");
      const parsed = input.safeParse(await readBody(request));
      if (!parsed.success) throw new GeoFailure("INVALID_INPUT", 400, "Invalid or unknown fields");
      if (!geocoder) throw new GeoFailure("GEOCODER_NOT_CONFIGURED", 503, "The map search is not configured");
      await limit(request.headers);
      const command = parsed.data;
      let result: GeocodeResult;
      if (command.mode === "forward") {
        const regionCode = getKzRegion(command.regionCode)?.code;
        result = await geocoder.forward({ text: command.text, lang: command.lang, ...(regionCode ? { regionCode } : {}), ...(command.city ? { city: command.city } : {}) });
      } else {
        result = await geocoder.reverse({ lat: command.lat, lng: command.lng, lang: command.lang });
      }
      return json(result);
    } catch (error) { return failure(error); }
  };
}
