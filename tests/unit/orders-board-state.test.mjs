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
