"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HourWeekdayGrid, VisitsChart, type Cell, type Day } from "./charts";
import { Bar, LOADING, RangePicker, Section, count, getJSON, useRange, ZONE, type Loadable } from "./shared";

// Owner 2026-11-25: Admin ▸ Traffic. Which source brings the most clicks (a click = a visit's landing),
// opened up by format (post, story, ad…) and campaign; campaigns add up to their platform. Then visits per
// day, the busiest hours and weekdays, the most viewed products and the devices visitors use.
// Owner 2026-11-26 (layout "A"): one header row (title, range, Campaign links), a compact 4-number strip, then
// three labelled groups (where visitors come from / when they visit / what they look at) of half-height cards,
// two columns from lg (Sources + Devices, and the 1–5 / 6–10 product halves, from xl: beside the 255px admin
// sidebar, at 1024 a half is too narrow for their rows). An empty card is its title and one muted line.

interface Summary { clicks: number; visitors: number; pageViews: number }
interface Medium { medium: string | null; clicks: number; campaigns: { campaign: string | null; clicks: number }[] }
interface Platform { platform: string; clicks: number; visitors: number; mediums: Medium[] }
interface Products { products: { productId: string; name: string | null; views: number; visitors: number }[] }
interface Devices { os: { os: string; clicks: number }[]; deviceTypes: { deviceType: string; clicks: number }[] }

const NONE = "No visits in this range.";
const TOP_PRODUCTS = 10;
const pct = (value: number, total: number) => total > 0 ? `${((value / total) * 100).toFixed(value / total < 0.1 ? 1 : 0)}%` : "—";
const mediumLabel = (medium: string | null) => medium === null ? "—" : medium === "ad" ? "Ads" : medium === "organic" ? "Search" : medium === "referral" ? "Untagged link" : medium === "link" ? "Tagged link" : medium[0].toUpperCase() + medium.slice(1);
const DEVICE_LABEL: Record<string, string> = { mobile: "Phone", tablet: "Tablet", desktop: "Computer" };

function useLoad<T>(query: string): Loadable<T> {
  const [value, setValue] = useState<{ query: string; result: Loadable<T> }>({ query: "", result: LOADING });
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
    getJSON<T>(query).then(
      data => { if (latest.current === query) setValue({ query, result: { state: "ready", data } }); },
      (error: Error) => { if (latest.current === query) setValue({ query, result: { state: "error", message: error.message } }); });
  }, [query]);
  return value.query === query ? value.result : LOADING;
}
const isEmpty = <T,>(value: Loadable<T>, empty: (data: T) => boolean) => value.state === "ready" && empty(value.data);

function Tile({ title, value, foot }: { title: string; value: Loadable<string>; foot: string }) {
  return (
    <div data-tile={title} className="min-w-0 border border-garmin-control px-3 py-2.5">
      <p className="truncate text-xs font-medium tracking-[0.4px] text-neutral-600">{title}</p>
      <div data-tile-value className="mt-0.5 text-xl font-bold leading-7 text-black">
        {value.state === "ready" ? value.data : value.state === "loading" ? <span className="text-sm font-normal text-muted-foreground">Loading…</span> : "—"}
      </div>
      <p className="truncate text-xs text-muted-foreground">{foot}</p>
    </div>
  );
}

/** A small uppercase group label with a hairline to the right. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-garmin-rule" />
      </div>
      {children}
    </section>
  );
}

/** A card: short title, an optional one-line hint (hidden when the card is empty), then the content. */
function Panel({ title, label, hint, empty = false, className, children }: { title: string; label?: string; hint?: ReactNode; empty?: boolean; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label ?? title} className={cn("min-w-0 border border-garmin-control p-3 sm:p-4", className)}>
      <div className={empty ? "mb-1" : "mb-3"}>
        <h3 className="font-sans text-sm font-bold text-black">{title}</h3>
        {hint && !empty && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SourcesTable({ platforms }: { platforms: Platform[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const total = platforms.reduce((sum, p) => sum + p.clicks, 0), max = platforms[0]?.clicks ?? 0;
  const toggle = (key: string) => setOpen(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const bar = "hidden w-[34%] py-1.5 pr-3 sm:table-cell";
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-garmin-rule text-left text-xs text-neutral-600">
          <th className="py-1.5 font-medium">Source</th><th className={cn(bar, "font-medium")}><span className="sr-only">Share bar</span></th>
          <th className="py-1.5 pl-2 text-right font-medium">Clicks</th><th className="py-1.5 pl-2 text-right font-medium">Share</th><th className="py-1.5 pl-2 text-right font-medium">Visitors</th>
        </tr>
      </thead>
      <tbody>
        {platforms.map(p => {
          const pOpen = open.has(p.platform), expandable = p.mediums.some(m => m.medium !== null);
          return (
            <Fragment key={p.platform}>
              <tr data-platform={p.platform} className="border-b border-garmin-rule">
                <td className="py-1.5">
                  {expandable
                    ? <button type="button" aria-expanded={pOpen} onClick={() => toggle(p.platform)} className="flex items-center gap-1.5 text-left font-bold hover:underline"><span aria-hidden className={cn("inline-block w-3 transition-transform", pOpen && "rotate-90")}>›</span>{p.platform}</button>
                    : <span className="pl-[18px] font-bold">{p.platform}</span>}
                </td>
                <td className={bar}><Bar value={p.clicks} max={max} label={`${p.platform}: ${pct(p.clicks, total)} of clicks`} /></td>
                <td className="py-1.5 pl-2 text-right font-bold">{count(p.clicks)}</td><td className="py-1.5 pl-2 text-right">{pct(p.clicks, total)}</td><td className="py-1.5 pl-2 text-right">{count(p.visitors)}</td>
              </tr>
              {pOpen && p.mediums.map(m => {
                const key = `${p.platform}\u0000${m.medium}`, mOpen = open.has(key), tagged = m.campaigns.some(c => c.campaign !== null);
                return (
                  <Fragment key={key}>
                    <tr data-medium={m.medium ?? ""} className="border-b border-garmin-rule bg-[#fafafa]">
                      <td className="py-1 pl-5">
                        {tagged
                          ? <button type="button" aria-expanded={mOpen} onClick={() => toggle(key)} className="flex items-center gap-1.5 text-left hover:underline"><span aria-hidden className={cn("inline-block w-3 transition-transform", mOpen && "rotate-90")}>›</span>{mediumLabel(m.medium)}</button>
                          : <span className="pl-[18px]">{mediumLabel(m.medium)}</span>}
                      </td>
                      <td className={cn(bar, "py-1")}><Bar value={m.clicks} max={max} label={`${mediumLabel(m.medium)}: ${pct(m.clicks, p.clicks)} of ${p.platform}`} /></td>
                      <td className="py-1 pl-2 text-right">{count(m.clicks)}</td><td className="py-1 pl-2 text-right text-muted-foreground">{pct(m.clicks, p.clicks)}<span className="sr-only"> of {p.platform}</span></td><td />
                    </tr>
                    {mOpen && m.campaigns.map(c => (
                      <tr key={c.campaign ?? "untagged"} data-campaign={c.campaign ?? ""} className="border-b border-garmin-rule bg-[#f4f4f4]">
                        <td className="py-1 pl-12 [overflow-wrap:anywhere]">{c.campaign ?? <span className="text-muted-foreground">No campaign</span>}</td>
                        <td className={cn(bar, "py-1")}><Bar value={c.clicks} max={max} label={`${c.campaign ?? "No campaign"}: ${count(c.clicks)} clicks`} /></td>
                        <td className="py-1 pl-2 text-right">{count(c.clicks)}</td><td className="py-1 pl-2 text-right text-muted-foreground">{pct(c.clicks, m.clicks)}</td><td />
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
      </tbody>
      <tfoot><tr><td className="pt-1.5 font-bold">Total</td><td className="hidden sm:table-cell" /><td className="pt-1.5 pl-2 text-right font-bold">{count(total)}</td><td className="pt-1.5 pl-2 text-right">100%</td><td /></tr></tfoot>
    </table>
  );
}

function ShareList({ title, rows }: { title: string; rows: { label: string; clicks: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.clicks, 0), max = rows[0]?.clicks ?? 0;
  return (
    <div>
      <p className="mb-1.5 text-xs text-neutral-600">{title}</p>
      <ul className="space-y-1.5 text-sm tabular-nums">
        {rows.map(row => (
          <li key={row.label} data-device={row.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem_3rem] items-center gap-2">
            <span className="truncate">{row.label}</span><Bar value={row.clicks} max={max} label={`${row.label}: ${pct(row.clicks, total)}`} />
            <span className="text-right font-bold">{count(row.clicks)}</span><span className="text-right text-muted-foreground">{pct(row.clicks, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ProductRow = Products["products"][number];
/** Ranked products; above 5 rows they split into two halves (1–5 | 6–10) side by side from xl, one bar scale. */
function TopProducts({ rows }: { rows: ProductRow[] }) {
  const max = rows[0]?.views ?? 0;
  const halves = rows.length > 5 ? [rows.slice(0, 5), rows.slice(5)] : [rows];
  return (
    <div className={cn("grid gap-x-6", halves.length > 1 && "xl:grid-cols-2")}>
      {halves.map((half, part) => (
        // Fixed column widths keep the two halves aligned when they stack below xl.
        <table key={part} className="w-full table-fixed text-sm tabular-nums">
          <colgroup><col className="w-7" /><col /><col className="hidden w-[28%] sm:table-column" /><col className="w-14" /><col className="w-16" /></colgroup>
          <thead className={cn(part > 0 && "max-xl:sr-only")}>
            <tr className="border-b border-garmin-rule text-left text-xs text-neutral-600">
              <th className="py-1.5 font-medium"><span className="sr-only">Rank</span><span aria-hidden>#</span></th><th className="py-1.5 font-medium">Product</th>
              <th className="hidden py-1.5 pr-3 sm:table-cell"><span className="sr-only">Views bar</span></th>
              <th className="py-1.5 pl-2 text-right font-medium">Views</th><th className="py-1.5 pl-2 text-right font-medium">Visitors</th>
            </tr>
          </thead>
          <tbody>
            {half.map((p, index) => (
              <tr key={p.productId} data-product={p.productId} className={cn("border-b border-garmin-rule", part === halves.length - 1 ? "last:border-0" : "xl:last:border-0")}>
                <td className="py-1.5 text-muted-foreground">{part * 5 + index + 1}</td>
                <td className="py-1.5">{p.name ?? <span className="text-muted-foreground">Deleted product</span>}</td>
                <td className="hidden py-1.5 pr-3 sm:table-cell"><Bar value={p.views} max={max} label={`${p.name ?? "Deleted product"}: ${count(p.views)} views`} /></td>
                <td className="py-1.5 pl-2 text-right font-bold">{count(p.views)}</td><td className="py-1.5 pl-2 text-right">{count(p.visitors)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export function TrafficScreen() {
  const range = useRange();
  const q = `from=${range.from}&to=${range.to}`;
  const summary = useLoad<Summary>(`view=summary&${q}`);
  const sources = useLoad<{ platforms: Platform[] }>(`view=sources&${q}`);
  const timeline = useLoad<{ days: Day[] }>(`view=timeline&${q}`);
  const heatmap = useLoad<{ cells: Cell[] }>(`view=heatmap&${q}`);
  const products = useLoad<Products>(`view=products&${q}`);
  const devices = useLoad<Devices>(`view=devices&${q}`);
  const pick = (format: (data: Summary) => string): Loadable<string> => summary.state === "ready" ? { state: "ready", data: format(summary.data) } : summary;
  const noSources = (data: { platforms: Platform[] }) => data.platforms.length === 0;
  const noDays = (data: { days: Day[] }) => data.days.every(day => day.clicks === 0 && day.pageViews === 0);
  const noCells = (data: { cells: Cell[] }) => data.cells.length === 0;
  const noProducts = (data: Products) => data.products.length === 0;
  const noDevices = (data: Devices) => data.os.length === 0;
  const nothing = isEmpty(summary, data => data.clicks === 0 && data.pageViews === 0);
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="g-heading g-h2 mr-auto text-black">Traffic</h1>
          <RangePicker compact {...range} />
          <Link href="/admin/traffic/links" className="g-btn g-btn--sm g-btn--secondary">Campaign links</Link>
        </div>
        <p className="text-xs text-muted-foreground">Times in {ZONE}. Staff browsing is not counted.</p>
      </div>

      <section aria-label="Totals" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Tile title="Clicks" value={pick(data => count(data.clicks))} foot="Visits that landed here" />
        <Tile title="Visitors" value={pick(data => count(data.visitors))} foot="Different browsers" />
        <Tile title="Page views" value={pick(data => count(data.pageViews))} foot="Every page opened" />
        <Tile title="Pages / visitor" value={pick(data => data.visitors > 0 ? (data.pageViews / data.visitors).toFixed(1) : "—")} foot="Average per visitor" />
      </section>
      {nothing && <p data-empty className="text-sm text-muted-foreground">No visits in this range yet. Counting started the day tracking went live; try a longer range.</p>}

      <Group title="Where visitors come from">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <Panel title="Sources" empty={isEmpty(sources, noSources)}
            hint={<>Open a source for its formats and campaigns. Tag links in <Link href="/admin/traffic/links" className="underline">Campaign links</Link>.</>}>
            <Section value={sources} empty={noSources} emptyText={NONE}>{data => <SourcesTable platforms={data.platforms} />}</Section>
          </Panel>
          <Panel title="Devices" hint="Share of clicks by device and system" empty={isEmpty(devices, noDevices)}>
            <Section value={devices} empty={noDevices} emptyText={NONE}>
              {data => (
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-1">
                  <ShareList title="Device" rows={data.deviceTypes.map(row => ({ label: DEVICE_LABEL[row.deviceType] ?? row.deviceType, clicks: row.clicks }))} />
                  <ShareList title="System" rows={data.os.map(row => ({ label: row.os, clicks: row.clicks }))} />
                </div>
              )}
            </Section>
          </Panel>
        </div>
      </Group>

      <Group title="When they visit">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Visits by day" hint="Clicks or page views per day" empty={isEmpty(timeline, noDays)}>
            <Section value={timeline} empty={noDays} emptyText={NONE}>{data => <VisitsChart days={data.days} />}</Section>
          </Panel>
          <Panel title="Busiest hours" label="Busiest hours and weekdays" hint="Page views by weekday and hour; darker is busier" empty={isEmpty(heatmap, noCells)}>
            <Section value={heatmap} empty={noCells} emptyText={NONE}>{data => <HourWeekdayGrid cells={data.cells} />}</Section>
          </Panel>
        </div>
      </Group>

      <Group title="What they look at">
        <Panel title={`Top ${TOP_PRODUCTS} products`} hint="Most viewed product pages" empty={isEmpty(products, noProducts)}>
          <Section value={products} empty={noProducts} emptyText="No product pages viewed in this range.">
            {data => <TopProducts rows={data.products.slice(0, TOP_PRODUCTS)} />}
          </Section>
        </Panel>
      </Group>
    </div>
  );
}
