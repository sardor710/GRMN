// Task 13A: the browser cart client talks only to /api/cart and the account wishlist, sends versions,
// never sends names or prices, and turns the stored local cart into ids and quantities only.
import assert from "node:assert/strict";
import test from "node:test";
import { createCartClient, CartRequestError, legacyCartItems, LEGACY_CART_KEY } from "../../src/lib/cart-client.ts";

function recorder(responses = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body === undefined ? undefined : JSON.parse(init.body), headers: init.headers ?? {}, cache: init.cache });
    const [status, body] = responses[`${init.method ?? "GET"} ${url}`] ?? [200, { id: null, version: 0, lines: [] }];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetcher };
}
const V = "00000000-0000-4000-8000-0000000000aa";

test("cart calls use the cart endpoints with JSON bodies, versions and no-store", async () => {
  const { calls, fetcher } = recorder(), client = createCartClient(fetcher);
  await client.get();
  await client.add({ variantId: V, quantity: 2, expectedCartVersion: 3 });
  await client.add({ productKey: "1228429", quantity: 1, expectedCartVersion: 4 });
  await client.setQuantity(V, 5, 5);
  await client.remove(V, 6);
  await client.clear(7);
  await client.acknowledge(8);
  await client.merge();
  await client.importLegacy([{ id: "1228429", quantity: 2 }]);
  await client.wishlist(); await client.saveToWishlist("fenix-8"); await client.removeFromWishlist("fēnix 8/x");
  assert.deepEqual(calls.map(call => `${call.method} ${call.url}`), [
    "GET /api/cart", "POST /api/cart/lines", "POST /api/cart/lines", `PUT /api/cart/lines/${V}`, `DELETE /api/cart/lines/${V}`, "DELETE /api/cart",
    "POST /api/cart/acknowledge", "POST /api/cart/merge", "POST /api/cart/import",
    "GET /api/account/wishlist", "POST /api/account/wishlist", `DELETE /api/account/wishlist/${encodeURIComponent("fēnix 8/x")}`,
  ]);
  assert.deepEqual(calls.map(call => call.body), [
    undefined, { variantId: V, quantity: 2, expectedCartVersion: 3 }, { productKey: "1228429", quantity: 1, expectedCartVersion: 4 }, { quantity: 5, expectedCartVersion: 5 },
    { expectedCartVersion: 6 }, { expectedCartVersion: 7 }, { expectedCartVersion: 8 }, {}, { items: [{ id: "1228429", quantity: 2 }] },
    undefined, { productKey: "fenix-8" }, {},
  ]);
  for (const call of calls) { assert.equal(call.cache, "no-store"); if (call.method !== "GET") assert.equal(call.headers["content-type"], "application/json"); }
});

test("a failed cart call surfaces the status and error code", async () => {
  const { fetcher } = recorder({ "GET /api/cart": [503, { error: { code: "DEPENDENCY_UNAVAILABLE", message: "Cart services are not available" } }], "POST /api/cart/lines": [409, { error: { code: "VERSION_CONFLICT", message: "Your cart changed" } }] });
  const client = createCartClient(fetcher);
  await assert.rejects(client.get(), error => error instanceof CartRequestError && error.status === 503);
  await assert.rejects(client.add({ variantId: V, quantity: 1, expectedCartVersion: 0 }), error => error.code === "VERSION_CONFLICT" && error.status === 409);
});

test("the stored local cart becomes ids and quantities only, bounded and de-duplicated", () => {
  assert.equal(LEGACY_CART_KEY, "garmin-clone-cart");
  const raw = JSON.stringify([{ id: "1228429", name: "Forged", price: 1, qty: 2, image: "/x.jpg" }, { id: "1228429", qty: 5 }, { id: "", qty: 1 }, { id: "x", qty: 0 }, { id: "y", qty: 500 }, { qty: 1 }, null, "z", { id: "k".repeat(201), qty: 1 }]);
  assert.deepEqual(legacyCartItems(raw), [{ id: "1228429", quantity: 5 }, { id: "y", quantity: 99 }]);
  for (const value of [null, "", "not json", "{}", "[]"]) assert.deepEqual(legacyCartItems(value), []);
  assert.equal(legacyCartItems(JSON.stringify(Array.from({ length: 150 }, (_, i) => ({ id: "p" + i, qty: 1 })))).length, 100);
});
