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

// Owner 2026-11-22 (admin bin): DELETE /api/admin/catalog/variants/:id?version=N deletes one SKU.
test("a proxied SKU delete reaches the service with the variant id and product version", async () => {
  const calls = [];
  const deleting = createCatalogHTTP({ baseURL, service: { deleteVariant: async (...args) => { calls.push(args.slice(1)); return { product: { id: "p", version: 4 }, deleted: true }; } } });
  const id = "6f1c2b9e-0a43-4d1e-9a51-3c2f6b7d8e90";
  const request = path => new Request("https://0.0.0.0:3000" + path, { method: "DELETE", headers: { host: "garmin.tigr.uz", "x-forwarded-host": "garmin.tigr.uz", "x-forwarded-proto": "https", origin: baseURL } });
  const response = await deleting(request(`/api/admin/catalog/variants/${id}?version=3`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { product: { id: "p", version: 4 }, deleted: true });
  assert.deepEqual(calls, [[id, 3]]);
  assert.equal((await deleting(request(`/api/admin/catalog/variants/${id}?version=x`))).status, 400);
  assert.equal((await deleting(request(`/api/admin/catalog/variants/${id}`))).status, 400);
  assert.equal(calls.length, 1);
});
