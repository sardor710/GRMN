// Task 13B: integer-safe KZT arithmetic for quotes — deterministic remainder allocation, floor
// percentages, and display-only USD conversion from the manual KZT-per-USD rate.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

async function money() {
  assert.ok(existsSync(new URL("../../src/server/pricing/money.ts", import.meta.url)), "Task 13B requires the pricing money module");
  return import("../../src/server/pricing/money.ts");
}

test("allocate splits a total by weight with the remainder going to the largest fractions, deterministically", async () => {
  const { allocate } = await money();
  assert.deepEqual(allocate(1000n, [3333n, 3333n, 3334n]), [333n, 333n, 334n]);
  assert.deepEqual(allocate(1000n, [1n, 1n, 1n]), [334n, 333n, 333n], "equal fractions: earliest line first");
  assert.deepEqual(allocate(7n, [5n, 0n, 5n]), [4n, 0n, 3n], "a zero weight receives nothing");
  assert.deepEqual(allocate(0n, [10n, 20n]), [0n, 0n]);
  const big = 9_007_199_254_740_993n;
  const parts = allocate(big, [big, 1n, 2n]);
  assert.equal(parts.reduce((a, b) => a + b, 0n), big, "never loses a minor unit beyond Number precision");
  for (let round = 0; round < 200; round++) {
    const weights = Array.from({ length: 1 + (round % 7) }, (_, i) => BigInt((round * 7919 + i * 104729) % 100000));
    const total = BigInt((round * 31337) % 50000);
    const sum = weights.reduce((a, b) => a + b, 0n);
    if (sum === 0n) { assert.throws(() => allocate(total || 1n, weights)); continue; }
    const out = allocate(total, weights);
    assert.equal(out.reduce((a, b) => a + b, 0n), total);
    out.forEach((part, i) => { assert.ok(part >= 0n); assert.ok(part * sum <= total * weights[i] + sum, "each share is within one unit of its exact share"); });
  }
  assert.throws(() => allocate(-1n, [1n]));
  assert.throws(() => allocate(1n, [-1n, 2n]));
});

test("percentageOf floors basis points on minor units", async () => {
  const { percentageOf } = await money();
  assert.equal(percentageOf(3333n, 1000), 333n);
  assert.equal(percentageOf(9999n, 1250), 1249n);
  assert.equal(percentageOf(100n, 10000), 100n);
  assert.throws(() => percentageOf(100n, 10001));
  assert.throws(() => percentageOf(100n, -1));
  assert.throws(() => percentageOf(100n, 1.5));
});

test("the KZT-per-USD rate is validated strictly and converts with half-up rounding", async () => {
  const { parseKztPerUsd, usdMinorFromKzt } = await money();
  for (const bad of ["0", "0.00", "-1", "abc", "1e3", "", " 450", "450.123456789", "Infinity", "NaN", "1,5", "12345678901234.5"]) assert.throws(() => parseKztPerUsd(bad), bad);
  assert.deepEqual(parseKztPerUsd("450.50"), { numerator: 45050n, scale: 100n });
  assert.equal(usdMinorFromKzt(4505000n, "450.50"), 10000n, "45,050.00 KZT at 450.50 is 100.00 USD");
  assert.equal(usdMinorFromKzt(150n, "100"), 2n, "1.50 KZT at 100 is 0.015 USD, rounded half up to 0.02");
  assert.equal(usdMinorFromKzt(149n, "100"), 1n);
  assert.equal(usdMinorFromKzt(0n, "450"), 0n);
  assert.equal(usdMinorFromKzt(4500000n, "450.00000000"), 10000n);
});
