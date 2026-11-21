// M7 / D03a: the checkout panel takes the payment method from the server quote. With demo purchases
// on ("sandbox") it says clearly that no real payment is taken, sends "sandbox", and the receipt shows
// "Paid (Demo)" only when the server status says paid. Without them ("demo") the D03 copy stays.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as accountClient from "../../src/lib/account-client.ts";
import * as checkoutAddress from "../../src/lib/checkout-address.ts";
import * as kzRegions from "../../src/lib/kz-regions.ts";

const source = fs.readFileSync(new URL("../../src/components/CheckoutPanel.tsx", import.meta.url), "utf8");
const kzt = amountMinor => ({ amountMinor, currency: "KZT" });
const CART = { id: "c1", version: 3, owner: "guest", pendingMerge: false, expiresAt: "2026-12-01T00:00:00.000Z", subtotal: kzt("200000"), lines: [], notices: [] };
const quote = paymentMethod => ({
  id: "00000000-0000-4000-8000-0000000000a1", cartId: "c1", cartVersion: 3, payableCurrency: "KZT", displayCurrency: "KZT", lines: [],
  subtotal: kzt("200000"), discount: kzt("0"), shipping: kzt("2000"), tax: kzt("0"), includedTax: kzt("0"), total: kzt("202000"),
  coupon: null, usdEquivalent: null, expiresAt: "2026-11-21T12:00:00.000Z", policyVersions: {}, paymentMethod,
});

/** Loads the real module with stubbed hooks and checkout client; `seed` pre-sets useState slots by call order. */
function load(name, seed = {}) {
  const state = [], calls = [];
  let index = 0;
  const hooks = { useState(initial) { const key = index++; if (!(key in state)) state[key] = key in seed ? seed[key] : typeof initial === "function" ? initial() : initial; return [state[key], value => { state[key] = typeof value === "function" ? value(state[key]) : value; }]; }, useEffect() {}, useMemo: fn => fn() };
  const checkoutClient = {
    createCheckoutStorage: () => ({ get: () => null, set() {}, remove() {} }),
    createCheckoutClient: () => ({ placeOrder: async (command, key) => { calls.push({ command, key }); return { orderId: "o1", orderNumber: "GRM-1", statusToken: "t".repeat(43) }; } }),
    beginCheckout: () => "checkout-key-0000001", checkoutRecovery: () => "fail", forgetCheckoutKey() {}, pollOrderStatus: async () => null, rememberOrder() {}, resumePendingCheckout: async () => null,
  };
  const modules = { react: hooks, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, "next/link": "a", "@/lib/account-client": accountClient, "@/lib/checkout-client": checkoutClient, "@/lib/checkout-address": checkoutAddress, "@/lib/kz-regions": kzRegions };
  const output = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", "fetch", "sessionStorage", code)(id => modules[id] ?? {}, output, async () => ({}), {});
  return { render: props => { index = 0; return output[name](props); }, calls, state };
}

test("demo purchases: the panel shows the no-real-payment notice and sends the sandbox method", async () => {
  const panel = load("CheckoutPanel", { 1: quote("sandbox") });
  const placed = [];
  const tree = panel.render({ cart: CART, disabled: false, onPlaced: order => placed.push(order) }), text = nodeText(tree);
  assert.match(text, /Demo purchase — no real payment is taken\./);
  assert.match(text, /marks it paid \(Demo\)/);
  const button = nodes(tree).find(node => node.type === "button" && /Place demo order/.test(nodeText(node)));
  assert.ok(button, "the place button says it is a demo order");
  await button.props.onClick();
  assert.equal(panel.calls.length, 1);
  assert.equal(panel.calls[0].command.paymentMethod, "sandbox", "the method comes from the server quote");
  assert.deepEqual(placed, [{ orderId: "o1", orderNumber: "GRM-1", statusToken: "t".repeat(43) }]);
});

test("without demo purchases the D03 demo copy and method stay", async () => {
  const panel = load("CheckoutPanel", { 1: quote("demo") });
  const tree = panel.render({ cart: CART, disabled: false, onPlaced: () => {} }), text = nodeText(tree);
  assert.match(text, /Payment is a demo: no money is taken and your order stays awaiting payment/);
  assert.doesNotMatch(text, /Demo purchase/);
  await nodes(tree).find(node => node.type === "button" && /^Place order$/.test(nodeText(node).trim())).props.onClick();
  assert.equal(panel.calls[0].command.paymentMethod, "demo");
});

test("the receipt shows Paid (Demo) only from a paid sandbox server status", () => {
  const order = { orderId: "o1", orderNumber: "GRM-1", statusToken: null };
  const status = (paymentMode, paymentStatus, status = "confirmed") => ({ orderId: "o1", orderNumber: "GRM-1", status, paymentStatus, fulfillmentStatus: "unfulfilled", paymentMode, total: kzt("202000"), placedAt: null });
  const paid = nodeText(load("OrderReceived", { 0: status("sandbox", "paid") }).render({ order }));
  assert.match(paid, /Paid \(Demo\)/);
  assert.match(paid, /no real payment was taken/);
  assert.match(paid, /Status:\s+Confirmed/);
  const pending = nodeText(load("OrderReceived", { 0: status("sandbox", "unpaid", "pending_payment") }).render({ order }));
  assert.doesNotMatch(pending, /Paid \(Demo\)/);
  assert.match(pending, /Awaiting demo payment/);
  const demo = nodeText(load("OrderReceived", { 0: status("demo", "unpaid", "pending_payment") }).render({ order }));
  assert.match(demo, /no payment has been taken, and the order is not paid/);
  assert.doesNotMatch(demo, /Paid/);
  const unknown = nodeText(load("OrderReceived").render({ order }));
  assert.doesNotMatch(unknown, /Paid/, "nothing is shown as paid before the server answers");
});
