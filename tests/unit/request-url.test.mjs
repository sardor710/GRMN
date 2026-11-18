// Task 21B finding: behind the TLS proxy, the Next.js standalone server builds request.url from its own
// bind address (for example https://0.0.0.0:3000/api/cart), so every `url.origin !== baseURL` check
// refused real traffic. requestURL() accepts the proxy's forwarded Host and protocol only when they name
// the configured public origin; anything else keeps the raw URL, which the callers then refuse.
import assert from "node:assert/strict";
import test from "node:test";
import { requestURL } from "../../src/server/auth/request-url.ts";
import { createCartHandler } from "../../src/server/cart/http.ts";

const base = "https://shop.example";
const proxied = (path, headers = {}, init = {}) => new Request("https://0.0.0.0:3000" + path, { ...init, headers: { host: "shop.example", "x-forwarded-host": "shop.example", "x-forwarded-proto": "https", ...headers } });

test("a direct request keeps its own URL", () => {
  assert.equal(requestURL(new Request(base + "/api/cart?x=1"), base).href, base + "/api/cart?x=1");
  assert.equal(requestURL(new Request("http://localhost:3000/api/cart"), "http://localhost:3000").origin, "http://localhost:3000");
});

test("a proxied request is mapped onto the public origin when the forwarded host and protocol name it", () => {
  const url = requestURL(proxied("/api/cart/lines?a=b"), base);
  assert.equal(url.origin, base); assert.equal(url.pathname, "/api/cart/lines"); assert.equal(url.search, "?a=b");
  // Host alone (no x-forwarded-host) is enough when the proxy rewrites Host.
  assert.equal(requestURL(new Request("https://0.0.0.0:3000/api/cart", { headers: { host: "shop.example", "x-forwarded-proto": "https" } }), base).origin, base);
});

test("a forwarded host or protocol that does not name the public origin is not trusted", () => {
  assert.notEqual(requestURL(proxied("/api/cart", { host: "evil.example", "x-forwarded-host": "evil.example" }), base).origin, base);
  assert.notEqual(requestURL(proxied("/api/cart", { "x-forwarded-proto": "http" }), base).origin, base);
  assert.notEqual(requestURL(proxied("/api/cart", { host: "shop.example:8443", "x-forwarded-host": "shop.example:8443" }), base).origin, base);
  assert.notEqual(requestURL(new Request("https://0.0.0.0:3000/api/cart", { headers: { host: "shop.example" } }), base).origin, base, "no protocol header: not https");
});

test("the cart handler serves a proxied request and still enforces the Origin header", async () => {
  const service = { getCart: async () => ({ cart: { version: 0, lines: [] } }), addLine: async () => ({ cart: { version: 1, lines: [] } }) };
  const handle = createCartHandler({ service, baseURL: base });
  assert.equal((await handle(proxied("/api/cart"))).status, 200);
  assert.equal((await handle(proxied("/api/cart/lines", { origin: base, "content-type": "application/json" }, { method: "POST", body: "{}" }))).status, 200);
  assert.equal((await handle(proxied("/api/cart/lines", { origin: "https://evil.example", "content-type": "application/json" }, { method: "POST", body: "{}" }))).status, 403);
  assert.equal((await handle(proxied("/api/cart", { host: "evil.example", "x-forwarded-host": "evil.example" }))).status, 400);
});
