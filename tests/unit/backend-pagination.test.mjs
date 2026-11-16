import assert from "node:assert/strict";
import test from "node:test";
import { normalizePageInput } from "../../src/contracts/pagination.ts";

test("catalog and account lists have separate bounded defaults", () => {
  assert.deepEqual(normalizePageInput({}, "catalog"), { limit: 24 });
  assert.deepEqual(normalizePageInput({}, "account"), { limit: 20 });
  assert.deepEqual(normalizePageInput({ limit: 100, cursor: "opaque-position" }, "admin"), { limit: 100, cursor: "opaque-position" });
});

test("pagination rejects invalid limits and oversized opaque cursors", () => {
  for (const limit of [0, -1, 101, 1.5, NaN, Infinity]) {
    assert.throws(() => normalizePageInput({ limit }, "catalog"), RangeError);
  }
  assert.throws(() => normalizePageInput({ cursor: "x".repeat(2049) }, "account"), RangeError);
  assert.throws(() => normalizePageInput({ cursor: "" }, "account"), RangeError);
});
