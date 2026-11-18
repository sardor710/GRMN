// Task 21B follow-up: slow catalog listings held every pool connection under load, so cheap reads
// (product pages, the cart) waited and then failed first. Listings now run through a per-process
// concurrency limit: at most `max` at once, the rest wait in order for at most `waitMs`, then 503.
import assert from "node:assert/strict";
import test from "node:test";
import { createConcurrencyLimit } from "../../src/server/catalog/limit.ts";
import { createCatalogService } from "../../src/server/catalog/service.ts";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

test("at most max tasks run at once; waiting tasks start in order as slots free", async () => {
  const limit = createConcurrencyLimit({ max: 2, waitMs: 1000 });
  const gates = [deferred(), deferred(), deferred(), deferred()], started = [];
  const runs = gates.map((gate, i) => limit(async () => { started.push(i); await gate.promise; return i; }));
  await tick();
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(limit.stats(), { running: 2, waiting: 2 });
  gates[1].resolve(); await runs[1]; await tick();
  assert.deepEqual(started, [0, 1, 2]);
  gates[0].resolve(); gates[2].resolve(); gates[3].resolve();
  assert.deepEqual(await Promise.all(runs), [0, 1, 2, 3]);
  assert.deepEqual(limit.stats(), { running: 0, waiting: 0 });
});

test("a task that waits longer than waitMs fails with 503 and never runs; a failing task frees its slot", async () => {
  const limit = createConcurrencyLimit({ max: 1, waitMs: 30 });
  const gate = deferred(); let ran = false;
  const first = limit(() => gate.promise);
  await assert.rejects(limit(async () => { ran = true; }), error => error.status === 503 && error.code === "CATALOG_BUSY" && error.retryAfter === 1);
  assert.equal(ran, false);
  gate.resolve(); await first;
  await assert.rejects(limit(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await limit(async () => "free again"), "free again");
});

test("the catalog service caps listings but not product, key or redirect reads", async () => {
  let inFlight = 0, peak = 0;
  const gate = deferred();
  const pool = { query: async sql => { inFlight++; peak = Math.max(peak, inFlight); if (/WITH eligible/.test(sql)) await gate.promise; inFlight--; return { rows: [] }; } };
  const limit = createConcurrencyLimit({ max: 1, waitMs: 5000 });
  const api = createCatalogService({ pool, listingLimit: limit });
  const query = { market: "default", locale: "en", displayCurrency: "KZT" };
  const listings = [api.listProducts(query), api.listProducts(query), api.listProducts(query)];
  await tick();
  assert.deepEqual(limit.stats(), { running: 1, waiting: 2 });
  // A product page is not queued behind the listings.
  const detail = api.getProductByPublicKey("missing", "default", "KZT");
  await tick();
  assert.deepEqual(limit.stats(), { running: 1, waiting: 2 }, "the key read did not enter the listing limit");
  gate.resolve();
  assert.equal(await detail, null);
  for (const page of await Promise.all(listings)) assert.deepEqual(page, { items: [], nextCursor: null });
  assert.ok(peak >= 2, "the key read ran while a listing held the only listing slot");
});
