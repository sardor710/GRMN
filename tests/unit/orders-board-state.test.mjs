// Owner 2026-11-25 (plan T4.1): the admin order board's rules — four columns, each card's next step, cards move one
// column forward only, and the list request the toolbar builds.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD_COLUMNS, nextAction, canDrop, listQuery, PERIOD_OPTIONS } from "../../src/app/admin/orders/_components/board/stage.ts";

const order = (extra = {}) => ({ stage: "new", paymentPill: "paid", archived: false, legacy: false, status: "confirmed", fulfillmentStatus: "unfulfilled", ...extra });

test("the board has New, Packed, Shipped and Delivered in that order", () => {
  assert.deepEqual(BOARD_COLUMNS.map(column => [column.stage, column.label]), [["new", "New"], ["packed", "Packed"], ["shipped", "Shipped"], ["delivered", "Delivered"]]);
});

test("each card offers its next step only when it can be taken", () => {
  assert.equal(nextAction(order()), "pack");
  assert.equal(nextAction(order({ paymentPill: "awaiting", status: "pending_payment" })), null, "packing waits for payment");
  assert.equal(nextAction(order({ paymentPill: "problem" })), null);
  assert.equal(nextAction(order({ stage: "packed", fulfillmentStatus: "processing" })), "ship");
  assert.equal(nextAction(order({ stage: "shipped", fulfillmentStatus: "shipped" })), "deliver");
  assert.equal(nextAction(order({ stage: "shipped", fulfillmentStatus: "partially_shipped" })), null, "a part-shipped order is handled in its detail");
  assert.equal(nextAction(order({ stage: "delivered", fulfillmentStatus: "delivered" })), null);
  assert.equal(nextAction(order({ archived: true })), null);
  assert.equal(nextAction(order({ legacy: true })), null);
  assert.equal(nextAction(order({ fulfillmentStatus: "exception" })), null);
  assert.equal(nextAction(order({ status: "cancel_requested" })), null);
});

test("a card can be dropped only on the next column, and only when its next step is open", () => {
  assert.equal(canDrop(order(), "packed"), true);
  assert.equal(canDrop(order(), "shipped"), false);
  assert.equal(canDrop(order(), "new"), false);
  assert.equal(canDrop(order({ stage: "packed", fulfillmentStatus: "processing" }), "shipped"), true);
  assert.equal(canDrop(order({ stage: "packed", fulfillmentStatus: "processing" }), "new"), false, "never backwards");
  assert.equal(canDrop(order({ paymentPill: "awaiting", status: "pending_payment" }), "packed"), false);
});

test("the toolbar builds the list request", () => {
  assert.equal(listQuery({ view: "active", period: "all", q: "", mode: "" }), "limit=200");
  assert.equal(listQuery({ view: "archive", period: "30d", q: " SN12 ", mode: "demo" }), "limit=200&paymentMode=demo&view=archive&period=30d&q=SN12");
  assert.equal(listQuery({ view: "active", period: "custom", from: "2026-11-01", to: "2026-11-25", q: "", mode: "" }), "limit=200&period=custom&from=2026-11-01&to=2026-11-25");
  assert.equal(listQuery({ view: "active", period: "custom", from: "", to: "", q: "", mode: "" }), "limit=200", "an unfinished custom range is not sent");
  assert.equal(listQuery({ view: "active", period: "all", q: "", mode: "" }, "CURSOR1"), "limit=200&cursor=CURSOR1");
});

test("period choices match the owner's list", () => {
  assert.deepEqual(PERIOD_OPTIONS.map(option => option.label), ["All time", "Today", "This week", "Last 7 days", "Last 30 days", "This month", "Custom range"]);
});

test("a return line uses picked serials when the item has serials, otherwise the typed count (final review)", async () => {
  const { returnLines } = await import("../../src/app/admin/orders/_components/board/stage.ts");
  const shipped = new Map([
    ["watch-with-serials", { serials: [{ id: "s1", serial: "A" }, { id: "s2", serial: "B" }], units: 2 }],
    ["watch-shipped-before-serials", { serials: [], units: 1 }],
    ["band", { serials: [], units: 3 }],
  ]);
  assert.deepEqual(returnLines(shipped, { s2: true }, { "watch-shipped-before-serials": "1", band: "2" }), [
    { orderItemId: "watch-with-serials", quantity: 1, serialIds: ["s2"] },
    { orderItemId: "watch-shipped-before-serials", quantity: 1 },
    { orderItemId: "band", quantity: 2 },
  ]);
  assert.deepEqual(returnLines(shipped, {}, { band: "0" }), [], "nothing picked, nothing counted");
});

test("the board offers Load more when there are more orders than one page (final review)", async () => {
  const { componentFixture, nodes, nodeText } = await import("../helpers/component-fixture.mjs");
  const dashboard = await import("../../src/lib/admin/dashboard.ts");
  const boardStage = await import("../../src/app/admin/orders/_components/board/stage.ts");
  const summary = { id: "a", orderNumber: "GRM-A", paymentMode: "live", contactName: "UI", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", status: "confirmed", dataQuality: "complete", total: { amountMinor: "100", currency: "KZT" }, itemsCount: 1, itemNames: ["X"], stage: "new", paymentPill: "paid", archived: false, legacy: false, placedAt: "2026-11-25T10:00:00.000Z", deliveredAt: null };
  const fixture = componentFixture(new URL("../../src/app/admin/orders/_components/FulfillmentScreen.tsx", import.meta.url), {
    modules: { "@/lib/admin/dashboard": dashboard, "./board/stage": boardStage, "next/navigation": { useSearchParams: () => new URLSearchParams() } },
    fetcher: async () => ({ ok: true, status: 200, json: async () => ({ items: [summary], nextCursor: "NEXT", counts: { new: 250, packed: 0, shipped: 0, delivered: 0 } }) }),
  });
  fixture.render(); await fixture.effects[1]();
  for (let i = 0; i < 20; i++) await fixture.flush();
  const tree = fixture.render();
  assert.ok(nodes(tree).some(node => node.type === "button" && nodeText(node).includes("Load more orders")), "the board can load the older orders");
});

// 0033 (owner 2026-11-26): pickup orders.
test("pickup: New → Ready for pickup → Picked up; never Shipped", async () => {
  const { actionLabel, stageLabel } = await import("../../src/app/admin/orders/_components/board/stage.ts");
  const pickup = extra => order({ fulfillmentMethod: "pickup", ...extra });
  assert.equal(nextAction(pickup()), "pack");
  assert.equal(actionLabel(pickup(), "pack"), "Ready for pickup");
  assert.equal(actionLabel(order(), "pack"), "Pack");
  const ready = pickup({ stage: "packed", fulfillmentStatus: "processing" });
  assert.equal(nextAction(ready), "pick_up");
  assert.equal(actionLabel(ready, "pick_up"), "Mark picked up");
  assert.equal(canDrop(ready, "delivered"), true);
  assert.equal(canDrop(ready, "shipped"), false);
  assert.equal(stageLabel(ready), "Ready for pickup");
  assert.equal(stageLabel(pickup({ stage: "delivered", fulfillmentStatus: "delivered" })), "Picked up");
  assert.equal(stageLabel(order({ stage: "packed" })), "Packed");
});
