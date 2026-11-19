// Owner 2026-11-19: the homepage must never crash. Before, an unpublished (draft) homepage made every
// /en, /ru and /kk homepage answer 500 "Homepage content is unavailable". Now a missing homepage,
// a read failure or a failed collection lookup falls back to the built-in template (or the
// unresolved config) and is logged once per call. Breaks caught: a crash on a missing homepage,
// a published homepage being replaced by the template, and silent fallbacks.
import assert from "node:assert/strict";
import { test } from "node:test";

const load = () => import("../../src/server/cms/homepage-fallback.ts");
const template = { heroBanners: [{ id: "default" }], carousels: [], promoTiles: [], storyTiles: [], categoryTiles: [] };
const published = { heroBanners: [{ id: "published" }], carousels: [{ id: "c" }], promoTiles: [], storyTiles: [], categoryTiles: [] };

test("a published homepage is returned as is, with its collections resolved", async () => {
  const { homepageWithFallback } = await load(), logs = [];
  const config = await homepageWithFallback({ read: async () => published, resolve: async c => ({ ...c, resolved: true }), template: () => template, log: m => logs.push(m) });
  assert.deepEqual(config, { ...published, resolved: true }); assert.deepEqual(logs, []);
});

test("no published homepage, or a read failure, falls back to the template and is logged", async () => {
  const { homepageWithFallback } = await load();
  for (const read of [async () => undefined, async () => { throw Object.assign(new Error("Homepage content is unavailable"), { status: 503 }); }, async () => { throw new Error("connect ECONNREFUSED"); }]) {
    const logs = [];
    assert.deepEqual(await homepageWithFallback({ read, template: () => template, log: m => logs.push(m) }), template);
    assert.equal(logs.length, 1); assert.match(logs[0], /homepage/i);
  }
});

test("a failed collection lookup keeps the published config (unresolved) instead of crashing", async () => {
  const { homepageWithFallback } = await load(), logs = [];
  const config = await homepageWithFallback({ read: async () => published, resolve: async () => { throw new Error("collections down"); }, template: () => template, log: m => logs.push(m) });
  assert.deepEqual(config, published); assert.equal(logs.length, 1);
});
