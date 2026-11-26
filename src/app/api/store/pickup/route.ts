import { cmsBackend } from "../../../../server/cms/source.ts";
import { getDatabase } from "../../../../server/db/client.ts";
import { readStorePickup } from "../../../../server/settings/service.ts";

// 0033 (owner 2026-11-26): the pickup store for the checkout step (public: name, address, hours, phone, pin).
export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  try {
    if (cmsBackend() !== "postgres") return new Response(JSON.stringify({ enabled: false }), { headers });
    return new Response(JSON.stringify(await readStorePickup(getDatabase().pool)), { headers });
  } catch {
    // Without the store, checkout simply offers delivery only.
    return new Response(JSON.stringify({ enabled: false }), { headers });
  }
}
