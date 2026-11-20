// Task 5b.1 fix 1: admin amounts show KZT only for records explicitly in KZT. Unmarked legacy money (USD-scale
// seed data) and USD records are a plain number with no currency sign (the 5a.2 rule), never relabelled as tenge.
import test from "node:test";
import assert from "node:assert/strict";
import { formatRecordAmount, formatKzt } from "../../src/lib/money.ts";
import { componentFixture, nodeText } from "../helpers/component-fixture.mjs";

const plain = value => value.replace(/ /g, " ");

test("formatRecordAmount: KZT records in tenge, unmarked and USD records as a plain number", () => {
  assert.equal(formatRecordAmount(1350000, "KZT"), formatKzt({ major: 1350000 }, "en"));
  assert.equal(plain(formatRecordAmount(1350000, "KZT")), "KZT 1,350,000.00");
  for (const currency of [undefined, null, "USD", ""]) {
    const text = formatRecordAmount(749.99, currency);
    assert.equal(text, "749.99", String(currency));
    assert.doesNotMatch(text, /KZT|₸|\$|USD/);
  }
  assert.equal(formatRecordAmount(undefined, "KZT"), "—");
  assert.equal(formatRecordAmount(null, undefined), "—");
});

test("legacy clients list: unmarked totals carry no currency sign; PostgreSQL totals are KZT", () => {
  const client = { id: "c1", name: "Legacy Client", email: "c@example.invalid", phone: "", country: "SG", status: "regular", totalSpent: 3100, ordersCount: 1, createdAt: "" };
  const legacy = plain(nodeText(componentFixture("src/app/admin/clients/_components/ClientsScreen.tsx", { backend: "legacy", items: [client] }).render()));
  assert.ok(legacy.includes("3,100.00"));
  assert.doesNotMatch(legacy, /KZT 3,100|3,100\.00 KZT|\$3,100/);
  const postgres = plain(nodeText(componentFixture("src/app/admin/clients/_components/ClientsScreen.tsx", { backend: "postgres", items: [client] }).render()));
  assert.ok(postgres.includes("KZT 3,100.00"));
});

test("legacy discounts: a fixed amount without a marker is a plain number", async () => {
  const discount = { id: "d1", code: "FIX10", description: "", type: "fixed", value: 10, minSpend: 50, usageCount: 0, applyType: "all", status: "active", createdAt: "" };
  const fixture = componentFixture("src/app/admin/discounts/_components/DiscountsScreen.tsx", { backend: "legacy", fetcher: async () => ({ ok: true, status: 200, json: async () => ({ discounts: [discount] }) }) });
  fixture.render();
  for (const effect of [...fixture.effects]) effect();
  for (let i = 0; i < 5; i++) await fixture.flush();
  const text = plain(nodeText(fixture.render()));
  assert.ok(text.includes("FIX10"), "the discount row rendered");
  assert.ok(text.includes("10.00 off") && text.includes("50.00"));
  assert.doesNotMatch(text, /KZT 10\.00|KZT 50\.00|\$10/);
});
