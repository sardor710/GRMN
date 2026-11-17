// Task 13A: the cart API routes bind the session/capability-owned handler and stay closed (503, no-store)
// outside PostgreSQL + auth mode, where the browser keeps its local cart.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("every cart API route binds the cart handler and stays closed outside postgres+auth mode", async () => {
  const routes = { "": ["GET", "DELETE"], "lines": ["POST"], "lines/[variantId]": ["PUT", "DELETE"], "merge": ["POST"], "import": ["POST"], "acknowledge": ["POST"], "quote": ["POST"], "checkout": ["POST"], "checkout/status": ["POST"] };
  const saved = { AUTH_ENABLED: process.env.AUTH_ENABLED, CMS_BACKEND: process.env.CMS_BACKEND };
  try {
    for (const env of [{ CMS_BACKEND: "legacy", AUTH_ENABLED: "1" }, { CMS_BACKEND: "postgres", AUTH_ENABLED: "0" }]) {
      Object.assign(process.env, env);
      for (const [path, methods] of Object.entries(routes)) {
        const file = `src/app/api/cart/${path ? path + "/" : ""}route.ts`;
        const source = read(file); assert.match(source, /handleCartRequest/, file); assert.doesNotMatch(source, /cms\/store|request\.json/, file);
        const route = await import(`../../${file}`);
        assert.deepEqual(Object.keys(route).filter(key => /^[A-Z]+$/.test(key)).sort(), [...methods].sort(), file);
        for (const method of methods) {
          const url = "http://localhost:3000/api/cart" + (path ? "/" + path.replace("[variantId]", "00000000-0000-4000-8000-000000000000") : "");
          const response = await route[method](new Request(url, { method, headers: { origin: "http://localhost:3000" } }));
          assert.equal(response.status, 503, `${file} ${method}`); assert.equal(response.headers.get("cache-control"), "no-store");
        }
      }
    }
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

// Task 14A: checkout takes its idempotency key from the Idempotency-Key header, and both checkout
// endpoints are same-origin POSTs; nothing in the URL can name an order, a cart or an owner.
test("checkout passes the Idempotency-Key header to the service and status is a POST under /checkout", async () => {
  const { createCartHandler } = await import("../../src/server/cart/http.ts");
  const calls = [];
  const service = {
    checkout: async (_h, key, body) => { calls.push(["checkout", key, body]); return { orderId: "o1" }; },
    checkoutStatus: async (_h, body) => { calls.push(["status", body]); return { orderId: "o1" }; },
  };
  const handle = createCartHandler({ service, baseURL: "http://localhost:3000" });
  const post = (path, body, headers = {}) => handle(new Request("http://localhost:3000/api/cart" + path, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  const placed = await post("/checkout", { quoteId: "q" }, { "idempotency-key": "checkout-key-0000000001" });
  assert.equal(placed.status, 200); assert.equal(placed.headers.get("cache-control"), "no-store");
  assert.equal((await post("/checkout/status", { orderId: "o1" })).status, 200);
  assert.deepEqual(calls, [["checkout", "checkout-key-0000000001", { quoteId: "q" }], ["status", { orderId: "o1" }]]);
  assert.equal((await post("/checkout/other", {})).status, 404);
  assert.equal((await handle(new Request("http://localhost:3000/api/cart/checkout", { method: "GET" }))).status, 405);
  assert.equal((await post("/checkout", {}, { origin: "http://evil.example" })).status, 403);
  assert.equal((await handle(new Request("http://localhost:3000/api/cart/checkout?orderId=o1", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{}" }))).status, 400);
});
