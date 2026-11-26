"use client";

import { useEffect, useRef, useState } from "react";
import { axisLabel, niceMax } from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";
import { count } from "./shared";

// Owner 2026-11-25: Admin ▸ Traffic charts. Marks follow the dashboard's DailyRevenueChart (dataviz specs):
// one series at a time (clicks or page views, never two axes), <= 24px columns with a 4px rounded data end,
// hairline grid, three ticks, a readout line answering hover and keyboard focus, and a table view.
// The hour × weekday grid is a sequential single-hue (blue 100→600) heatmap with a neutral zero.
// 2026-11-26 compact layout: the column chart is drawn at its real pixel width (ResizeObserver) and a fixed
// 150px height, so axis text stays 11px at every width; heatmap cells are fluid so the grid fits half a page.

export interface Day { date: string; clicks: number; pageViews: number }
export interface Cell { weekday: number; hour: number; pageViews: number }

type Series = "clicks" | "pageViews";
const SERIES: Record<Series, string> = { clicks: "Clicks", pageViews: "Page views" };
const H = 150, LEFT = 30, RIGHT = 4, TOP = 8, BOTTOM = 20;
const shortDate = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
function columnPath(x: number, width: number, base: number, top: number): string {
  const r = Math.min(4, width / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
}

/** The element's content width in px, following resizes. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(160, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function VisitsChart({ days }: { days: Day[] }) {
  const [ref, W] = useWidth(480);
  const [series, setSeries] = useState<Series>("clicks");
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const values = days.map(day => day[series]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const top = niceMax(Math.max(0, ...values));
  const plotW = W - LEFT - RIGHT, plotH = H - TOP - BOTTOM;
  const y = (value: number) => TOP + ((top - value) / top) * plotH;
  const slot = plotW / Math.max(days.length, 1), barW = Math.max(1, Math.min(24, slot - 2));
  // Counts are whole numbers: a middle tick only when it is one (no "1, 1" axis for small ranges).
  const ticks = top >= 2 && Number.isInteger(top / 2) ? [0, top / 2, top] : [0, top];
  const labelled = days.length > 2 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : days.map((_, index) => index);
  const current = active === null ? null : days[active];
  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Chart series" className="flex gap-1.5">
          {(Object.keys(SERIES) as Series[]).map(key => (
            <button key={key} type="button" aria-pressed={series === key} onClick={() => { setSeries(key); setActive(null); }} className={cn("g-btn g-btn--sm", series === key ? "g-btn--black" : "g-btn--secondary")}>{SERIES[key]}</button>
          ))}
          <button type="button" aria-pressed={table} onClick={() => setTable(!table)} className={cn("g-btn g-btn--sm", table ? "g-btn--black" : "g-btn--secondary")}>Table</button>
        </div>
        <p aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
          {current
            ? <><span className="font-bold text-black">{count(current[series])}</span> {SERIES[series].toLowerCase()} · {shortDate(current.date)}</>
            : <>Total <span className="font-bold text-black">{count(total)}</span> · {days.length} {days.length === 1 ? "day" : "days"}</>}
        </p>
      </div>
      {table ? (
        <div>
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-garmin-rule text-left"><th className="py-1 font-medium">Day</th><th className="py-1 text-right font-medium">Clicks</th><th className="py-1 text-right font-medium">Page views</th></tr></thead>
            <tbody>{days.map(day => <tr key={day.date} className="border-b border-garmin-rule last:border-0"><td className="py-1">{shortDate(day.date)}</td><td className="py-1 text-right">{count(day.clicks)}</td><td className="py-1 text-right">{count(day.pageViews)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`${SERIES[series]} per day. Total ${count(total)}.`} onMouseLeave={() => setActive(null)}>
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} strokeWidth={1} className={tick === 0 ? "stroke-[#c3c2b7]" : "stroke-[#e1e0d9]"} />
              <text x={LEFT - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-neutral-500 text-[11px] tabular-nums">{axisLabel(tick)}</text>
            </g>
          ))}
          {days.map((day, index) => {
            const value = values[index], x = LEFT + index * slot + (slot - barW) / 2;
            return (
              <g key={day.date} tabIndex={0} role="img" aria-label={`${shortDate(day.date)}: ${count(value)} ${SERIES[series].toLowerCase()}`}
                onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} className="outline-none">
                <rect x={LEFT + index * slot} y={TOP} width={slot} height={plotH} className="fill-transparent" />
                {value > 0 && <path d={columnPath(x, barW, y(0), y(value))} className={active === index ? "fill-[#1c5cab]" : "fill-[#2a78d6]"} />}
              </g>
            );
          })}
          {labelled.map(index => (
            <text key={index} x={LEFT + index * slot + slot / 2} y={H - 5} textAnchor={index === 0 && days.length > 1 ? "start" : index === days.length - 1 && days.length > 1 ? "end" : "middle"} className="fill-neutral-500 text-[11px]">{shortDate(days[index].date)}</text>
          ))}
        </svg>
      )}
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Sequential blue ramp steps 100, 200, 300, 450, 600; zero is the neutral surface tint.
const STEPS = ["bg-[#cde2fb]", "bg-[#9ec5f4]", "bg-[#6da7ec]", "bg-[#2a78d6]", "bg-[#184f95]"];
const LEGEND = ["#cde2fb", "#9ec5f4", "#6da7ec", "#2a78d6", "#184f95"];

export function HourWeekdayGrid({ cells }: { cells: Cell[] }) {
  const [active, setActive] = useState<Cell | null>(null);
  const grid = new Map(cells.map(cell => [`${cell.weekday}:${cell.hour}`, cell.pageViews]));
  const max = Math.max(0, ...cells.map(cell => cell.pageViews));
  const step = (value: number) => value <= 0 ? "bg-[#f4f3f0]" : STEPS[Math.min(STEPS.length - 1, Math.floor((value / max) * STEPS.length - 1e-9))];
  const busiest = [...cells].sort((a, b) => b.pageViews - a.pageViews)[0];
  const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <div>
      <table className="w-full table-fixed border-separate border-spacing-[2px] text-[11px]" onMouseLeave={() => setActive(null)}>
        <colgroup><col className="w-8" />{Array.from({ length: 24 }, (_, h) => <col key={h} />)}</colgroup>
        <thead>
          <tr><th className="sr-only">Day</th>{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="overflow-visible whitespace-nowrap text-left font-normal leading-4 text-neutral-500">{h % 6 === 0 ? h : ""}<span className="sr-only">{hour(h)}</span></th>)}</tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((name, index) => (
            <tr key={name}>
              <th scope="row" className="pr-1 text-left font-normal leading-none text-neutral-500">{name}</th>
              {Array.from({ length: 24 }, (_, h) => {
                const value = grid.get(`${index + 1}:${h}`) ?? 0, cell = { weekday: index + 1, hour: h, pageViews: value };
                return (
                  <td key={h} tabIndex={0} aria-label={`${name} ${hour(h)}: ${count(value)} page views`} onMouseEnter={() => setActive(cell)} onFocus={() => setActive(cell)} onBlur={() => setActive(null)}
                    className={cn("h-3.5 rounded-[2px] p-0 outline-none focus-visible:ring-2 focus-visible:ring-black sm:h-4", step(value))} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <p aria-live="polite" className="tabular-nums text-muted-foreground">
          {active
            ? <><span className="font-bold text-black">{count(active.pageViews)}</span> page views · {WEEKDAYS[active.weekday - 1]} {hour(active.hour)}–{hour((active.hour + 1) % 24)}</>
            : busiest ? <>Busiest: <span className="font-bold text-black">{WEEKDAYS[busiest.weekday - 1]} {hour(busiest.hour)}</span> ({count(busiest.pageViews)} page views)</> : null}
        </p>
        <div className="flex items-center gap-1 text-neutral-500" aria-hidden>
          Fewer <svg width={LEGEND.length * 12} height={8}>{LEGEND.map((color, index) => <rect key={color} x={index * 12} width={10} height={8} rx={2} fill={color} />)}</svg> More
        </div>
      </div>
    </div>
  );
}
