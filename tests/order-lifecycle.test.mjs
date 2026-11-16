import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateOrderNumber,
  ORDER_ROUTE_STAGES,
  generateOrderMilestones,
  calculateOrderRouteProgress,
  calculateOrderSubtotal,
} from "../src/lib/cms/order-lifecycle.ts";

describe("Order Lifecycle & System Generation", () => {
  it("should generate a system order number matching GRM-XXXXX format", () => {
    const orderNum1 = generateOrderNumber();
    const orderNum2 = generateOrderNumber();

    assert.match(orderNum1, /^GRM-\d{5,6}$/);
    assert.match(orderNum2, /^GRM-\d{5,6}$/);
    assert.notEqual(orderNum1, orderNum2);
  });

  it("should define standard chronological route stages from creation to delivered", () => {
    assert.deepEqual(ORDER_ROUTE_STAGES, [
      "created",
      "processing",
      "shipped",
      "out_for_delivery",
      "delivered",
    ]);
  });

  it("should generate a complete route map with dates for a delivered order", () => {
    const order = {
      id: "ord-test-1",
      orderNumber: "GRM-100482",
      fulfillmentStatus: "delivered",
      createdAt: "2026-07-03T10:00:00.000Z",
      clientName: "Alex Rivera",
      shippingAddress: "Dostyk Ave 105, Apt 42, Almaty, Kazakhstan",
      items: [
        { productId: "fenix8-47", name: "fēnix® 8 – 47 mm, AMOLED", price: 1099.99, quantity: 1 }
      ]
    };

    const milestones = generateOrderMilestones(order);
    assert.equal(milestones.length, 5);

    // All milestones must be completed for delivered status
    assert.ok(milestones.every((m) => m.completed === true));
    assert.equal(milestones[4].stage, "delivered");
    assert.equal(milestones[4].current, true);

    // Every milestone must have a valid date
    milestones.forEach((m) => {
      assert.ok(!isNaN(Date.parse(m.date)), `Milestone ${m.stage} should have a valid date`);
      assert.ok(m.label && m.label.length > 0);
      assert.ok(m.description && m.description.length > 0);
    });

    // Dates must be in chronological order
    for (let i = 0; i < milestones.length - 1; i++) {
      assert.ok(
        new Date(milestones[i].date).getTime() <= new Date(milestones[i + 1].date).getTime(),
        `Date of ${milestones[i].stage} should be <= date of ${milestones[i + 1].stage}`
      );
    }
  });

  it("should correctly mark partial progression for a shipped order", () => {
    const order = {
      id: "ord-test-2",
      orderNumber: "GRM-89248",
      fulfillmentStatus: "shipped",
      createdAt: "2026-11-08T14:20:00.000Z",
      trackingNumber: "SGPOST-77192841",
      items: []
    };

    const milestones = generateOrderMilestones(order);
    assert.equal(milestones.length, 5);

    // Created, processing, and shipped should be completed
    assert.equal(milestones[0].completed, true);
    assert.equal(milestones[1].completed, true);
    assert.equal(milestones[2].completed, true);
    assert.equal(milestones[2].current, true);

    // out_for_delivery and delivered should not be completed yet
    assert.equal(milestones[3].completed, false);
    assert.equal(milestones[4].completed, false);
  });

  it("should compute correct visual route progress percentage", () => {
    assert.equal(calculateOrderRouteProgress("new"), 20);
    assert.equal(calculateOrderRouteProgress("processing"), 40);
    assert.equal(calculateOrderRouteProgress("shipped"), 65);
    assert.equal(calculateOrderRouteProgress("out_for_delivery"), 85);
    assert.equal(calculateOrderRouteProgress("delivered"), 100);
    assert.equal(calculateOrderRouteProgress("canceled"), 0);
  });

  it("should calculate order subtotal across itemized product lines", () => {
    const items = [
      { productId: "prod-1", name: "fēnix 8", price: 999.99, quantity: 2 },
      { productId: "prod-2", name: "HRM-Pro Plus", price: 129.99, quantity: 1 },
    ];
    const subtotal = calculateOrderSubtotal(items);
    assert.equal(subtotal, 999.99 * 2 + 129.99);
  });
});
