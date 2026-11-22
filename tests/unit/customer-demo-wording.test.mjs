// Owner 2026-11-22: customers never read "demo" (or test/sandbox wording); a demo order shows a candy-blue dot
// and one neutral line at checkout and on the receipt. The admin keeps its DEMO labels.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const CUSTOMER_NAMESPACES = ["Cart", "Checkout", "AccountPortal"];
const FORBIDDEN = /demo|демо|sandbox|\btest|тест|сынақ/i;
const load = (locale) => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"));
function strings(node, path, out) {
  for (const [key, value] of Object.entries(node)) {
    const at = `${path}.${key}`;
    if (typeof value === "string") out.push([at, value]); else strings(value, at, out);
  }
  return out;
}

for (const locale of ["en", "ru", "kk"]) {
  test(`${locale}: no demo, test or sandbox wording in customer messages`, () => {
    const messages = load(locale);
    const hits = CUSTOMER_NAMESPACES.flatMap(ns => strings(messages[ns] ?? {}, ns, [])).filter(([, value]) => FORBIDDEN.test(value));
    assert.deepEqual(hits, []);
  });
  test(`${locale}: the neutral no-payment line exists`, () => {
    const line = load(locale).Checkout?.noPaymentLine;
    assert.equal(typeof line, "string");
    assert.ok(line.length > 0);
  });
}

test("en neutral line is the owner's copy", () => {
  assert.equal(load("en").Checkout.noPaymentLine, "No payment is taken for this order.");
});
