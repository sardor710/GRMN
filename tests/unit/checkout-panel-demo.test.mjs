// M7 / D03a: the checkout panel takes the payment method from the server quote. With demo purchases
// on ("sandbox") it says clearly that no real payment is taken, sends "sandbox", and the receipt shows
// "Paid" only when the server status says paid (no "demo" wording since 2026-11-22). Without them ("demo") the D03 copy stays.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as accountClient from "../../src/lib/account-client.ts";
import * as checkoutAddress from "../../src/lib/checkout-address.ts";
import * as kzRegions from "../../src/lib/kz-regions.ts";
import * as analyticsEvents from "../../src/lib/analytics/events.ts";
import { createTranslator } from "use-intl/core";
import * as i18nConfig from "../../src/i18n/config.js";

class CartRequestError extends Error { constructor(message, code) { super(message); this.code = code; } }
// The panel reads its text through next-intl: render with the real English catalog (ru/kk are covered by the i18n tests).
const enMessages = JSON.parse(fs.readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"));
const i18nModules = {
  "next-intl": { useTranslations: namespace => createTranslator({ locale: "en", messages: enMessages, namespace }), useLocale: () => "en" },
  "@/i18n/navigation": { Link: "a" }, "@/i18n/config": i18nConfig, "@/i18n/useAppLocale": { useAppLocale: () => "en" },
  "@/components/DemoDot": { DemoDot: "span" }, "@/lib/cart-client": { CartRequestError },
};
const source = fs.readFileSync(new URL("../../src/components/CheckoutPanel.tsx", import.meta.url), "utf8");
const kzt = amountMinor => ({ amountMinor, currency: "KZT" });
const CART = { id: "c1", version: 3, owner: "guest", pendingMerge: false, expiresAt: "2026-12-01T00:00:00.000Z", subtotal: kzt("200000"), lines: [], notices: [], paymentMethods: ["manual"] };
const quote = paymentMethod => ({
  id: "00000000-0000-4000-8000-0000000000a1", cartId: "c1", cartVersion: 3, payableCurrency: "KZT", displayCurrency: "KZT", lines: [],
  subtotal: kzt("200000"), discount: kzt("0"), shipping: kzt("2000"), tax: kzt("0"), includedTax: kzt("0"), total: kzt("202000"),
  coupon: null, usdEquivalent: null, expiresAt: "2026-11-21T12:00:00.000Z", policyVersions: {}, paymentMethod,
});

/** Loads the real module with stubbed hooks and checkout client; `seed` pre-sets useState slots by call order. */
function load(name, seed = {}, { placeOrder } = {}) {
  const state = [], calls = [];
  let index = 0;
  const hooks = { useState(initial) { const key = index++; if (!(key in state)) state[key] = key in seed ? seed[key] : typeof initial === "function" ? initial() : initial; return [state[key], value => { state[key] = typeof value === "function" ? value(state[key]) : value; }]; }, useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }) };
  const checkoutClient = {
    createCheckoutStorage: () => ({ get: () => null, set() {}, remove() {} }),
    createCheckoutClient: () => ({ placeOrder: placeOrder ?? (async (command, key) => { calls.push({ command, key }); return { orderId: "o1", orderNumber: "GRM-1", statusToken: "t".repeat(43) }; }) }),
    beginCheckout: () => "checkout-key-0000001", checkoutRecovery: () => "fail", forgetCheckoutKey() {}, settleCheckoutKey() {}, retryOrderPayment: async () => null, pollOrderStatus: async () => null, rememberOrder() {}, resumePendingCheckout: async () => null,
  };
  const modules = { react: hooks, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, "next/link": "a", ...i18nModules, "@/lib/account-client": accountClient, "@/lib/checkout-client": checkoutClient, "@/lib/checkout-address": checkoutAddress, "@/lib/kz-regions": kzRegions, "@/lib/analytics/events": analyticsEvents };
  const output = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", "fetch", "sessionStorage", code)(id => modules[id] ?? {}, output, async () => ({}), {});
  return { render: props => { index = 0; return output[name](props); }, calls, state };
}

test("demo purchases: the panel shows the no-real-payment notice and sends the sandbox method", async () => {
  const panel = load("CheckoutPanel", { 1: quote("sandbox") });
  const placed = [];
  const tree = panel.render({ cart: CART, disabled: false, onPlaced: order => placed.push(order) }), text = nodeText(tree);
  // Owner 2026-11-22: customers never read "demo"; one neutral line plus the hold time.
  assert.match(text, /No payment is taken for this order\. This total is held until/);
  assert.doesNotMatch(text, /demo/i);
  const button = nodes(tree).find(node => node.type === "button" && /^Place order$/.test(nodeText(node).trim()));
  assert.ok(button, "the place button reads Place order");
  await button.props.onClick();
  assert.equal(panel.calls.length, 1);
  assert.equal(panel.calls[0].command.paymentMethod, "sandbox", "the method comes from the server quote");
  assert.deepEqual(placed, [{ orderId: "o1", orderNumber: "GRM-1", statusToken: "t".repeat(43) }]);
});

test("without demo purchases the demo-checkout (Task 3.3) and manual (O07) copy and methods stay", async () => {
  const panel = load("CheckoutPanel", { 1: quote("demo") });
  const tree = panel.render({ cart: CART, disabled: false, onPlaced: () => {} }), text = nodeText(tree);
  assert.match(text, /No payment is taken for this order\./);
  assert.doesNotMatch(text, /demo/i);
  await nodes(tree).find(node => node.type === "button" && /^Pay$/.test(nodeText(node).trim())).props.onClick();
  assert.equal(panel.calls[0].command.paymentMethod, "demo");
  const manual = load("CheckoutPanel", { 1: quote("manual") });
  const manualTree = manual.render({ cart: CART, disabled: false, onPlaced: () => {} });
  assert.match(nodeText(manualTree), /No payment is taken online/);
  await nodes(manualTree).find(node => node.type === "button" && /^Place order$/.test(nodeText(node).trim())).props.onClick();
  assert.equal(manual.calls[0].command.paymentMethod, "manual");
});

test("the receipt shows Paid only from a paid sandbox server status, with the neutral line and no demo wording", () => {
  const order = { orderId: "o1", orderNumber: "GRM-1", statusToken: null };
  const status = (paymentMode, paymentStatus, status = "confirmed") => ({ orderId: "o1", orderNumber: "GRM-1", status, paymentStatus, fulfillmentStatus: "unfulfilled", paymentMode, total: kzt("202000"), placedAt: null });
  const paid = nodeText(load("OrderReceived", { 0: status("sandbox", "paid") }).render({ order }));
  assert.match(paid, /Status:\s+Paid/);
  assert.match(paid, /No payment is taken for this order\./);
  assert.doesNotMatch(paid, /demo/i);
  const pending = nodeText(load("OrderReceived", { 0: status("sandbox", "unpaid", "pending_payment") }).render({ order }));
  assert.doesNotMatch(pending, /Paid/);
  assert.match(pending, /Awaiting payment/);
  const demo = nodeText(load("OrderReceived", { 0: status("demo", "unpaid", "pending_payment") }).render({ order }));
  assert.match(demo, /Payment not completed/, "a demo order still awaiting payment offers Try again");
  assert.doesNotMatch(demo, /Paid/);
  const unknown = nodeText(load("OrderReceived").render({ order }));
  assert.doesNotMatch(unknown, /Paid/, "nothing is shown as paid before the server answers");
});

// Final review 2026-11-22: the server's English PAYMENT_UNAVAILABLE text says "Demo purchases are not available…";
// customers must not read it — the panel shows its own neutral "checkout options changed" line instead.
test("a payment-unavailable refusal never shows the server's demo wording", async () => {
  const panel = load("CheckoutPanel", { 1: quote("sandbox") }, { placeOrder: async () => { throw new CartRequestError("Demo purchases are not available while the store takes live payments", "PAYMENT_UNAVAILABLE"); } });
  const tree = panel.render({ cart: CART, disabled: false, onPlaced: () => {} });
  await nodes(tree).find(node => node.type === "button" && /^Place order$/.test(nodeText(node).trim())).props.onClick();
  const text = nodeText(panel.render({ cart: CART, disabled: false, onPlaced: () => {} }));
  assert.match(text, /Checkout options changed\. Review your order and try again\./);
  assert.doesNotMatch(text, /demo/i);
});
