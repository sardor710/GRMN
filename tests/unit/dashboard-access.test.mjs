import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

test("dashboard collection denials and dependency failures stay unavailable rather than becoming empty metrics", async () => {
  assert.ok(existsSync("src/lib/dashboard-access.ts"), "Dashboard reads need to distinguish unavailable from empty data");
  const { readDashboardCollection } = createRequire(import.meta.url)("../../src/lib/dashboard-access.ts");
  await assert.rejects(readDashboardCollection(Response.json({ error: {} }, { status: 403 }), "orders"), /restricted/i);
  await assert.rejects(readDashboardCollection(Response.json({ error: {} }, { status: 503 }), "products"), /unavailable/i);
  await assert.rejects(readDashboardCollection(Response.json({}), "clients"), /unavailable/i);
  assert.deepEqual(await readDashboardCollection(Response.json({ orders: [] }), "orders"), []);
  assert.deepEqual(await readDashboardCollection(Response.json({ orders: [{ id: "synthetic" }] }), "orders"), [{ id: "synthetic" }]);
});
