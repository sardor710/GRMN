"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPendingActions, createStockAdjuster } from "@/lib/admin/inventory-client";

// Task 18B: the PostgreSQL dashboard. Totals come from SQL (captured minus refunded, per currency,
// in the chosen time zone); no order or customer lists are loaded into the browser.
// D03a: demo purchases are captured in the sandbox environment. They are shown as their own
// "Demo (sandbox)" series beside live money, never added to it, and left out of order exports
// unless "Include demo orders" is ticked.

const isDemo = (environment: string) => environment !== "live";
const DemoBadge = () => <span className="ml-1 border border-amber-400 bg-amber-50 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-amber-900">Demo</span>;

interface Total { currency: string; environment: string; label: string; capturedMinor: string; refundedMinor: string; netMinor: string; ordersPaid: number }
interface Day { date: string; currency: string; environment: string; label: string; capturedMinor: string; refundedMinor: string; netMinor: string }
interface Summary { from: string; to: string; timeZone: string; totals: Total[]; days: Day[] }
interface ExportJob { id: string; kind: string; status: string; createdAt: string; expiresAt: string }
interface LowStock { variantId: string; productKey: string; name: string; sku: string | null; available: number }

const ZONE = "Asia/Almaty";
const localDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: ZONE });
const money = (minor: string, currency: string) => `${(Number(minor) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export default function ReportsScreen() {
  const [from, setFrom] = useState(localDate(-29));
  const [to, setTo] = useState(localDate());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [exportsList, setExports] = useState<ExportJob[] | null>(null);
  const [stock, setStock] = useState<LowStock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [includeDemo, setIncludeDemo] = useState(false);
  // Review I8: a lost response keeps the action, so a retry never adjusts stock twice.
  const pending = useMemo(() => createPendingActions(createStockAdjuster()), []);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await json<Summary>(await fetch(`/api/admin/reports?view=summary&from=${from}&to=${to}&timeZone=${encodeURIComponent(ZONE)}`, { cache: "no-store" })));
    } catch (reason) { setError((reason as Error).message); }
    fetch("/api/admin/reports?view=low_stock&limit=8", { cache: "no-store" }).then(r => json<{ items: LowStock[] }>(r)).then(data => setStock(data.items)).catch(() => setStock([]));
    fetch("/api/admin/exports", { cache: "no-store" }).then(r => json<{ items: ExportJob[] }>(r)).then(data => setExports(data.items)).catch(() => setExports(null));
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  async function requestExport(kind: "orders" | "catalog") {
    setBusy(kind); setError(null);
    try {
      await json(await fetch("/api/admin/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kind === "orders" ? { kind, from, to, timeZone: ZONE, ...(includeDemo ? { includeSandbox: true } : {}) } : { kind }) }));
      await load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(null); }
  }
  async function stockAction(key: string, item: LowStock, delta: number, note: string) {
    setBusy(item.variantId); setError(null);
    try { await pending.run(key, { variantId: item.variantId, delta, note }); setCounts(current => ({ ...current, [item.variantId]: "" })); await load(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(null); }
  }
  const restock = (item: LowStock) => stockAction(`restock:${item.variantId}`, item, 10, "Restock from dashboard");
  function correct(item: LowStock) {
    const delta = Number(counts[item.variantId]);
    if (!Number.isInteger(delta) || delta === 0) { setError("Enter a whole, non-zero quantity (negative to remove stock)"); return; }
    void stockAction(`count:${item.variantId}:${delta}`, item, delta, "Stock count correction from dashboard");
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Dashboard</h1>
          <p className="text-sm text-neutral-500">Captured payments minus refunds, by day in {ZONE}. Live and Demo (sandbox) purchases are separate series and are never added together.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label>From <input aria-label="From date" type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} className="ml-1 border border-neutral-300 px-2 py-1" /></label>
          <label>To <input aria-label="To date" type="date" value={to} min={from} onChange={event => setTo(event.target.value)} className="ml-1 border border-neutral-300 px-2 py-1" /></label>
        </div>
      </div>
      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <section aria-label="Revenue totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary === null ? <p className="text-sm text-neutral-500">Loading totals…</p> : summary.totals.length === 0 ? <p className="text-sm text-neutral-500">No payments in this period.</p> : summary.totals.map(total => (
          <div key={total.environment + total.currency} data-series={total.label} className={`border p-4 ${isDemo(total.environment) ? "border-amber-300 bg-amber-50/40" : "border-neutral-200"}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Net revenue · {total.currency} · {total.label}{isDemo(total.environment) && <DemoBadge />}</p>
            <p className="mt-1 text-2xl font-bold">{money(total.netMinor, total.currency)}</p>
            <p className="mt-1 text-xs text-neutral-600">Captured {money(total.capturedMinor, total.currency)} · Refunded {money(total.refundedMinor, total.currency)} · {total.ordersPaid} paid orders</p>
          </div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Daily revenue" className="border border-neutral-200 p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">By day</h2>
          <table className="w-full text-sm [&_td]:pr-3 [&_th]:pr-3">
            <thead><tr className="text-left text-xs uppercase text-neutral-500"><th>Date</th><th>Series</th><th>Captured</th><th>Refunded</th><th>Net</th></tr></thead>
            <tbody>{(summary?.days ?? []).map(day => (
              <tr key={day.date + day.environment + day.currency} className="border-t border-neutral-100"><td className="py-1 font-mono">{day.date}</td><td className="text-xs">{isDemo(day.environment) ? <DemoBadge /> : "Live"}</td><td>{money(day.capturedMinor, day.currency)}</td><td>{money(day.refundedMinor, day.currency)}</td><td>{money(day.netMinor, day.currency)}</td></tr>
            ))}</tbody>
          </table>
        </section>
        <div className="space-y-6">
          <section aria-label="Low stock" className="border border-neutral-200 p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">Low stock</h2>
            {stock === null ? <p className="text-sm text-neutral-500">Loading…</p> : (
              <ul className="space-y-1 text-sm">{stock.map(item => (
                <li key={item.variantId} className="flex items-center justify-between gap-2">
                  <span>{item.name}{item.sku ? <span className="ml-1 font-mono text-xs text-neutral-500">{item.sku}</span> : null}</span>
                  <span className="flex items-center gap-2"><span className="font-mono">{item.available}</span>
                    <button type="button" disabled={busy !== null} onClick={() => void restock(item)} className="border border-black px-2 py-0.5 text-xs font-bold uppercase disabled:opacity-50">{pending.isPending(`restock:${item.variantId}`) ? "Retry restock" : "Restock +10"}</button>
                    <input aria-label={`Stock correction for ${item.name}`} inputMode="numeric" placeholder="±qty" className="w-16 border border-neutral-300 px-1 text-xs" value={counts[item.variantId] ?? ""} onChange={event => setCounts(current => ({ ...current, [item.variantId]: event.target.value }))} />
                    <button type="button" disabled={busy !== null || !(counts[item.variantId] ?? "").trim()} onClick={() => correct(item)} className="border border-neutral-400 px-2 py-0.5 text-xs font-bold uppercase disabled:opacity-50">Apply</button></span>
                </li>
              ))}</ul>
            )}
          </section>
          <section aria-label="Exports" className="border border-neutral-200 p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-600">Exports</h2>
            {exportsList === null ? <p className="text-sm text-neutral-500">Exports need the export permission.</p> : (
              <>
                <label className="mb-2 flex items-center gap-2 text-xs text-neutral-700">
                  <input type="checkbox" checked={includeDemo} onChange={event => setIncludeDemo(event.target.checked)} />
                  Include demo (sandbox) orders in the orders export
                </label>
                <div className="mb-3 flex gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void requestExport("orders")} className="border border-black px-2 py-1 text-xs font-bold uppercase disabled:opacity-50">Export orders (period)</button>
                  <button type="button" disabled={busy !== null} onClick={() => void requestExport("catalog")} className="border border-black px-2 py-1 text-xs font-bold uppercase disabled:opacity-50">Export catalog</button>
                </div>
                <ul className="space-y-1 text-xs">{exportsList.map(job => (
                  <li key={job.id} className="flex justify-between gap-2">
                    <span>{job.kind} · {job.status}</span>
                    {job.status === "completed" && new Date(job.expiresAt) > new Date() ? <a className="underline" href={`/api/admin/exports?id=${job.id}`}>Download CSV</a> : <span className="text-neutral-500">expires {new Date(job.expiresAt).toLocaleString("en-GB")}</span>}
                  </li>
                ))}</ul>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
