// M8.5: staff see where an order goes. The fulfillment detail lists the delivery snapshot and shows
// a kz-regions code as its region name; an unknown stored value (older orders) is shown as stored.
import assert from "node:assert/strict";
import test from "node:test";
import { componentFixture, nodeText } from "../helpers/component-fixture.mjs";
import * as accountClient from "../../src/lib/account-client.ts";
import * as dashboard from "../../src/lib/admin/dashboard.ts";
import * as boardStage from "../../src/app/admin/orders/_components/board/stage.ts";

const DETAIL = {
  id: "o1", orderNumber: "GRM-9", status: "confirmed", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", paymentMode: "sandbox", version: 1, legacy: false,
  fulfillable: { allowed: true, reason: null }, payment: { method: "sandbox", confirmable: false, confirmation: null }, total: { amountMinor: "100000", currency: "KZT" }, contact: { name: "Synthetic Buyer", phone: "+77011234567", email: "buyer@example.invalid" },
  deliveryAddress: { kind: "structured", recipient_name: "Synthetic Buyer", phone: "+77011234567", country_code: "KZ", city: "Konaev", line1: "Abay 12", region: "almaty-region" },
  items: [], shipments: [], timeline: [], refunds: [], returns: [],
};

test("admin fulfillment detail shows the delivery address with the region name instead of its code", () => {
  const fixture = componentFixture(new URL("../../src/app/admin/orders/_components/FulfillmentScreen.tsx", import.meta.url), { modules: { "@/lib/account-client": accountClient, "@/lib/admin/dashboard": dashboard, "./board/stage": boardStage, "next/navigation": { useSearchParams: () => new URLSearchParams() } } });
  fixture.render();
  fixture.state[3] = "o1"; // slot 3 is the selected order id; slot 4 its loaded detail (shown only when the ids match)
  fixture.state[4] = DETAIL;
  const text = nodeText(fixture.render());
  assert.match(text, /Deliver to/);
  assert.match(text, /Konaev Almaty Region/);
  assert.match(text, /buyer@example\.invalid/);
  assert.doesNotMatch(text, /almaty-region/);
  fixture.state[4] = { ...DETAIL, deliveryAddress: { ...DETAIL.deliveryAddress, country_code: "DE", city: "Berlin", region: "Berlin" } };
  assert.match(nodeText(fixture.render()), /Berlin\s+Germany/, "an unknown region is shown as stored");
  fixture.state[4] = { ...DETAIL, deliveryAddress: { kind: "legacy_unstructured", legacy_raw: "Old free-text address" } };
  assert.match(nodeText(fixture.render()), /Old free-text address/);
});
