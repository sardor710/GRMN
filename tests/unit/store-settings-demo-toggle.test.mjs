// Final review M10: turning demo checkout on or off must not wipe unsaved edits in the general settings and
// manual-payment forms; it updates only the settings record (paymentMode, version).
import test from "node:test";
import assert from "node:assert/strict";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";

const FILE = "src/app/admin/settings/_components/StoreSettingsScreen.tsx";
const settings = (version, paymentMode) => ({
  version, storeName: "Saved store", contactEmail: "shop@example.invalid", supportPhone: null, baseCurrency: "KZT", usdDisplayEnabled: false, exchangeRate: null,
  freeShippingThresholdMinor: null, maintenanceMode: false, paymentMode, seoTitle: null, seoDescription: null,
  manualPayment: { instructions: "Saved instructions", holdHours: 48 }, demoCheckout: { enabled: paymentMode === "demo", forcedOff: false },
});

test("the demo toggle keeps unsaved general and manual-payment edits and takes the new version", async () => {
  const puts = [];
  const fixture = componentFixture(FILE, {
    fetcher: async (_url, options = {}) => {
      if (options.method === "PUT") { const body = JSON.parse(options.body); puts.push(body); return { ok: true, status: 200, json: async () => settings(body.expectedVersion + 1, body.paymentMode) }; }
      return { ok: true, status: 200, json: async () => settings(7, "demo") };
    },
  });
  fixture.render();
  fixture.effects[0]();
  for (let i = 0; i < 5; i++) await fixture.flush();
  let tree = fixture.render();
  // Unsaved edits: the store name and the manual-payment instructions.
  nodes(tree).find(node => node.type === "input" && node.props?.value === "Saved store").props.onChange({ target: { value: "Edited store" } });
  tree = fixture.render();
  nodes(tree).find(node => node.props?.name === "manualPaymentInstructions").props.onChange({ target: { value: "Edited instructions" } });
  tree = fixture.render();
  nodes(tree).find(node => node.props?.name === "demoCheckout").props.onChange({ target: { checked: false } });
  for (let i = 0; i < 5; i++) await fixture.flush();
  assert.deepEqual(puts, [{ expectedVersion: 7, paymentMode: "live" }]);
  tree = fixture.render();
  assert.ok(nodes(tree).some(node => node.type === "input" && node.props?.value === "Edited store"), "the unsaved store name is kept");
  assert.equal(nodes(tree).find(node => node.props?.name === "manualPaymentInstructions").props.value, "Edited instructions");
  assert.equal(nodes(tree).find(node => node.props?.name === "demoCheckout").props.checked, false);
  assert.match(nodeText(tree), /Version\s+8/);
  // The next save of the general form is based on the new version and carries the edit.
  await nodes(tree).find(node => node.type === "button" && nodeText(node) === "Save settings").props.onClick();
  for (let i = 0; i < 5; i++) await fixture.flush();
  assert.equal(puts[1].expectedVersion, 8);
  assert.equal(puts[1].storeName, "Edited store");
});
