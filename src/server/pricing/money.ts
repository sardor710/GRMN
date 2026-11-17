import "server-only";
import { AuthFailure } from "../auth/config.ts";

// Task 13B. Integer-only money arithmetic for quotes. Every amount is a bigint of minor units
// (KZT and USD both use exponent 2); no floating point touches an amount.

const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), TEN_THOUSAND = BigInt(10000);

/**
 * Splits `total` across `weights` in proportion, flooring each exact share and handing the
 * remaining units to the largest fractional parts (ties: earliest index). The parts always sum
 * to `total`, and each part is within one unit of its exact share.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (total < ZERO || weights.some(weight => weight < ZERO)) throw new RangeError("allocate needs nonnegative amounts");
  const sum = weights.reduce((a, b) => a + b, ZERO);
  if (sum === ZERO) {
    if (total === ZERO) return weights.map(() => ZERO);
    throw new RangeError("allocate needs a positive weight");
  }
  const parts = weights.map(weight => (total * weight) / sum);
  const remainders = weights.map((weight, index) => ({ index, rest: (total * weight) % sum }));
  let left = total - parts.reduce((a, b) => a + b, ZERO);
  remainders.sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1));
  for (const { index } of remainders) {
    if (left === ZERO) break;
    parts[index] += ONE; left -= ONE;
  }
  return parts;
}

/** `amount * bps / 10000`, floored. Basis points are an integer from 0 to 10000. */
export function percentageOf(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new RangeError("Basis points must be an integer from 0 to 10000");
  return (amount * BigInt(bps)) / TEN_THOUSAND;
}

/** `amount * bps / 10000`, rounded half up (used for tax on a whole order). */
export function percentageHalfUp(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new RangeError("Basis points must be an integer from 0 to 10000");
  return (amount * BigInt(bps) * TWO + TEN_THOUSAND) / (TEN_THOUSAND * TWO);
}

const RATE = /^(\d{1,12})(?:\.(\d{1,8}))?$/;

/** Parses a manual KZT-per-USD rate as an exact fraction. Rejects zero, signs, exponents and overprecision. */
export function parseKztPerUsd(value: string): { numerator: bigint; scale: bigint } {
  const match = typeof value === "string" ? RATE.exec(value) : null;
  if (!match) throw new AuthFailure("INVALID_RATE", 400, "The exchange rate must be a positive decimal with at most 8 decimal places");
  const fraction = match[2] ?? "", numerator = BigInt(match[1] + fraction), scale = BigInt(10) ** BigInt(fraction.length);
  if (numerator === ZERO) throw new AuthFailure("INVALID_RATE", 400, "The exchange rate must be positive");
  return { numerator, scale };
}

/** USD minor units for a KZT minor amount at `kztPerUsd` (KZT for 1 USD), rounded half up. Display only. */
export function usdMinorFromKzt(kztMinor: bigint, kztPerUsd: string): bigint {
  if (kztMinor < ZERO) throw new RangeError("Amounts are nonnegative");
  const { numerator, scale } = parseKztPerUsd(kztPerUsd);
  return (kztMinor * scale * TWO + numerator) / (numerator * TWO);
}
