import "server-only";
import type { Pool } from "pg";
import { authErrorResponse } from "../auth/http.ts";
import { AuthFailure } from "../auth/config.ts";
import { acceptsWebhooks, type PaymentProviders } from "./provider.ts";
import { receiveWebhook } from "./service.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "cache-control": "no-store" };
const MAX_BODY_BYTES = 64 * 1024;
const tooLarge = () => new AuthFailure("PAYLOAD_TOO_LARGE", 413, "The webhook body is too large");

// Reads at most `limit` bytes, whatever Content-Length claims (or chunked encoding), then stops.
async function readCapped(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw tooLarge();
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel().catch(() => undefined); throw tooLarge(); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

/**
 * The browser's return from a payment page. It writes nothing and trusts nothing in the query:
 * it only sends the shopper back to the cart, which polls the server order status. Payment is
 * established by a verified webhook or reconciliation, never by this URL.
 */
export function handlePaymentReturn(request: Request): Response {
  const order = new URL(request.url).searchParams.get("order");
  const target = new URLSearchParams();
  if (order && UUID.test(order)) target.set("order", order.toLowerCase());
  const query = target.toString();
  return new Response(null, { status: 303, headers: { ...NO_STORE, location: "/cart" + (query ? "?" + query : "") } });
}

/** POST /api/payments/webhooks/<provider>: the raw body is stored first, then verified and queued. */
export function createWebhookHandler(input: { pool: () => Pool; providers: () => PaymentProviders }) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
      const name = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
      const providers = input.providers();
      // Review I6: unknown and simulated providers, and adapters without webhooks (the D03a sandbox and
      // the O07 manual adapter), are refused before any byte of the body is read.
      if (!acceptsWebhooks(providers.get(name))) throw new AuthFailure("NOT_FOUND", 404, "Not found");
      const body = await readCapped(request, MAX_BODY_BYTES);
      const result = await receiveWebhook(input.pool(), providers, name, body, request.headers);
      if (result.status === "rejected") return Response.json({ error: { code: "WEBHOOK_REJECTED", message: "Signature or context is invalid" } }, { status: 401, headers: NO_STORE });
      return Response.json({ received: true }, { status: 200, headers: NO_STORE });
    } catch (error) {
      return authErrorResponse(error);
    }
  };
}
