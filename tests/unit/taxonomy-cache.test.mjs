// Final review 2026-11-22: a series or charger type created in Admin ▸ Categories must show in the product editor's
// dropdowns without waiting out a cache — Categories writes invalidate the shared tree, and the fetch revalidates.
import assert from "node:assert/strict";
import test from "node:test";

test("the shared category tree refetches after invalidation and always revalidates with the server", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ categories: [{ key: `k${calls.length}` }] }) }; };
  const { loadTaxonomy, invalidateTaxonomy } = await import("../../src/components/admin/catalog/taxonomy-cache.ts");
  const first = await loadTaxonomy();
  assert.equal((await loadTaxonomy())[0].key, first[0].key, "a second read in the same page reuses the tree");
  assert.equal(calls.length, 1);
  invalidateTaxonomy();
  assert.equal((await loadTaxonomy())[0].key, "k2", "after a Categories write the next read fetches again");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.init?.cache === "no-cache"), "the browser revalidates (ETag) instead of using a 5-minute copy");
});
