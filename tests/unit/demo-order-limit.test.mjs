// Follow-up F-b (item 3): DEMO_ORDER_LIMIT is an integer, default 5, 0 = unlimited; invalid values fall back to 5 with a warning.
import test from "node:test";
import assert from "node:assert/strict";
import { readDemoOrderLimit, DEFAULT_DEMO_ORDER_LIMIT } from "../../src/server/config/env.ts";

test("DEMO_ORDER_LIMIT parses integers, defaults to 5 and treats 0 as unlimited", () => {
  const warnings = [], warn = message => warnings.push(message);
  assert.equal(DEFAULT_DEMO_ORDER_LIMIT, 5);
  assert.equal(readDemoOrderLimit({}, warn), 5);
  assert.equal(readDemoOrderLimit({ DEMO_ORDER_LIMIT: "" }, warn), 5);
  assert.equal(readDemoOrderLimit({ DEMO_ORDER_LIMIT: "2" }, warn), 2);
  assert.equal(readDemoOrderLimit({ DEMO_ORDER_LIMIT: " 12 " }, warn), 12);
  assert.equal(readDemoOrderLimit({ DEMO_ORDER_LIMIT: "0" }, warn), 0);
  assert.deepEqual(warnings, []);
});

test("an invalid DEMO_ORDER_LIMIT falls back to 5 and warns", () => {
  for (const raw of ["-1", "2.5", "five", "1e3", "99999999999"]) {
    const warnings = [];
    assert.equal(readDemoOrderLimit({ DEMO_ORDER_LIMIT: raw }, message => warnings.push(message)), 5, raw);
    assert.equal(warnings.length, 1, raw);
    assert.match(warnings[0], /DEMO_ORDER_LIMIT/);
  }
});
