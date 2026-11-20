// Task 4.2: pure helpers for the PostgreSQL admin dashboard (src/app/admin/_components/ReportsScreen.tsx).
// Money stays in minor units held in strings and is summed with BigInt. Real money is the "live"
// environment only; demo and sandbox are kept apart and never added to it.
import { groupMinor } from "../money.ts";

export type ReportEnvironment = "sandbox" | "live" | "demo";
export interface CurrencyTotal { currency: string; environment: ReportEnvironment; capturedMinor: string; refundedMinor: string; netMinor: string; ordersPaid: number }
export interface DayTotal { date: string; currency: string; environment: ReportEnvironment; capturedMinor: string; refundedMinor: string; netMinor: string }
export interface MoneyLine { currency: string; capturedMinor: string; refundedMinor: string; netMinor: string; ordersPaid: number }
export interface SplitTotals { real: MoneyLine[]; demo: MoneyLine[]; sandbox: MoneyLine[] }
export interface DailyPoint { date: string; realMinor: string; demoMinor: string }

const MINOR = /^-?(0|[1-9][0-9]*)$/;
const GROUP: Record<ReportEnvironment, keyof SplitTotals> = { live: "real", demo: "demo", sandbox: "sandbox" };

function sumLines(rows: CurrencyTotal[]): MoneyLine[] {
  const byCurrency = new Map<string, { captured: bigint; refunded: bigint; net: bigint; orders: number }>();
  for (const row of rows) {
    const line = byCurrency.get(row.currency) ?? { captured: BigInt(0), refunded: BigInt(0), net: BigInt(0), orders: 0 };
    line.captured += BigInt(row.capturedMinor); line.refunded += BigInt(row.refundedMinor); line.net += BigInt(row.netMinor); line.orders += row.ordersPaid;
    byCurrency.set(row.currency, line);
  }
  return [...byCurrency].sort(([a], [b]) => a.localeCompare(b)).map(([currency, line]) => ({
    currency, capturedMinor: line.captured.toString(), refundedMinor: line.refunded.toString(), netMinor: line.net.toString(), ordersPaid: line.orders,
  }));
}

/** Splits the summary totals into real (live), demo and sandbox lines, one per currency. Nothing is summed across groups or currencies. */
export function splitTotals(totals: CurrencyTotal[]): SplitTotals {
  const groups: Record<keyof SplitTotals, CurrencyTotal[]> = { real: [], demo: [], sandbox: [] };
  for (const row of totals) { const group = GROUP[row.environment]; if (group) groups[group].push(row); }
  return { real: sumLines(groups.real), demo: sumLines(groups.demo), sandbox: sumLines(groups.sandbox) };
}

/**
 * "123456789012345678" KZT minor units to "1,234,567,890,123,456.78 KZT"; negative nets keep their sign. BigInt-safe.
 * A malformed amount is shown as it came ("1.5 KZT") rather than throwing during render.
 */
export function formatMinor(minor: string, currency: string, locale = "en-US"): string {
  if (typeof minor !== "string" || !MINOR.test(minor)) return `${String(minor)} ${currency}`;
  const negative = minor.startsWith("-");
  return (negative ? "-" : "") + groupMinor(negative ? minor.slice(1) : minor, locale) + " " + currency;
}

/**
 * Fix round 1: one request generation at a time. `begin()` aborts the previous generation's fetches
 * and returns its signal plus `isCurrent()`, which is false once a newer generation has begun, so a
 * late response from an older date range is dropped instead of landing under newer dates.
 */
export function createRequestGate() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    begin(): { signal: AbortSignal; isCurrent: () => boolean } {
      controller?.abort();
      controller = new AbortController();
      const mine = ++generation;
      return { signal: controller.signal, isCurrent: () => mine === generation };
    },
    /** Aborts the current generation (unmount); its responses are dropped too. */
    abort() { controller?.abort(); controller = null; generation++; },
  };
}

/** Minor units to a plain number of major units, for chart geometry only (never for displayed amounts). */
export const minorToNumber = (minor: string): number => Number(BigInt(minor)) / 100;

/** Every calendar date from `from` to `to` inclusive (YYYY-MM-DD), at most 366 days. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(to + "T00:00:00Z");
  for (let at = Date.parse(from + "T00:00:00Z"); Number.isFinite(at) && at <= end && dates.length < 366; at += 86_400_000) dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
}

/** One point per day of the range for one currency: real (live) net and demo net kept as separate series. */
export function dailyRevenue(days: DayTotal[], from: string, to: string, currency: string): DailyPoint[] {
  const real = new Map<string, bigint>(), demo = new Map<string, bigint>();
  for (const day of days) {
    if (day.currency !== currency) continue;
    const target = day.environment === "live" ? real : day.environment === "demo" ? demo : null;
    if (target) target.set(day.date, (target.get(day.date) ?? BigInt(0)) + BigInt(day.netMinor));
  }
  return dateRange(from, to).map(date => ({ date, realMinor: (real.get(date) ?? BigInt(0)).toString(), demoMinor: (demo.get(date) ?? BigInt(0)).toString() }));
}

/** Sum of one series of daily points, as a minor-unit string. */
export const seriesTotal = (points: DailyPoint[], series: "real" | "demo"): string =>
  points.reduce((sum, point) => sum + BigInt(series === "real" ? point.realMinor : point.demoMinor), BigInt(0)).toString();

/** A clean axis maximum (1, 2, 2.5 or 5 times a power of ten) at or above `value`. */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

/** Axis tick label: in full under 10,000, compact above (10K, 2.5M). */
export function axisLabel(value: number): string {
  const size = Math.abs(value);
  if (size < 10_000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const [divisor, suffix] = size >= 1e9 ? [1e9, "B"] : size >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return (value / divisor).toLocaleString("en-US", { maximumFractionDigits: 1 }) + suffix;
}

/** Currencies present in the totals or days, KZT first. */
export function currenciesOf(totals: CurrencyTotal[], days: DayTotal[]): string[] {
  const set = new Set([...totals.map(row => row.currency), ...days.map(row => row.currency)]);
  return [...set].sort((a, b) => a === "KZT" ? -1 : b === "KZT" ? 1 : a.localeCompare(b));
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting payment", confirmed: "Confirmed", cancel_requested: "Cancel requested", cancelled: "Cancelled", closed: "Closed",
};
export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  unfulfilled: "Unfulfilled", processing: "Processing", partially_shipped: "Partially shipped", shipped: "Shipped", delivered: "Delivered", exception: "Exception",
};

/** Status counts in a fixed, readable order; statuses the labels do not know follow, by name. Zero counts are dropped. */
export function statusRows(counts: Record<string, number>, labels: Record<string, string>): Array<{ status: string; label: string; count: number }> {
  const known = Object.keys(labels), extra = Object.keys(counts).filter(status => !known.includes(status)).sort();
  return [...known, ...extra].filter(status => (counts[status] ?? 0) > 0).map(status => ({ status, label: labels[status] ?? status.replace(/_/g, " "), count: counts[status] }));
}
