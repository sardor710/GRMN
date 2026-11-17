// Task 13A: in server mode the cart page renders the server DTO in KZT, shows price-change and
// unavailable notices, and offers no checkout (real checkout arrives with Task 14).
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

function mount(cart, calls = []) {
  const useCart = () => ({
    mode: "server", server: cart, error: null, items: [], count: 3, subtotal: 0, busy: false,
    add: async () => {}, setQty: async (id, qty) => { calls.push(["setQty", id, qty]); }, remove: async id => { calls.push(["remove", id]); },
    clear: async () => { calls.push(["clear"]); }, acknowledge: async () => { calls.push(["acknowledge"]); },
  });
  const fixture = componentFixture(file, { modules: { "@/lib/cart": { useCart }, "@/lib/account-client": accountClient } });
  return fixture.render();
}

test("server mode shows KZT totals, the old price, the unavailable line and no checkout", () => {
  const calls = [], tree = mount(CART, calls), text = nodeText(tree);
  assert.match(text, /3[\s ,.]?000[.,]00 KZT/);
  assert.match(text, /1[\s ,.]?200[.,]00 KZT/, "the previously seen price is shown");
  assert.match(text, /price.*changed/i);
  assert.match(text, /no longer available/i);
  assert.doesNotMatch(text, /\$|Estimated tax|Thank you for your order/);
  const buttons = nodes(tree).filter(node => node.type === "button");
  const checkout = buttons.find(node => /checkout/i.test(nodeText(node)));
  assert.ok(checkout?.props.disabled, "checkout stays disabled until Task 14");
  buttons.find(node => /accept/i.test(nodeText(node))).props.onClick();
  buttons.find(node => node.props["aria-label"] === "Increase" && node.props["data-variant"] === V1).props.onClick();
  assert.equal(buttons.find(node => node.props["aria-label"] === "Increase" && node.props["data-variant"] === V2)?.props.disabled, true, "an unavailable line cannot grow");
  assert.deepEqual(calls, [["acknowledge"], ["setQty", V1, 3]]);
});

test("server mode with an empty cart shows the empty state", () => {
  const text = nodeText(mount({ ...CART, id: null, version: 0, lines: [], notices: [], subtotal: kzt("0") }));
  assert.match(text, /Your cart is empty/);
});
