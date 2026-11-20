// Task 13A/14A: in server mode the cart page renders the server DTO in KZT, shows price-change and
// unavailable notices, and hands checkout to the server checkout panel (Task 14A). The legacy
// browser cart has no checkout: the fake "order placed" screen and its cart clearing are gone.
import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as accountClient from "../../src/lib/account-client.ts";

const file = new URL("../../src/components/CartView.tsx", import.meta.url);
const V1 = "00000000-0000-4000-8000-000000000001", V2 = "00000000-0000-4000-8000-000000000002";
const kzt = amountMinor => ({ amountMinor, currency: "KZT" });
const CART = {
  id: "c1", version: 4, owner: "guest", pendingMerge: false, expiresAt: "2026-12-01T00:00:00.000Z", subtotal: kzt("300000"),
  lines: [
    { variantId: V1, productKey: "fenix-8", name: "fēnix 8", variantName: "47 mm", image: null, quantity: 2, unitPrice: kzt("150000"), previousUnitPrice: kzt("120000"), lineTotal: kzt("300000"), availability: "available" },
    { variantId: V2, productKey: "old-watch", name: "Old watch", variantName: "Base", image: null, quantity: 1, unitPrice: null, previousUnitPrice: null, lineTotal: null, availability: "unavailable" },
  ],
  notices: [{ code: "price_changed", variantId: V1 }, { code: "item_unavailable", variantId: V2 }],
};
function CheckoutPanel() { return null; }
function OrderReceived() { return null; }
let resumed = null;
const resumeCheckout = async () => resumed;

function mount(cart, calls = [], overrides = {}) {
  const useCart = () => ({
    mode: "server", server: cart, error: null, items: [], count: 3, subtotal: 0, busy: false,
    add: async () => {}, setQty: async (id, qty) => { calls.push(["setQty", id, qty]); }, remove: async id => { calls.push(["remove", id]); },
    clear: async () => { calls.push(["clear"]); }, acknowledge: async () => { calls.push(["acknowledge"]); }, refresh: async () => { calls.push(["refresh"]); },
    ...overrides,
  });
  const fixture = componentFixture(file, { modules: { "@/lib/cart": { useCart, lineKeyOf: item => item.sku ? `${item.id}::${item.sku}` : item.id }, "@/lib/account-client": accountClient, "@/components/CheckoutPanel": { CheckoutPanel, OrderReceived, resumeCheckout } } });
  return { fixture, tree: fixture.render() };
}

test("server mode shows KZT totals, the old price, the unavailable line, and a blocked checkout panel", () => {
  const calls = [], { tree } = mount(CART, calls), text = nodeText(tree);
  assert.match(text, /KZT\s?3,000\.00/);
  assert.match(text, /KZT\s?1,200\.00/, "the previously seen price is shown");
  assert.match(text, /price.*changed/i);
  assert.match(text, /no longer available/i);
  assert.doesNotMatch(text, /\$|Estimated tax|Thank you for your order/);
  const panel = nodes(tree).find(node => node.type === CheckoutPanel);
  assert.ok(panel, "checkout is the server checkout panel");
  assert.equal(panel.props.cart, CART);
  assert.equal(panel.props.disabled, true, "an unavailable line or an unaccepted price change blocks checkout");
  const buttons = nodes(tree).filter(node => node.type === "button");
  buttons.find(node => /accept/i.test(nodeText(node))).props.onClick();
  buttons.find(node => node.props["aria-label"] === "Increase" && node.props["data-variant"] === V1).props.onClick();
  assert.equal(buttons.find(node => node.props["aria-label"] === "Increase" && node.props["data-variant"] === V2)?.props.disabled, true, "an unavailable line cannot grow");
  assert.deepEqual(calls, [["acknowledge"], ["setQty", V1, 3]]);
});

test("a clean server cart enables checkout; a placed order shows the receipt and re-syncs the cart", () => {
  const clean = { ...CART, lines: [CART.lines[0]], notices: [] }, calls = [], { fixture, tree } = mount(clean, calls);
  const panel = nodes(tree).find(node => node.type === CheckoutPanel);
  assert.equal(panel.props.disabled, false);
  panel.props.onPlaced({ orderId: "o1", orderNumber: "GRM-1000001", statusToken: null });
  assert.deepEqual(calls, [["refresh"]], "the server converted the cart; the page re-reads it instead of clearing it");
  const after = fixture.render(), receipt = nodes(after).find(node => node.type === OrderReceived);
  assert.deepEqual(receipt?.props.order, { orderId: "o1", orderNumber: "GRM-1000001", statusToken: null });
  assert.ok(!calls.some(call => call[0] === "clear"));
});

test("server mode with an empty cart shows the empty state", () => {
  const text = nodeText(mount({ ...CART, id: null, version: 0, lines: [], notices: [], subtotal: kzt("0") }).tree);
  assert.match(text, /Your Cart is Empty/);
});

test("the legacy browser cart offers no fake checkout and never clears itself on checkout", () => {
  const calls = [], items = [{ id: "fenix-8", name: "fēnix 8", price: 999.99, image: null, qty: 1 }];
  const { tree } = mount(null, calls, { mode: "local", server: null, items, subtotal: 999.99 });
  const text = nodeText(tree);
  assert.doesNotMatch(text, /Thank you for your order|Estimated tax/);
  assert.match(text, /not available/i);
  const checkout = nodes(tree).filter(node => node.type === "button").find(node => /checkout/i.test(nodeText(node)));
  assert.ok(checkout?.props.disabled, "legacy mode cannot place orders");
  assert.equal(checkout.props.onClick, undefined);
  assert.deepEqual(calls, []);
});

// Review I1: a checkout whose response was lost is resumed on load and shows its receipt.
test("on load a pending checkout is resumed and its receipt is shown", async () => {
  resumed = { orderId: "o9", orderNumber: "GRM-1000009", statusToken: "tok" };
  try {
    const calls = [], { fixture } = mount({ ...CART, id: null, version: 0, lines: [], notices: [], subtotal: kzt("0") }, calls);
    for (const effect of fixture.effects) effect();
    await fixture.flush();
    const receipt = nodes(fixture.render()).find(node => node.type === OrderReceived);
    assert.deepEqual(receipt?.props.order, resumed);
    assert.deepEqual(calls, [["refresh"]]);
  } finally { resumed = null; }
});

// Final review M16: converted tenge and unconverted legacy amounts are never summed into one subtotal.
test("the legacy cart hides the subtotal when lines mix converted and unconverted amounts", () => {
  const converted = { id: "a", name: "Converted", price: 450000, image: null, qty: 1 };
  const unconverted = { id: "b", name: "Unconverted", price: 749.99, image: null, qty: 1, unconverted: true };
  const subtotalShown = items => nodeText(mount(null, [], { mode: "local", server: null, items, subtotal: items.reduce((sum, item) => sum + item.price, 0) }).tree).includes("Subtotal");
  assert.equal(subtotalShown([converted, unconverted]), false, "mixed lines: no subtotal");
  assert.equal(subtotalShown([converted]), true);
  assert.equal(subtotalShown([unconverted]), true, "all unconverted: a plain-number subtotal");
});
