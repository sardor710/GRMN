"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HourWeekdayGrid, VisitsChart, type Cell, type Day } from "./charts";
import { Bar, Card, LOADING, RangePicker, Section, count, getJSON, useRange, ZONE, type Loadable } from "./shared";

// Owner 2026-11-25: Admin ▸ Traffic. Which source brings the most clicks (a click = a visit's landing),
// opened up by format (post, story, ad…) and campaign; campaigns add up to their platform. Then visits per
// day, the busiest hours and weekdays, the most viewed products and the devices visitors use.

interface Summary { clicks: number; visitors: number; pageViews: number }
interface Medium { medium: string | null; clicks: number; campaigns: { campaign: string | null; clicks: number }[] }
interface Platform { platform: string; clicks: number; visitors: number; mediums: Medium[] }
interface Products { products: { productId: string; name: string | null; views: number; visitors: number }[] }
interface Devices { os: { os: string; clicks: number }[]; deviceTypes: { deviceType: string; clicks: number }[] }

const EMPTY = "No visits in this range yet. Counting started the day tracking went live.";
const pct = (value: number, total: number) => total > 0 ? `${((value / total) * 100).toFixed(value / total < 0.1 ? 1 : 0)}%` : "—";
const mediumLabel = (medium: string | null) => medium === null ? "—" : medium === "ad" ? "Ads" : medium === "organic" ? "Search" : medium === "referral" ? "Untagged link" : medium[0].toUpperCase() + medium.slice(1);
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

function Tile({ title, value, foot }: { title: string; value: Loadable<number>; foot: string }) {
  return (
    <div data-tile={title} className="min-w-0 border border-garmin-control p-4">
      <p className="text-sm font-medium tracking-[0.64px] text-black">{title}</p>
      <div data-tile-value className="mt-2 text-2xl font-bold leading-[30px] tabular-nums text-black">
        {value.state === "ready" ? count(value.data) : value.state === "loading" ? <span className="text-sm font-normal text-muted-foreground">Loading…</span> : "—"}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{foot}</p>
    </div>
  );
}

function SourcesTable({ platforms }: { platforms: Platform[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const total = platforms.reduce((sum, p) => sum + p.clicks, 0), max = platforms[0]?.clicks ?? 0;
  const toggle = (key: string) => setOpen(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return (
    <table className="w-full min-w-[560px] text-sm tabular-nums">
      <thead>
        <tr className="border-b border-garmin-rule text-left">
          <th className="py-2 font-medium">Source</th><th className="w-[30%] py-2 font-medium"><span className="sr-only">Share bar</span></th>
          <th className="py-2 text-right font-medium">Clicks</th><th className="py-2 text-right font-medium">Share</th><th className="py-2 text-right font-medium">Visitors</th>
        </tr>
      </thead>
      <tbody>
        {platforms.map(p => {
          const pOpen = open.has(p.platform), expandable = p.mediums.some(m => m.medium !== null);
          return (
            <Fragment key={p.platform}>
              <tr data-platform={p.platform} className="border-b border-garmin-rule">
                <td className="py-2">
                  {expandable
                    ? <button type="button" aria-expanded={pOpen} onClick={() => toggle(p.platform)} className="flex items-center gap-1.5 font-bold hover:underline"><span aria-hidden className={cn("inline-block w-3 transition-transform", pOpen && "rotate-90")}>›</span>{p.platform}</button>
                    : <span className="pl-[18px] font-bold">{p.platform}</span>}
                </td>
                <td className="py-2 pr-3"><Bar value={p.clicks} max={max} label={`${p.platform}: ${pct(p.clicks, total)} of clicks`} /></td>
                <td className="py-2 text-right font-bold">{count(p.clicks)}</td><td className="py-2 text-right">{pct(p.clicks, total)}</td><td className="py-2 text-right">{count(p.visitors)}</td>
              </tr>
              {pOpen && p.mediums.map(m => {
                const key = `${p.platform}\u0000${m.medium}`, mOpen = open.has(key), tagged = m.campaigns.some(c => c.campaign !== null);
                return (
                  <Fragment key={key}>
                    <tr data-medium={m.medium ?? ""} className="border-b border-garmin-rule bg-[#fafafa]">
                      <td className="py-1.5 pl-6">
                        {tagged
                          ? <button type="button" aria-expanded={mOpen} onClick={() => toggle(key)} className="flex items-center gap-1.5 hover:underline"><span aria-hidden className={cn("inline-block w-3 transition-transform", mOpen && "rotate-90")}>›</span>{mediumLabel(m.medium)}</button>
                          : <span className="pl-[18px]">{mediumLabel(m.medium)}</span>}
                      </td>
                      <td className="py-1.5 pr-3"><Bar value={m.clicks} max={max} label={`${mediumLabel(m.medium)}: ${pct(m.clicks, p.clicks)} of ${p.platform}`} /></td>
                      <td className="py-1.5 text-right">{count(m.clicks)}</td><td className="py-1.5 text-right text-muted-foreground">{pct(m.clicks, p.clicks)} of {p.platform}</td><td />
                    </tr>
                    {mOpen && m.campaigns.map(c => (
                      <tr key={c.campaign ?? "untagged"} data-campaign={c.campaign ?? ""} className="border-b border-garmin-rule bg-[#f4f4f4]">
                        <td className="py-1.5 pl-14">{c.campaign ?? <span className="text-muted-foreground">No campaign</span>}</td>
                        <td className="py-1.5 pr-3"><Bar value={c.clicks} max={max} label={`${c.campaign ?? "No campaign"}: ${count(c.clicks)} clicks`} /></td>
                        <td className="py-1.5 text-right">{count(c.clicks)}</td><td className="py-1.5 text-right text-muted-foreground">{pct(c.clicks, m.clicks)}</td><td />
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
      </tbody>
      <tfoot><tr><td className="pt-2 font-bold">Total</td><td /><td className="pt-2 text-right font-bold">{count(total)}</td><td className="pt-2 text-right">100%</td><td /></tr></tfoot>
    </table>
  );
}

function ShareList({ rows }: { rows: { label: string; clicks: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.clicks, 0), max = rows[0]?.clicks ?? 0;
  return (
    <ul className="space-y-2 text-sm tabular-nums">
      {rows.map(row => (
        <li key={row.label} data-device={row.label} className="grid grid-cols-[7rem_1fr_3.5rem_3rem] items-center gap-3">
          <span className="truncate">{row.label}</span><Bar value={row.clicks} max={max} label={`${row.label}: ${pct(row.clicks, total)}`} />
          <span className="text-right font-bold">{count(row.clicks)}</span><span className="text-right text-muted-foreground">{pct(row.clicks, total)}</span>
        </li>
      ))}
    </ul>
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
  const pick = (key: keyof Summary): Loadable<number> => summary.state === "ready" ? { state: "ready", data: summary.data[key] } : summary;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="g-heading g-h2 text-black">Traffic</h1>
          <p className="text-sm text-muted-foreground">Visits to the store by source, day, hour and device, in {ZONE} time. Staff browsing is not counted.</p>
        </div>
        <Link href="/admin/traffic/links" className="g-btn g-btn--sm g-btn--secondary">Campaign links</Link>
      </div>
      <RangePicker {...range} />
      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-3">
        <Tile title="Clicks" value={pick("clicks")} foot="Visits that landed on the store" />
        <Tile title="Visitors" value={pick("visitors")} foot="Different people (browsers)" />
        <Tile title="Page views" value={pick("pageViews")} foot="Every page opened" />
      </section>
      <Card title="Where clicks come from">
        <Section value={sources} empty={data => data.platforms.length === 0} emptyText={EMPTY}>{data => <SourcesTable platforms={data.platforms} />}</Section>
        <p className="mt-3 text-xs text-muted-foreground">Open a source to see formats (story, post, ad…) and campaigns. Tag your links in <Link href="/admin/traffic/links" className="underline">Campaign links</Link> so Instagram and Facebook posts, stories and ads are counted separately.</p>
      </Card>
      <Card title="Visits by day">
        <Section value={timeline} empty={data => data.days.every(day => day.clicks === 0 && day.pageViews === 0)} emptyText={EMPTY}>{data => <VisitsChart days={data.days} />}</Section>
      </Card>
      <Card title="Busiest hours and weekdays">
        <Section value={heatmap} empty={data => data.cells.length === 0} emptyText={EMPTY}>{data => <HourWeekdayGrid cells={data.cells} />}</Section>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Most viewed products">
          <Section value={products} empty={data => data.products.length === 0} emptyText="No product page views in this range yet.">
            {data => (
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="border-b border-garmin-rule text-left"><th className="py-2 font-medium">Product</th><th className="py-2 text-right font-medium">Views</th><th className="py-2 text-right font-medium">Visitors</th></tr></thead>
                <tbody>
                  {data.products.map(p => (
                    <tr key={p.productId} data-product={p.productId} className="border-b border-garmin-rule last:border-0">
                      <td className="py-2">{p.name ?? <span className="text-muted-foreground">Deleted product</span>}</td>
                      <td className="py-2 text-right font-bold">{count(p.views)}</td><td className="py-2 text-right">{count(p.visitors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </Card>
        <Card title="Devices">
          <Section value={devices} empty={data => data.os.length === 0} emptyText={EMPTY}>
            {data => (
              <div className="space-y-5">
                <ShareList rows={data.os.map(row => ({ label: row.os, clicks: row.clicks }))} />
                <div className="border-t border-garmin-rule pt-4"><ShareList rows={data.deviceTypes.map(row => ({ label: DEVICE_LABEL[row.deviceType] ?? row.deviceType, clicks: row.clicks }))} /></div>
              </div>
            )}
          </Section>
        </Card>
      </div>
    </div>
  );
}
