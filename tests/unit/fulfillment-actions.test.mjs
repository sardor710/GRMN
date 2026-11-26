// Final review I3, I4 and M12 for the PostgreSQL orders screen:
// - a refused staff action (confirm payment, shipment) keeps its error visible after the queue reloads;
// - clicking order A then B never shows A's detail while B is selected (late responses are dropped), and a
//   rejected detail fetch shows an error;
// - /admin/orders?order=<id> follows the search params, not only the first render.
import test from "node:test";
import assert from "node:assert/strict";
import * as dashboard from "../../src/lib/admin/dashboard.ts";
import * as boardStage from "../../src/app/admin/orders/_components/board/stage.ts";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";

const FILE = "src/app/admin/orders/_components/FulfillmentScreen.tsx";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const summary = (id, orderNumber) => ({ id, orderNumber, paymentMode: "live", contactName: "UI", paymentStatus: "unpaid", fulfillmentStatus: "unfulfilled", dataQuality: "complete", total: { amountMinor: "100000", currency: "KZT" } });
const detail = (id, orderNumber) => ({
  id, orderNumber, version: 1, status: "pending_payment", paymentStatus: "unpaid", fulfillmentStatus: "unfulfilled", paymentMode: "live", legacy: false,
  fulfillable: { allowed: false, reason: "ORDER_NOT_PAID" }, payment: { method: "manual", confirmable: true, confirmation: null },
  total: { amountMinor: "100000", currency: "KZT" }, items: [], shipments: [], refunds: [], returns: [], timeline: [],
});
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const alerts = tree => nodes(tree).filter(node => node.props?.role === "alert").map(nodeText);
const navigation = (query = "") => ({ "next/navigation": { useSearchParams: () => new URLSearchParams(query) } });

// Effects in order: 0 follows ?order=, 1 loads the queue, 2 aborts both gates on unmount, 3 loads the detail.
async function runEffects(fixture, which) { fixture.render(); for (const index of which) await fixture.effects[index](); }
/** Handlers return void (`() => void act()`), so let their promise chain settle. */
async function settle(fixture) { for (let i = 0; i < 20; i++) await fixture.flush(); }

test("a refused confirm-payment stays visible after the queue and detail reload", async () => {
  const calls = [];
  const fixture = componentFixture(FILE, {
    modules: { "@/lib/admin/dashboard": dashboard, "./board/stage": boardStage, ...navigation() },
    fetcher: async (url, options = {}) => {
      calls.push({ url, method: options.method ?? "GET" });
      if (options.method === "POST") return json({ error: { code: "PAYMENT_AMOUNT_MISMATCH", message: "The amount does not match the order total." } }, 409);
      if (url.includes("?id=")) return json(detail(A, "GRM-A"));
      return json({ items: [summary(A, "GRM-A")] });
    },
  });
  await runEffects(fixture, [1]);
  nodes(fixture.render()).find(node => node.type === "button" && nodeText(node).includes("GRM-A")).props.onClick();
  await runEffects(fixture, [3]);
  let tree = fixture.render();
  const input = name => nodes(tree).find(node => node.props?.name === name);
  input("paymentReference").props.onChange({ target: { value: "KASPI-1" } });
  tree = fixture.render();
  input("paymentAmount").props.onChange({ target: { value: "999" } });
  tree = fixture.render();
  nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  await settle(fixture);
  // The POST was refused, then the detail and the queue were reloaded (which clear only their own errors).
  assert.deepEqual(calls.slice(-3).map(call => call.method + " " + (call.url.includes("?id=") ? "detail" : "list")), ["POST list", "GET detail", "GET list"]);
  tree = fixture.render();
  assert.deepEqual(alerts(tree), ["The amount does not match the order total."]);
  // A queue reload on its own (a filter change) still keeps it.
  await runEffects(fixture, [1]);
  assert.deepEqual(alerts(fixture.render()), ["The amount does not match the order total."]);
  // The next user action clears it.
  nodes(fixture.render()).find(node => node.type === "button" && nodeText(node).includes("GRM-A")).props.onClick();
  assert.deepEqual(alerts(fixture.render()), []);
});

test("a refused shipment action is shown, and a queue error is shown on its own", async () => {
  let listFails = false;
  const fixture = componentFixture(FILE, {
    confirm: () => true,
    modules: { "@/lib/admin/dashboard": dashboard, "./board/stage": boardStage, ...navigation() },
    fetcher: async (url, options = {}) => {
      if (options.method === "POST") return json({ error: { code: "ORDER_NOT_PAID", message: "Not paid: only captured orders can ship." } }, 409);
      if (url.includes("?id=")) return json({ ...detail(A, "GRM-A"), shipments: [{ id: "s1", status: "ready", version: 1, items: [], dispatchedAt: null, deliveredAt: null, carrier: null, trackingReference: null, internalNotes: null }] });
      return listFails ? json({ error: { message: "Orders are unavailable" } }, 503) : json({ items: [summary(A, "GRM-A")] });
    },
  });
  await runEffects(fixture, [1]);
  nodes(fixture.render()).find(node => node.type === "button" && nodeText(node).includes("GRM-A")).props.onClick();
  await runEffects(fixture, [3]);
  listFails = true;
  // Owner 2026-11-25: "Cancel shipment" is now "Unpack" behind a confirmation.
  nodes(fixture.render()).find(node => node.type === "button" && nodeText(node) === "Unpack").props.onClick();
  await settle(fixture);
  assert.deepEqual(alerts(fixture.render()).sort(), ["Not paid: only captured orders can ship.", "Orders are unavailable"].sort());
});

test("clicking A then B never shows A's late detail while B is selected", async () => {
  const calls = [];
  const fixture = componentFixture(FILE, {
    modules: { "@/lib/admin/dashboard": dashboard, "./board/stage": boardStage, ...navigation() },
    fetcher: (url, options = {}) => {
      if (!url.includes("?id=")) return Promise.resolve(json({ items: [summary(A, "GRM-A"), summary(B, "GRM-B")] }));
      const pending = deferred(); calls.push({ url, signal: options.signal, ...pending }); return pending.promise;
    },
  });
  await runEffects(fixture, [1]);
  const click = number => nodes(fixture.render()).find(node => node.type === "button" && nodeText(node).includes(number)).props.onClick();
  click("GRM-A"); fixture.render(); const loadA = fixture.effects[3]();
  click("GRM-B"); fixture.render(); const loadB = fixture.effects[3]();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal?.aborted, true, "selecting B aborts A's request");
  calls[1].resolve(json(detail(B, "GRM-B")));
  await loadB;
  calls[0].resolve(json(detail(A, "GRM-A")));
  await loadA;
  const detailSection = nodes(fixture.render()).find(node => node.props?.["aria-label"] === "Order detail");
  const text = nodeText(detailSection);
  assert.ok(text.includes("GRM-B"), text);
  assert.ok(!text.includes("GRM-A"), "A's late response was dropped");
});

test("a rejected detail fetch shows an error instead of an unhandled rejection", async () => {
  const fixture = componentFixture(FILE, {
    modules: { "@/lib/admin/dashboard": dashboard, "./board/stage": boardStage, ...navigation() },
    fetcher: url => url.includes("?id=") ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(json({ items: [summary(A, "GRM-A")] })),
  });
  await runEffects(fixture, [1]);
  nodes(fixture.render()).find(node => node.type === "button" && nodeText(node).includes("GRM-A")).props.onClick();
  await runEffects(fixture, [3]);
  assert.deepEqual(alerts(fixture.render()), ["The order could not be loaded: Failed to fetch"]);
});

test("?order= follows the search params, not only the first render", async () => {
  let query = `order=${A}`;
  const requested = [];
  const fixture = componentFixture(FILE, {
    modules: { "@/lib/admin/dashboard": dashboard, "./board/stage": boardStage, "next/navigation": { useSearchParams: () => new URLSearchParams(query) } },
    fetcher: async url => { if (url.includes("?id=")) { const id = url.split("?id=")[1]; requested.push(id); return json(detail(id, id === A ? "GRM-A" : "GRM-B")); } return json({ items: [] }); },
  });
  await runEffects(fixture, [0]); await runEffects(fixture, [3]);
  query = `order=${B}`;
  await runEffects(fixture, [0]); await runEffects(fixture, [3]);
  assert.deepEqual(requested, [A, B]);
  assert.ok(nodeText(fixture.render()).includes("GRM-B"));
});
