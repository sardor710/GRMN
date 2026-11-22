// beta5 regression: behind the reverse proxy, Next builds request.url from its bind address, so the admin catalog API
// answered every real request with 400 "Invalid or unknown fields" ("The filter or page is no longer valid." in the
// product list). It now maps the forwarded public host onto the configured origin, like the other admin handlers.
import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogHTTP } from "../../src/server/cms/catalog-http.ts";

const baseURL = "https://garmin.tigr.uz";
const service = { listProducts: async () => ({ items: [], total: 0, nextCursor: null }), taxonomy: async () => [] };
const handle = createCatalogHTTP({ service, baseURL });
const proxied = (path, headers = {}) => new Request("https://0.0.0.0:3000" + path, { headers: { host: "garmin.tigr.uz", "x-forwarded-host": "garmin.tigr.uz", "x-forwarded-proto": "https", ...headers } });

test("a proxied list request on the public host is served", async () => {
  const response = await handle(proxied("/api/admin/catalog/products?limit=50"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], total: 0, nextCursor: null });
});

test("a request whose forwarded host is not the public origin is still refused", async () => {
  const response = await handle(proxied("/api/admin/catalog/products?limit=50", { host: "evil.example", "x-forwarded-host": "evil.example" }));
  assert.equal(response.status, 400);
});
