"use client";

import { formatCount } from "@/lib/money";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPendingActions, createStockAdjuster } from "@/lib/admin/inventory-client";
import {
  FULFILLMENT_STATUS_LABELS, ORDER_STATUS_LABELS, createRequestGate, currenciesOf, dailyRevenue, formatMinor, splitTotals, statusRows,
  type CurrencyTotal, type DayTotal, type MoneyLine,
} from "@/lib/admin/dashboard";
import { DemoBadge } from "@/components/DemoBadge";
import { cn } from "@/lib/utils";
import { DailyRevenueChart } from "./DailyRevenueChart";

// Task 18B: the PostgreSQL dashboard. Totals come from SQL (captured minus refunded, per currency,
// in the chosen time zone); no order or customer lists are loaded into the browser.
// Task 4.2: tiles (Revenue, Demo revenue, Orders, Awaiting shipment), a daily revenue chart, orders
// by status, recent orders linking to the order, best-sellers with Real / Demo tabs and low stock,
// all for the selected range. Demo money is shown on its own and never added to real money. Every
// section shows its own loading, empty ("no data yet") and error state; an error is never a zero.

interface Summary { from: string; to: string; timeZone: string; totals: CurrencyTotal[]; days: DayTotal[] }
interface StatusCounts { orderStatus: Record<string, number>; fulfillmentStatus: Record<string, number>; demo: number; real: number; awaitingShipment: { real: number; demo: number } }
interface RecentOrder { id: string; number: string; createdAt: string; totalMinor: string; currency: string; paymentStatus: string; fulfillmentStatus: string; demo: boolean }
interface BestSeller { variantId: string; sku: string | null; name: string; currency: string; units: number; revenueMinor: string }
interface BestSellers { real: BestSeller[]; demo: BestSeller[] }
interface ExportJob { id: string; kind: string; status: string; createdAt: string; expiresAt: string }
interface LowStock { variantId: string; productKey: string; name: string; sku: string | null; available: number }
type Loadable<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

const ZONE = "Asia/Almaty";
const PRESETS = [7, 30, 90] as const;
const LOADING = { state: "loading" } as const;
const localDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: ZONE });
const formatDate = (value: string) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: ZONE });
const words = (value: string) => value.replace(/_/g, " ");
const orders = (n: number) => `${formatCount(n)} ${n === 1 ? "order" : "orders"}`;
async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

function Card({ title, name, children, className }: { title: string; name?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={name ?? title} className={cn("min-w-0 border border-garmin-control p-4", className)}>
      <h2 className="mb-4 border-b border-garmin-rule pb-3.5 text-sm font-medium tracking-[0.64px] text-black">{title}</h2>
      {children}
    </section>
  );
}
const Muted = ({ children }: { children: ReactNode }) => <p data-empty className="text-sm text-muted-foreground">{children}</p>;
const Failure = ({ message }: { message: string }) => <p role="alert" className="border border-red-200 bg-red-50 p-2 text-sm font-normal text-red-800">{message}</p>;
const Loading = () => <span className="text-sm font-normal text-muted-foreground">Loading…</span>;
/** Loading, error and ready states for one section; `empty` decides when the ready data has nothing to show. */
function Section<T>({ value, empty, emptyText, children }: { value: Loadable<T>; empty: (data: T) => boolean; emptyText: string; children: (data: T) => ReactNode }) {
  if (value.state === "loading") return <Loading />;
  if (value.state === "error") return <Failure message={value.message} />;
  return empty(value.data) ? <Muted>{emptyText}</Muted> : <>{children(value.data)}</>;
}

function Tile({ name, title, demo, children, foot }: { name: string; title: string; demo?: boolean; children: ReactNode; foot?: ReactNode }) {
  return (
    <div data-tile={name} className="min-w-0 border border-garmin-control p-4">
      <p className="flex items-center gap-2 text-sm font-medium tracking-[0.64px] text-black">{title}{demo && <DemoBadge label="DEMO" className="text-xs" />}</p>
      <div data-tile-value className="mt-2 break-words text-2xl font-bold leading-[30px] tabular-nums text-black">{children}</div>
      {foot && <div className="mt-1 text-sm text-muted-foreground tabular-nums">{foot}</div>}
    </div>
  );
}
function MoneyTile({ name, title, lines, value, demo }: { name: string; title: string; lines: MoneyLine[]; value: Loadable<unknown>; demo?: boolean }) {
  if (value.state !== "ready") return <Tile name={name} title={title} demo={demo}>{value.state === "loading" ? <Loading /> : <Failure message={value.message} />}</Tile>;
  // No payments: "—" and a plain note, never a zero posing as data.
  if (lines.length === 0) return <Tile name={name} title={title} demo={demo} foot={demo ? "No demo payments in this range yet." : "No payments in this range yet."}>—</Tile>;
  return (
    <Tile name={name} title={title} demo={demo} foot={lines.map(line => (
      <p key={line.currency}>Captured {formatMinor(line.capturedMinor, line.currency)} · Refunded {formatMinor(line.refundedMinor, line.currency)} · {line.ordersPaid} paid{demo ? " · no money charged" : ""}</p>
    ))}>
      {lines.map(line => <p key={line.currency}>{formatMinor(line.netMinor, line.currency)}</p>)}
    </Tile>
  );
}
function CountTile({ name, title, counts, pick, quiet }: { name: string; title: string; counts: Loadable<StatusCounts>; pick: (data: StatusCounts) => { real: number; demo: number }; quiet: string }) {
  if (counts.state !== "ready") return <Tile name={name} title={title}>{counts.state === "loading" ? <Loading /> : <Failure message={counts.message} />}</Tile>;
  const { real, demo } = pick(counts.data);
  return (
    <Tile name={name} title={title} foot={demo > 0 ? <span className="flex items-center gap-1">Plus {orders(demo)} <DemoBadge label="DEMO" className="px-1 text-xs" /></span> : quiet}>
      {formatCount(real)}
    </Tile>
  );
}

export function ReportsScreen() {
  const [from, setFrom] = useState(localDate(-29));
  const [to, setTo] = useState(localDate());
  const [summary, setSummary] = useState<Loadable<Summary>>(LOADING);
  const [counts, setCounts] = useState<Loadable<StatusCounts>>(LOADING);
  const [recent, setRecent] = useState<Loadable<RecentOrder[]>>(LOADING);
  const [best, setBest] = useState<Loadable<BestSellers>>(LOADING);
  const [stock, setStock] = useState<Loadable<LowStock[]>>(LOADING);
  const [exportsList, setExports] = useState<ExportJob[] | null>(null);
  const [bestTab, setBestTab] = useState<"real" | "demo">("real");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Review I8: a lost response keeps the action, so a retry never adjusts stock twice.
  const pending = useMemo(() => createPendingActions(createStockAdjuster()), []);
  const [adjust, setAdjust] = useState<Record<string, string>>({});

  // Fix round 1: one request generation at a time. A new load aborts the previous one, and a response
  // from a superseded load is dropped, so an older range's data never lands under newer dates.
  const gate = useMemo(() => createRequestGate(), []);
  /** `reset` (a range change) puts every section back to loading; a reload after an action keeps the frame. */
  const load = useCallback(async (reset = false) => {
    const ticket = gate.begin();
    setError(null);
    if (reset) { setSummary(LOADING); setCounts(LOADING); setRecent(LOADING); setBest(LOADING); setStock(LOADING); }
    const range = `from=${from}&to=${to}&timeZone=${encodeURIComponent(ZONE)}`;
    const get = <T,>(query: string) => fetch(`/api/admin/reports?${query}`, { cache: "no-store", signal: ticket.signal }).then(response => json<T>(response));
    // Each section settles on its own; a failure shows that section's message, never zeros.
    const settle = <T,>(promise: Promise<T>, set: (value: Loadable<T>) => void) =>
      promise.then(
        data => { if (ticket.isCurrent()) set({ state: "ready", data }); },
        (reason: unknown) => { if (ticket.isCurrent()) set({ state: "error", message: reason instanceof Error ? reason.message : String(reason) }); },
      );
    fetch("/api/admin/exports", { cache: "no-store" }).then(r => json<{ items: ExportJob[] }>(r)).then(data => setExports(data.items)).catch(() => setExports(null));
    await Promise.all([
      settle(get<Summary>(`view=summary&${range}`), setSummary),
      settle(get<StatusCounts>(`view=status_counts&${range}`), setCounts),
      settle(get<{ items: RecentOrder[] }>(`view=recent_orders&${range}&limit=10`).then(data => data.items), setRecent),
      settle(get<BestSellers>(`view=best_sellers&${range}&limit=8`), setBest),
      settle(get<{ items: LowStock[] }>("view=low_stock&limit=8").then(data => data.items), setStock),
    ]);
  }, [from, to, gate]);
  useEffect(() => { void load(true); return () => gate.abort(); }, [load, gate]);

  const split = summary.state === "ready" ? splitTotals(summary.data.totals) : { real: [], demo: [], sandbox: [] };
  const chartCurrency = summary.state === "ready" ? currenciesOf(summary.data.totals, summary.data.days)[0] ?? "KZT" : "KZT";
  const points = summary.state === "ready" ? dailyRevenue(summary.data.days, summary.data.from, summary.data.to, chartCurrency) : [];

  async function requestExport(kind: "orders" | "catalog") {
    setBusy(kind); setError(null);
    try {
      await json(await fetch("/api/admin/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kind === "orders" ? { kind, from, to, timeZone: ZONE } : { kind }) }));
      await load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(null); }
  }
  async function stockAction(key: string, item: LowStock, delta: number, note: string) {
    setBusy(item.variantId); setError(null);
    try { await pending.run(key, { variantId: item.variantId, delta, note }); setAdjust(current => ({ ...current, [item.variantId]: "" })); await load(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(null); }
  }
  const restock = (item: LowStock) => stockAction(`restock:${item.variantId}`, item, 10, "Restock from dashboard");
  function correct(item: LowStock) {
    const delta = Number(adjust[item.variantId]);
    if (!Number.isInteger(delta) || delta === 0) { setError("Enter a whole, non-zero quantity (negative to remove stock)"); return; }
    void stockAction(`count:${item.variantId}:${delta}`, item, delta, "Stock count correction from dashboard");
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-black">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Captured payments minus refunds, by day in {ZONE}. Demo revenue is shown apart and never added to revenue.</p>
      </div>
      <div role="group" aria-label="Date range" className="flex flex-wrap items-end gap-2 text-sm">
        {PRESETS.map(days => {
          const selected = from === localDate(-(days - 1)) && to === localDate();
          return <button key={days} type="button" aria-pressed={selected} onClick={() => { setFrom(localDate(-(days - 1))); setTo(localDate()); }} className={cn("border px-2 py-1 text-xs font-bold", selected ? "border-black bg-black text-white" : "border-border hover:border-neutral-500")}>Last {days} days</button>;
        })}
        <label className="ml-2">From <input aria-label="From date" type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} className="ml-1 border border-border px-2 py-1" /></label>
        <label>To <input aria-label="To date" type="date" value={to} min={from} onChange={event => setTo(event.target.value)} className="ml-1 border border-border px-2 py-1" /></label>
      </div>
      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile name="revenue" title="Revenue" lines={split.real} value={summary} />
        <MoneyTile name="demo-revenue" title="Demo revenue" lines={split.demo} value={summary} demo />
        <CountTile name="orders" title="Orders" counts={counts} pick={data => data} quiet="Placed in this range" />
        <CountTile name="awaiting-shipment" title="Awaiting shipment" counts={counts} pick={data => data.awaitingShipment} quiet="Paid, not yet shipped" />
      </section>
      {split.sandbox.length > 0 && (
        <p className="text-xs text-neutral-600">Sandbox payments (test provider, not counted): {split.sandbox.map(line => formatMinor(line.netMinor, line.currency)).join(" · ")}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Daily revenue · ${chartCurrency}`} name="Daily revenue" className="lg:col-span-2">
          <Section value={summary} empty={() => false} emptyText="">
            {() => <DailyRevenueChart points={points} currency={chartCurrency} />}
          </Section>
        </Card>
        <Card title="Orders by status">
          <Section value={counts} empty={data => data.real + data.demo === 0} emptyText="No orders in this date range yet.">
            {data => (
              <div className="space-y-4 text-sm">
                {([["Order", data.orderStatus, ORDER_STATUS_LABELS], ["Fulfillment", data.fulfillmentStatus, FULFILLMENT_STATUS_LABELS]] as const).map(([heading, record, labels]) => (
                  <div key={heading}>
                    <h3 className="mb-1 text-xs font-bold text-muted-foreground">{heading}</h3>
                    <ul className="divide-y divide-neutral-100">{statusRows(record, labels).map(row => (
                      <li key={row.status} className="flex justify-between py-1"><span>{row.label}</span><span className="tabular-nums">{formatCount(row.count)}</span></li>
                    ))}</ul>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Includes {orders(data.demo)} marked demo.</p>
              </div>
            )}
          </Section>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Recent orders" className="lg:col-span-3">
          <Section value={recent} empty={items => items.length === 0} emptyText="No orders in this date range yet.">
            {items => (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground [&>th]:pr-3 [&>th:last-child]:pr-0"><th className="py-1 font-bold">Order</th><th className="font-bold">Placed</th><th className="font-bold">Payment</th><th className="font-bold">Fulfillment</th><th className="text-right font-bold">Total</th></tr></thead>
                <tbody>{items.map(order => (
                  <tr key={order.id} data-order-row={order.id} className="border-t border-neutral-100 align-top [&>td]:pr-3 [&>td:last-child]:pr-0">
                    <td className="py-1.5"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><Link href={`/admin/orders?order=${order.id}`} className="whitespace-nowrap tabular-nums font-semibold underline">{order.number}</Link>{order.demo && <DemoBadge label="DEMO" className="text-[10px]" />}</span></td>
                    <td className="py-1.5 text-neutral-600">{formatDate(order.createdAt)}</td>
                    <td className="py-1.5 capitalize">{words(order.paymentStatus)}</td>
                    <td className="py-1.5 capitalize">{words(order.fulfillmentStatus)}</td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{formatMinor(order.totalMinor, order.currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Section>
        </Card>
        <Card title="Best-sellers" className="lg:col-span-2">
          <div role="tablist" aria-label="Best-sellers" className="mb-3 flex text-xs">
            {(["real", "demo"] as const).map(tab => (
              <button key={tab} type="button" role="tab" id={`best-${tab}`} aria-selected={bestTab === tab} aria-controls="best-panel" onClick={() => setBestTab(tab)}
                className={cn("border px-3 py-1 font-bold", bestTab === tab ? "border-black bg-black text-white" : "border-border text-neutral-600 hover:border-neutral-500")}>
                {tab === "real" ? "Real" : "Demo"}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="best-panel" aria-labelledby={`best-${bestTab}`} data-best-tab={bestTab}>
            <Section value={best} empty={data => data[bestTab].length === 0} emptyText={bestTab === "real" ? "No sales in this date range yet." : "No demo sales in this date range yet."}>
              {data => (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-bold">Product</th><th className="px-3 text-right font-bold">Units</th><th className="whitespace-nowrap text-right font-bold">Item revenue</th></tr></thead>
                  <tbody>{data[bestTab].map(item => (
                    <tr key={item.variantId + item.currency} className="border-t border-neutral-100">
                      <td className="py-1.5"><span className="flex flex-wrap items-center gap-2">{item.name}{item.sku && <span className="tabular-nums text-xs text-muted-foreground">{item.sku}</span>}{bestTab === "demo" && <DemoBadge label="DEMO" className="text-[10px]" />}</span></td>
                      <td className="px-3 text-right tabular-nums">{formatCount(item.units)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatMinor(item.revenueMinor, item.currency)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Section>
            <p className="mt-2 text-xs text-muted-foreground">Item revenue is net of refunds, incl. tax, excl. shipping.</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By day" name="Revenue by day">
          <Section value={summary} empty={data => data.days.length === 0} emptyText="No payments in this date range yet.">
            {data => (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-bold">Date</th><th className="font-bold">Captured</th><th className="font-bold">Refunded</th><th className="font-bold">Net</th></tr></thead>
                <tbody>{data.days.map(day => (
                  <tr key={day.date + day.environment + day.currency} className="border-t border-neutral-100">
                    <td className="py-1"><span className="flex items-center gap-2 tabular-nums">{day.date}{day.environment === "demo" ? <DemoBadge label="DEMO" className="text-[10px]" /> : day.environment === "sandbox" ? <span className="text-xs text-muted-foreground">sandbox</span> : null}</span></td>
                    <td className="tabular-nums">{formatMinor(day.capturedMinor, day.currency)}</td><td className="tabular-nums">{formatMinor(day.refundedMinor, day.currency)}</td><td className="tabular-nums">{formatMinor(day.netMinor, day.currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Section>
        </Card>
        <div className="space-y-6">
          <Card title="Low stock">
            <Section value={stock} empty={items => items.length === 0} emptyText="No stock records yet.">
              {items => (
                <ul className="space-y-1 text-sm">{items.map(item => (
                  <li key={item.variantId} className="flex items-center justify-between gap-2">
                    <span>{item.name}{item.sku ? <span className="ml-1 tabular-nums text-xs text-muted-foreground">{item.sku}</span> : null}</span>
                    <span className="flex items-center gap-2"><span className="font-bold tabular-nums">{formatCount(item.available)}</span>
                      <button type="button" disabled={busy !== null} onClick={() => void restock(item)} className="border border-black px-2 py-0.5 text-xs font-bold capitalize disabled:opacity-50">{pending.isPending(`restock:${item.variantId}`) ? "Retry restock" : "Restock +10"}</button>
                      <input aria-label={`Stock correction for ${item.name}`} inputMode="numeric" placeholder="±qty" className="w-16 border border-border px-1 text-xs" value={adjust[item.variantId] ?? ""} onChange={event => setAdjust(current => ({ ...current, [item.variantId]: event.target.value }))} />
                      <button type="button" disabled={busy !== null || !(adjust[item.variantId] ?? "").trim()} onClick={() => correct(item)} className="border border-neutral-400 px-2 py-0.5 text-xs font-bold capitalize disabled:opacity-50">Apply</button></span>
                  </li>
                ))}</ul>
              )}
            </Section>
          </Card>
          <Card title="Exports">
            {exportsList === null ? <Muted>Exports need the export permission.</Muted> : (
              <>
                <div className="mb-3 flex gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void requestExport("orders")} className="border border-black px-2 py-1 text-xs font-bold disabled:opacity-50">Export orders (period)</button>
                  <button type="button" disabled={busy !== null} onClick={() => void requestExport("catalog")} className="border border-black px-2 py-1 text-xs font-bold disabled:opacity-50">Export catalog</button>
                </div>
                <ul className="space-y-1 text-xs">{exportsList.map(job => (
                  <li key={job.id} className="flex justify-between gap-2">
                    <span>{job.kind} · {job.status}</span>
                    {job.status === "completed" && new Date(job.expiresAt) > new Date() ? <a className="underline" href={`/api/admin/exports?id=${job.id}`}>Download CSV</a> : <span className="text-neutral-500">expires {new Date(job.expiresAt).toLocaleString("en-GB")}</span>}
                  </li>
                ))}</ul>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ReportsScreen;
