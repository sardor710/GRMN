// Owner 2026-11-25 (plan T5.1/T5.3): the customer's order tracker — Ordered → Packed → Shipped → Delivered with icons;
// every completed step lights up and the line along the passed way is Garmin cyan #6DCFF6; a cancelled order shows the
// tracker stopped. Text is in EN, RU and KK.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";

const file = new URL("../../src/components/account/OrderTracker.tsx", import.meta.url);
const LABELS = { ordered: "Ordered", packed: "Packed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", cancelledNote: "This order was cancelled.", progress: "Order progress" };
const render = props => componentFixture(file).render({ labels: LABELS, ...props });
const steps = tree => nodes(tree).filter(node => node.props?.["data-step"]);
const lines = tree => nodes(tree).filter(node => node.props?.["data-line"]);

test("a packed order lights Ordered and Packed, with the cyan line only between them", () => {
  const tree = render({ stage: "packed" });
  assert.deepEqual(steps(tree).map(node => [node.props["data-step"], node.props["data-done"]]), [["ordered", true], ["packed", true], ["shipped", false], ["delivered", false]]);
  assert.deepEqual(lines(tree).map(node => node.props["data-passed"]), [true, false, false]);
  for (const line of lines(tree)) assert.equal(line.props.className.includes("bg-[#6DCFF6]"), line.props["data-passed"], "only passed segments are Garmin cyan");
  assert.deepEqual(steps(tree).filter(node => node.props["aria-current"] === "step").map(node => node.props["data-step"]), ["packed"]);
});

test("a delivered order lights every step and the whole line", () => {
  const tree = render({ stage: "delivered" });
  assert.ok(steps(tree).every(node => node.props["data-done"]));
  assert.ok(lines(tree).every(node => node.props["data-passed"]));
});

test("a just-placed order lights only Ordered", () => {
  const tree = render({ stage: "ordered", dates: { ordered: "2026-11-25T10:00:00.000Z", packed: null, shipped: null, delivered: null }, formatDate: () => "25 Nov" });
  assert.deepEqual(steps(tree).map(node => node.props["data-done"]), [true, false, false, false]);
  assert.ok(lines(tree).every(node => !node.props["data-passed"]));
  assert.ok(nodeText(tree).includes("25 Nov"), "the reached step shows its date");
});

test("a cancelled order shows the tracker stopped: nothing cyan, the note shown", () => {
  const tree = render({ stage: "cancelled" });
  assert.ok(steps(tree).every(node => !node.props["data-done"]));
  assert.ok(lines(tree).every(node => !node.props.className.includes("#6DCFF6")));
  assert.ok(nodeText(tree).includes("This order was cancelled."));
});

test("steps are readable without colour: each has its label text", () => {
  const text = nodeText(render({ stage: "shipped" }));
  for (const label of ["Ordered", "Packed", "Shipped", "Delivered"]) assert.ok(text.includes(label), label);
});

test("tracker, serial and event texts exist in English, Russian and Kazakh", () => {
  const read = locale => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")).AccountPortal;
  const keys = portal => [...Object.keys(portal.tracker ?? {}).map(k => "tracker." + k), ...Object.keys(portal.events ?? {}).map(k => "events." + k), portal.order?.serial ? "order.serial" : "", portal.status?.partially_shipped ? "status.partially_shipped" : ""].filter(Boolean).sort();
  const en = keys(read("en"));
  for (const key of ["tracker.ordered", "tracker.packed", "tracker.shipped", "tracker.delivered", "tracker.cancelled", "tracker.cancelledNote", "tracker.progress", "events.fulfillment_packed", "order.serial", "status.partially_shipped"]) assert.ok(en.includes(key), key);
  assert.deepEqual(keys(read("ru")), en);
  assert.deepEqual(keys(read("kk")), en);
  for (const locale of ["ru", "kk"]) assert.ok(!/\$/.test(JSON.stringify(read(locale).tracker)), "no dollar sign");
});
