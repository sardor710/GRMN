// Task 13A review fixes: the browser cart controller (behind CartProvider) falls back to the local cart
// only when the server cart is closed (503), never loses an add made while loading, re-syncs and merges
// after a session change, and never replays an absolute change onto a different or changed cart.
import assert from "node:assert/strict";
import test from "node:test";
import { createCartController, CartRequestError, LEGACY_CART_KEY } from "../../src/lib/cart-client.ts";

const cart = (extra = {}) => ({ id: "c1", version: 1, owner: "guest", lines: [], subtotal: { amountMinor: "0", currency: "KZT" }, expiresAt: null, pendingMerge: false, notices: [], ...extra });
const fail = (status, code, message = code) => new CartRequestError(status, code, message);
function storage(initial = {}) { const data = { ...initial }; return { data, get: key => data[key] ?? null, remove: key => { delete data[key]; } }; }
function harness(client, store = storage()) {
  const states = [];
  const controller = createCartController({ client, storage: store, onChange: state => states.push(state) });
  return { controller, states, store, last: () => states.at(-1) };
}

test("only a closed server cart (503) falls back to the local cart; other failures stay in server mode with an error", async () => {
  const closed = harness({ get: async () => { throw fail(503, "DEPENDENCY_UNAVAILABLE"); } });
  await closed.controller.start(); assert.equal(closed.last().mode, "local");
  for (const failure of [fail(500, "INTERNAL_ERROR", "boom"), fail(403, "FORBIDDEN", "Staff MFA verification is required"), new TypeError("Failed to fetch")]) {
    const h = harness({ get: async () => { throw failure; } });
    await h.controller.start();
    assert.equal(h.last().mode, "server", String(failure)); assert.equal(h.last().server, null); assert.ok(h.last().error);
  }
});

test("the stored local cart is removed only after a successful import, and a pending merge still runs", async () => {
  const items = JSON.stringify([{ id: "fenix-8", name: "x", price: 1, qty: 2 }]);
  const failing = harness({ get: async () => cart(), importLegacy: async () => { throw fail(500, "INTERNAL_ERROR"); } }, storage({ [LEGACY_CART_KEY]: items }));
  await failing.controller.start(); assert.equal(failing.store.data[LEGACY_CART_KEY], items, "a failed import keeps the stored cart for the next load");
  const calls = [];
  const ok = harness({
    get: async () => cart({ owner: "account", pendingMerge: true }),
    importLegacy: async list => { calls.push(["import", list]); return cart({ owner: "account", version: 2, pendingMerge: false }); },
    merge: async () => { calls.push(["merge"]); return cart({ owner: "account", version: 3 }); },
  }, storage({ [LEGACY_CART_KEY]: items }));
  await ok.controller.start();
  assert.deepEqual(calls, [["import", [{ id: "fenix-8", quantity: 2 }]], ["merge"]]);
  assert.equal(ok.store.data[LEGACY_CART_KEY], undefined); assert.equal(ok.last().server.version, 3);
});

test("an add made while the cart is still loading waits for it and reaches the server", async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const adds = [];
  const h = harness({ get: async () => { await gate; return cart({ version: 4 }); }, add: async command => { adds.push(command); return cart({ version: 5 }); } });
  const started = h.controller.start();
  const added = h.controller.add({ productKey: "fenix-8", quantity: 1 });
  release(); await started; await added;
  assert.deepEqual(adds, [{ productKey: "fenix-8", quantity: 1, expectedCartVersion: 4 }]);
  assert.equal(h.last().server.version, 5);
});

test("a stale add reloads and retries once on the same cart", async () => {
  const versions = [];
  const h = harness({ get: async () => cart({ version: versions.length ? 7 : 1 }), add: async command => { versions.push(command.expectedCartVersion); if (command.expectedCartVersion === 1) throw fail(409, "VERSION_CONFLICT"); return cart({ version: 8 }); } });
  await h.controller.start(); await h.controller.add({ variantId: "v", quantity: 1 });
  assert.deepEqual(versions, [1, 7]); assert.equal(h.last().server.version, 8);
});

test("an absolute change is never replayed after a conflict: the fresh cart is shown instead", async () => {
  let reloads = 0; const sets = [];
  const h = harness({ get: async () => cart({ version: reloads++ ? 9 : 1 }), setQuantity: async (id, quantity, version) => { sets.push(version); throw fail(409, "VERSION_CONFLICT", "Your cart changed"); }, clear: async () => { throw new Error("must not clear"); } });
  await h.controller.start();
  await assert.rejects(h.controller.setQuantity("v", 2), error => error.code === "VERSION_CONFLICT");
  assert.deepEqual(sets, [1]); assert.equal(h.last().server.version, 9); assert.match(h.last().error, /changed/i);
});

test("after a session change the controller re-syncs, merges the guest cart and never touches the account cart with stale state", async () => {
  let signedIn = false; const calls = [];
  const h = harness({
    get: async () => signedIn ? cart({ id: "acct", owner: "account", version: 1, pendingMerge: true }) : cart({ id: "guest", version: 1 }),
    merge: async () => { calls.push("merge"); return cart({ id: "acct", owner: "account", version: 2 }); },
    clear: async (version) => { calls.push(["clear", version]); throw fail(409, "VERSION_CONFLICT"); },
  });
  await h.controller.start(); assert.equal(h.last().server.id, "guest");
  signedIn = true;
  await assert.rejects(h.controller.clear(), error => error.code === "VERSION_CONFLICT");
  assert.deepEqual(calls, [["clear", 1], "merge"], "a different cart after the conflict is merged and shown, not cleared");
  assert.equal(h.last().server.id, "acct");
  calls.length = 0;
  await h.controller.refresh();
  assert.deepEqual(calls, ["merge"]);
});

test("the header badge counts nothing until the cart mode is settled, so server and client render the same count", async () => {
  const { cartBadgeCount } = await import("../../src/lib/cart-client.ts");
  const local = [{ qty: 2 }, { qty: 1 }];
  assert.equal(cartBadgeCount({ mode: "loading", server: null }, local), 0, "the stored cart is not counted during hydration");
  assert.equal(cartBadgeCount({ mode: "local", server: null }, local), 3);
  assert.equal(cartBadgeCount({ mode: "server", server: cart({ lines: [{ quantity: 4 }, { quantity: 1 }] }) }, local), 5);
  assert.equal(cartBadgeCount({ mode: "server", server: null }, local), 0);
});

test("concurrent starts (a remounted provider) share one sync, so the stored cart is imported into a single guest cart", async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const calls = [];
  const h = harness({ get: async () => { calls.push("get"); await gate; return cart({ id: null, version: 0 }); }, importLegacy: async () => { calls.push("import"); return cart({ version: 1 }); } }, storage({ [LEGACY_CART_KEY]: JSON.stringify([{ id: "fenix-8", qty: 1 }]) }));
  const first = h.controller.start(), second = h.controller.start();
  release(); await Promise.all([first, second]);
  assert.deepEqual(calls, ["get", "import"]);
});
