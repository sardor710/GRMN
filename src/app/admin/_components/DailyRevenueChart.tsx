"use client";

import { useState } from "react";
import { axisLabel, formatMinor, minorToNumber, niceMax, seriesTotal, type DailyPoint } from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

// Task 4.2: daily net revenue as columns, one series at a time. Real revenue and demo revenue are a
// toggle, never stacked or summed. Marks follow the dataviz specs: <= 24px columns with a 4px rounded
// data end and a square baseline, hairline solid gridlines, three clean ticks. Each column has a
// bigger hit target that answers hover and keyboard focus in the readout line; the By day table is
// the table view. Palette: categorical slot 1 (blue) and slot 2 (orange), validated on white.

type Series = "real" | "demo";
const SERIES: Record<Series, { label: string; swatch: string; bar: string; active: string }> = {
  real: { label: "Revenue", swatch: "bg-[#2a78d6]", bar: "fill-[#2a78d6]", active: "fill-[#1c5cab]" },
  demo: { label: "Demo revenue", swatch: "bg-[#eb6834]", bar: "fill-[#eb6834]", active: "fill-[#b8471c]" },
};
const W = 640, H = 220, LEFT = 52, RIGHT = 8, TOP = 12, BOTTOM = 26;
const shortDate = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** A column from the baseline to `top`: square at the baseline, 4px rounded at the data end (either direction). */
function columnPath(x: number, width: number, base: number, top: number): string {
  const height = Math.abs(base - top), r = Math.min(4, width / 2, height), up = top < base, end = up ? top + r : top - r;
  return `M${x},${base}V${end}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${end}V${base}Z`;
}

export function DailyRevenueChart({ points, currency }: { points: DailyPoint[]; currency: string }) {
  // Until staff pick a series, show real revenue, or demo revenue when only demo has data.
  const [picked, setSeries] = useState<Series | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const series: Series = picked ?? (points.every(point => point.realMinor === "0") && points.some(point => point.demoMinor !== "0") ? "demo" : "real");
  const minor = (point: DailyPoint) => series === "real" ? point.realMinor : point.demoMinor;
  const values = points.map(point => minorToNumber(minor(point)));
  const hasData = points.some(point => minor(point) !== "0");
  const top = niceMax(Math.max(0, ...values)), bottom = Math.min(0, ...values) < 0 ? -niceMax(-Math.min(...values)) : 0;
  const plotW = W - LEFT - RIGHT, plotH = H - TOP - BOTTOM;
  const y = (value: number) => TOP + ((top - value) / (top - bottom)) * plotH;
  const slot = plotW / Math.max(points.length, 1), barW = Math.max(1, Math.min(24, slot - 2));
  const ticks = bottom < 0 ? [bottom, 0, top] : [0, top / 2, top];
  const labelled = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, index) => index);
  const current = active === null ? null : points[active];
  const total = seriesTotal(points, series);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Chart series" className="flex gap-2">
          {(Object.keys(SERIES) as Series[]).map(key => (
            <button key={key} type="button" aria-pressed={series === key} onClick={() => { setSeries(key); setActive(null); }}
              className={cn("g-btn g-btn--sm gap-1.5", series === key ? "g-btn--black" : "g-btn--secondary")}>
              <span aria-hidden className={cn("inline-block size-2.5", SERIES[key].swatch)} />{SERIES[key].label}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
          {current
            ? <><span className="font-bold text-black">{formatMinor(minor(current), currency)}</span> · {shortDate(current.date)}</>
            : <>Total <span className="font-bold text-black">{formatMinor(total, currency)}</span> · {points.length} days</>}
        </p>
      </div>
      {!hasData ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{series === "real" ? "No revenue in this date range yet." : "No demo revenue in this date range yet."}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${SERIES[series].label} per day, ${currency}. Total ${formatMinor(total, currency)}.`} onMouseLeave={() => setActive(null)}>
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} strokeWidth={1} className={tick === 0 ? "stroke-[#c3c2b7]" : "stroke-[#e1e0d9]"} />
              <text x={LEFT - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-neutral-500 text-xs tabular-nums">{axisLabel(tick)}</text>
            </g>
          ))}
          {points.map((point, index) => {
            const value = values[index], x = LEFT + index * slot + (slot - barW) / 2;
            return (
              <g key={point.date} tabIndex={0} role="img" aria-label={`${shortDate(point.date)}: ${formatMinor(minor(point), currency)}`}
                onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} className="outline-none focus-visible:[&>rect]:stroke-black">
                <rect x={LEFT + index * slot} y={TOP} width={slot} height={plotH} className="fill-transparent" strokeWidth={1} />
                {value !== 0 && <path d={columnPath(x, barW, y(0), y(value))} className={active === index ? SERIES[series].active : SERIES[series].bar} />}
              </g>
            );
          })}
          {labelled.map(index => (
            <text key={index} x={LEFT + index * slot + slot / 2} y={H - 8} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className="fill-neutral-500 text-xs">{shortDate(points[index].date)}</text>
          ))}
        </svg>
      )}
    </div>
  );
}
