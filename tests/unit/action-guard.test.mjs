// M9.3 review finding 6: admin actions that write (dashboard quick restock, creating a product) run at most
// once at a time per scope, and one user action keeps one idempotency key: a retry after an unknown outcome
// (network error, 5xx) reuses it so the server replays instead of applying the change twice.
import assert from "node:assert/strict";
import test from "node:test";
import { createActionGuard } from "../../src/lib/admin/action-guard.ts";
import { shouldLoadProduct } from "../../src/components/admin/product-editor/editor-state.ts";

const counter = () => { let n = 0; return () => `key-${++n}`; };

test("a second start while the first is in flight is refused; settling frees the scope", () => {
  const guard = createActionGuard(counter());
  const first = guard.begin("p1", "25");
  assert.deepEqual(first, { idempotencyKey: "key-1" });
  assert.equal(guard.begin("p1", "25"), null, "double click while in flight");
  assert.equal(guard.busy("p1"), true);
  assert.deepEqual(guard.begin("p2", "25"), { idempotencyKey: "key-2" }, "other scopes are independent");
  guard.settle("p1", "done");
  assert.equal(guard.busy("p1"), false);
  assert.deepEqual(guard.begin("p1", "25"), { idempotencyKey: "key-3" }, "a new user action after a known outcome gets a new key");
});

test("after an unknown outcome the same action retries with the same key; a different action gets a new one", () => {
  const guard = createActionGuard(counter());
  assert.deepEqual(guard.begin("p1", "25"), { idempotencyKey: "key-1" });
  guard.settle("p1", "unknown");
  assert.deepEqual(guard.begin("p1", "25"), { idempotencyKey: "key-1" }, "the retry replays on the server");
  guard.settle("p1", "done");
  assert.deepEqual(guard.begin("p1", "25"), { idempotencyKey: "key-2" });
  guard.settle("p1", "unknown");
  assert.deepEqual(guard.begin("p1", "50"), { idempotencyKey: "key-3" }, "a different quantity is a different action");
});

test("the editor does not refetch the product it just created (edits typed meanwhile survive)", () => {
  assert.equal(shouldLoadProduct(null, null), false);
  assert.equal(shouldLoadProduct("p1", null), true);
  assert.equal(shouldLoadProduct("p1", "p1"), false, "the create response already is the stored payload");
  assert.equal(shouldLoadProduct("p2", "p1"), true);
});
