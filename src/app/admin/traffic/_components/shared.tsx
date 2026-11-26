"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Owner 2026-11-25: pieces shared by Admin ▸ Traffic and Admin ▸ Campaign links (same look as the dashboard).

export const ZONE = "Asia/Almaty";
export type Loadable<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };
export const LOADING = { state: "loading" } as const;
export const localDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: ZONE });
export const count = (n: number) => n.toLocaleString("en-US");

export async function getJSON<T>(query: string): Promise<T> {
  const response = await fetch(`/api/admin/traffic?${query}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export function Card({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section aria-label={title} className={cn("min-w-0 overflow-x-auto border border-garmin-control p-4", className)}>
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-garmin-rule pb-3.5">
        <h2 className="font-sans text-sm font-medium tracking-[0.64px] text-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export const Muted = ({ children }: { children: ReactNode }) => <p data-empty className="text-sm text-muted-foreground">{children}</p>;
export const Failure = ({ message }: { message: string }) => <p role="alert" className="border border-garmin-error p-2 text-sm text-garmin-error">{message}</p>;
export const Loading = () => <span className="text-sm text-muted-foreground">Loading…</span>;
export function Section<T>({ value, empty, emptyText, children }: { value: Loadable<T>; empty: (data: T) => boolean; emptyText: string; children: (data: T) => ReactNode }) {
  if (value.state === "loading") return <Loading />;
  if (value.state === "error") return <Failure message={value.message} />;
  return empty(value.data) ? <Muted>{emptyText}</Muted> : <>{children(value.data)}</>;
}

const PRESETS = [{ days: 1, label: "Today", short: "Today" }, { days: 7, label: "Last 7 days", short: "7 days" }, { days: 30, label: "Last 30 days", short: "30 days" }, { days: 90, label: "Last 90 days", short: "90 days" }] as const;
const input = "h-10 border border-garmin-control bg-white px-3 text-sm font-normal tabular-nums text-black focus:border-black focus:outline-none";
const compactInput = "h-8 border border-garmin-control bg-white px-2 text-sm font-normal tabular-nums text-black focus:border-black focus:outline-none";

/** The date range (local days in Asia/Almaty), 30 days by default. */
export function useRange() {
  const [from, setFrom] = useState(() => localDate(-29));
  const [to, setTo] = useState(() => localDate());
  return { from, to, setFrom, setTo };
}
/** `compact`: short preset labels and a slim From–To pair, for a header row (Admin ▸ Traffic). */
export function RangePicker({ from, to, setFrom, setTo, compact = false }: ReturnType<typeof useRange> & { compact?: boolean }) {
  const presets = PRESETS.map(({ days, label, short }) => {
    const selected = from === localDate(-(days - 1)) && to === localDate();
    return <button key={days} type="button" aria-pressed={selected} aria-label={compact ? label : undefined} onClick={() => { setFrom(localDate(-(days - 1))); setTo(localDate()); }} className={cn("g-btn g-btn--sm", selected ? "g-btn--black" : "g-btn--secondary")}>{compact ? short : label}</button>;
  });
  if (compact) return (
    <div role="group" aria-label="Date range" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <div className="flex flex-wrap gap-1.5">{presets}</div>
      <div className="flex items-center gap-1.5">
        <input aria-label="From date" type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} className={compactInput} />
        <span aria-hidden className="text-muted-foreground">–</span>
        <input aria-label="To date" type="date" value={to} min={from} onChange={event => event.target.value && setTo(event.target.value)} className={compactInput} />
      </div>
    </div>
  );
  return (
    <div role="group" aria-label="Date range" className="flex flex-wrap items-end gap-2 text-sm">
      {presets}
      <label className="ml-2 flex items-center gap-2 font-bold">From <input aria-label="From date" type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} className={input} /></label>
      <label className="flex items-center gap-2 font-bold">To <input aria-label="To date" type="date" value={to} min={from} onChange={event => event.target.value && setTo(event.target.value)} className={input} /></label>
    </div>
  );
}

/** A horizontal magnitude bar (single hue, 4px rounded data end) behind a share of the largest value. */
export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className="h-2.5 w-full min-w-16 bg-transparent" role="img" aria-label={label}>
      <div className="h-full rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${width}%` }} />
    </div>
  );
}
