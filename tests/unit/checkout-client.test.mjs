// Task 14A: the browser checkout client. One idempotency key per attempt, kept in session storage
// so a reload or a lost response retries the SAME key (never a second order); stale quotes ask for
// a new quote; the result is polled through the status contract. No price leaves the browser.
import assert from "node:assert/strict";
import test from "node:test";

const load = () => import("../../src/lib/checkout-client.ts");
const ok = body => ({ ok: true, status: 200, json: async () => body });
const err = (status, code) => ({ ok: false, status, json: async () => ({ error: { code, message: code } }) });

test("placeOrder sends the Idempotency-Key header and only the quote reference", async () => {
  const { createCheckoutClient } = await load(), calls = [];
  const client = createCheckoutClient(async (url, init) => { calls.push([url, init]); return ok({ orderId: "o1" }); });
  await client.placeOrder({ quoteId: "q1", cartVersion: 3, paymentMethod: "demo" }, "checkout-0000000000000001");
  await client.status({ orderId: "o1", statusToken: "t" });
  await client.quote({ cartVersion: 3, displayCurrency: "KZT", delivery: { kind: "inline", address: {} } });
  assert.equal(calls[0][0], "/api/cart/checkout");
  assert.equal(calls[0][1].method, "POST"); assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[0][1].headers["idempotency-key"], "checkout-0000000000000001");
  assert.deepEqual(JSON.parse(calls[0][1].body), { quoteId: "q1", cartVersion: 3, paymentMethod: "demo" });
  assert.deepEqual([calls[1][0], JSON.parse(calls[1][1].body)], ["/api/cart/checkout/status", { orderId: "o1", statusToken: "t" }]);
  assert.equal(calls[2][0], "/api/cart/quote");
});

test("errors map to retry-with-the-same-key, re-quote or a final failure", async () => {
  const { createCheckoutClient, checkoutRecovery } = await load();
  const failing = response => createCheckoutClient(async () => response).placeOrder({ quoteId: "q", cartVersion: 1, paymentMethod: "demo" }, "checkout-0000000000000001").catch(e => e);
  assert.equal(checkoutRecovery(await failing(err(503, "INVENTORY_BUSY"))), "retry");
  assert.equal(checkoutRecovery(new TypeError("Failed to fetch")), "retry");
  for (const code of ["QUOTE_STALE", "QUOTE_EXPIRED", "VERSION_CONFLICT", "COUPON_EXHAUSTED", "INSUFFICIENT_STOCK", "CART_NOT_QUOTABLE"]) assert.equal(checkoutRecovery(await failing(err(409, code))), "requote", code);
  for (const [status, code] of [[409, "IDEMPOTENCY_CONFLICT"], [409, "CHECKOUT_CONFLICT"], [400, "INVALID_INPUT"], [404, "NOT_FOUND"]]) assert.equal(checkoutRecovery(await failing(err(status, code))), "fail", code);
});

test("the attempt key survives a reload and is reused for the same quote only", async () => {
  const { beginCheckout, forgetCheckoutKey, rememberOrder, lastOrder } = await load();
  const store = new Map(), storage = { get: k => store.get(k) ?? null, set: (k, v) => store.set(k, v), remove: k => store.delete(k) };
  const a = { quoteId: "quote-a", cartVersion: 1, paymentMethod: "demo" }, b = { ...a, quoteId: "quote-b" };
  const first = beginCheckout(storage, a);
  assert.match(first, /^checkout-[0-9a-f-]{36}$/);
  assert.equal(beginCheckout(storage, a), first, "same quote, same key");
  const second = beginCheckout(storage, b);
  assert.notEqual(second, first, "a new quote gets a new key");
  forgetCheckoutKey(storage);
  assert.notEqual(beginCheckout(storage, b), second);
  rememberOrder(storage, { orderId: "o1", orderNumber: "GRM-1", statusToken: null });
  assert.deepEqual(lastOrder(storage), { orderId: "o1", orderNumber: "GRM-1", statusToken: null });
  store.set("grmn-last-order", "{not json"); assert.equal(lastOrder(storage), null);
});

test("polling stops when the order leaves pending payment or after the limit", async () => {
  const { pollOrderStatus } = await load();
  const states = ["unpaid", "unpaid", "paid"], seen = [];
  const client = { status: async () => ({ orderId: "o1", status: "pending_payment", paymentStatus: states.shift() ?? "paid" }) };
  const final = await pollOrderStatus(client, { orderId: "o1", statusToken: null }, { intervalMs: 0, limit: 10, sleep: async () => {}, onUpdate: s => seen.push(s.paymentStatus) });
  assert.equal(final.paymentStatus, "paid"); assert.deepEqual(seen, ["unpaid", "unpaid", "paid"]);
  let calls = 0;
  const still = await pollOrderStatus({ status: async () => { calls++; return { status: "pending_payment", paymentStatus: "unpaid" }; } }, { orderId: "o1", statusToken: null }, { intervalMs: 0, limit: 3, sleep: async () => {} });
  assert.equal(calls, 3); assert.equal(still.paymentStatus, "unpaid");
});

// Review I1/M1: the whole pending command is kept with its key, so a reload resends it and restores
// the receipt; storage that throws falls back to memory so a retry still reuses the key.
test("review I1: a pending checkout is resumed after a reload with the same key and command", async () => {
  const { beginCheckout, resumePendingCheckout, lastOrder, createCheckoutStorage } = await load();
  const store = new Map(), storage = { get: k => store.get(k) ?? null, set: (k, v) => store.set(k, v), remove: k => store.delete(k) };
  const command = { quoteId: "q1", cartVersion: 2, paymentMethod: "demo", contactEmail: "a@example.invalid" };
  const key = beginCheckout(storage, command);
  assert.equal(beginCheckout(storage, { ...command }), key, "same command, same key");
  assert.notEqual(beginCheckout(storage, { ...command, contactEmail: "b@example.invalid" }), key, "a different command is a different request");
  const sameAgain = beginCheckout(storage, command);
  const sent = [];
  const lost = { placeOrder: async (c, k) => { sent.push([c, k]); throw new TypeError("Failed to fetch"); } };
  assert.equal(await resumePendingCheckout(lost, storage), null, "an unknown outcome keeps the pending attempt");
  const ok = { placeOrder: async (c, k) => { sent.push([c, k]); return { orderId: "o1", orderNumber: "GRM-7", statusToken: "tok" }; } };
  assert.deepEqual(await resumePendingCheckout(ok, storage), { orderId: "o1", orderNumber: "GRM-7", statusToken: "tok" });
  assert.deepEqual(sent.map(([c, k]) => [c, k]), [[command, sameAgain], [command, sameAgain]]);
  assert.deepEqual(lastOrder(storage), { orderId: "o1", orderNumber: "GRM-7", statusToken: "tok" });
  assert.equal(await resumePendingCheckout(ok, storage), null, "nothing pending after it resolved");
  beginCheckout(storage, command);
  const { CartRequestError } = await import("../../src/lib/cart-client.ts");
  assert.equal(await resumePendingCheckout({ placeOrder: async () => { throw new CartRequestError(409, "QUOTE_EXPIRED", "x"); } }, storage), null);
  assert.equal(await resumePendingCheckout(ok, storage), null, "a final answer drops the pending attempt");
  const broken = createCheckoutStorage(() => { throw new Error("SecurityError"); });
  assert.equal(beginCheckout(broken, command), beginCheckout(broken, command), "memory fallback keeps the key when storage is unavailable");
});
