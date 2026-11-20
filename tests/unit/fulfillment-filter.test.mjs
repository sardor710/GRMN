// Task 5b.1 fix round 1: the orders queue filter. A slow unfiltered response that lands after the Demo
// response must not replace the Demo list, and a failed request must end "Loading orders…" with an error.
import test from "node:test";
import assert from "node:assert/strict";
import * as dashboard from "../../src/lib/admin/dashboard.ts";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";

const FILE = "src/app/admin/orders/_components/FulfillmentScreen.tsx";
const order = (id, orderNumber, paymentMode) => ({ id, orderNumber, paymentMode, contactName: "UI", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", dataQuality: "complete", total: { amountMinor: "100000", currency: "KZT" } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const ok = items => ({ ok: true, status: 200, json: async () => ({ items }) });

function screen() {
  const calls = [];
  const fixture = componentFixture(FILE, {
    modules: { "@/lib/admin/dashboard": dashboard },
    fetcher: (url, options) => { const pending = deferred(); calls.push({ url, signal: options?.signal, ...pending }); return pending.promise; },
  });
  // Effects in order: 0 reads ?order= from window.location, 1 loads the queue, 2 aborts the queue gate on unmount,
  // 3 loads the detail. Only effect 1 is run here.
  const loadQueue = () => { fixture.render(); return fixture.effects[1](); };
  return { fixture, calls, loadQueue };
}

test("a stale unfiltered response never replaces the Demo list", async () => {
  const { fixture, calls, loadQueue } = screen();
  const first = loadQueue();
  const select = nodes(fixture.render()).find(node => node.props?.["aria-label"] === "Payment mode filter");
  select.props.onChange({ target: { value: "demo" } });
  const second = loadQueue();
  assert.match(calls[1].url, /paymentMode=demo/);
  assert.equal(calls[0].signal?.aborted, true, "changing the filter aborts the earlier request");
  calls[1].resolve(ok([order("d", "GRM-DEMO", "demo")]));
  await second;
  calls[0].resolve(ok([order("d", "GRM-DEMO", "demo"), order("l", "GRM-LIVE", "live")]));
  await first;
  const text = nodeText(fixture.render());
  assert.ok(text.includes("GRM-DEMO"));
  assert.ok(!text.includes("GRM-LIVE"), "the late unfiltered list was dropped");
});

test("a failed queue request shows an error instead of loading forever", async () => {
  const { fixture, calls, loadQueue } = screen();
  const load = loadQueue();
  calls[0].reject(new TypeError("Failed to fetch"));
  await load;
  const tree = fixture.render();
  assert.ok(!nodeText(tree).includes("Loading orders"));
  assert.ok(nodes(tree).some(node => node.props?.role === "alert" && /could not be loaded/i.test(nodeText(node))));
});
