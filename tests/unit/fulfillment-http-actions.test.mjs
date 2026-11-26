// Review 2026-11-26: the board's "Mark picked up" and the product warranty field reach their service methods over HTTP.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFulfillmentHTTP } from "../../src/server/fulfillment/http.ts";

const baseURL = "http://localhost:3000";
const seen = [];
const service = new Proxy({}, { get: (_target, name) => async (_headers, body) => { seen.push([name, body?.action ?? null]); return { ok: true }; } });
const handler = createFulfillmentHTTP({ service, baseURL });
const post = body => handler(new Request(`${baseURL}/api/admin/orders`, { method: "POST", headers: { origin: baseURL, "content-type": "application/json" }, body: JSON.stringify(body) }));

test("pick_up is routed to updateShipment and set_product_warranty to setProductWarranty", async () => {
  const picked = await post({ action: "pick_up", shipmentId: "00000000-0000-4000-8000-000000000001", expectedVersion: 2, idempotencyKey: "k".repeat(24) });
  assert.equal(picked.status, 200);
  const warranty = await post({ action: "set_product_warranty", productId: "00000000-0000-4000-8000-000000000002", months: 24 });
  assert.equal(warranty.status, 200);
  assert.deepEqual(seen, [["updateShipment", "pick_up"], ["setProductWarranty", null]]);
  assert.equal((await post({ action: "teleport" })).status, 400);
});
