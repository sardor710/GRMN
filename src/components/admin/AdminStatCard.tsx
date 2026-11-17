"use client";

import { LucideIcon, TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";

interface AdminStatCardProps {
  title: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  icon: LucideIcon;
  subtitle?: string;
  tag?: string;
  sparkline?: number[];
  sparklineColor?: string;
  progress?: {
    value: number;
    max?: number;
    label?: string;
  };
  highlight?: boolean;
  onClick?: () => void;
}

export function AdminStatCard({
  title,
  value,
  change,
  isPositive = true,
  icon: Icon,
  subtitle,
  tag,
  sparkline,
  sparklineColor = "#007cc3",
  progress,
  highlight = false,
  onClick,
}: AdminStatCardProps) {
  // Generate SVG path for sparkline
  const sparklinePath = sparkline && sparkline.length > 1 ? (() => {
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const range = max - min || 1;
    const width = 120;
    const height = 32;
    const points = sparkline.map((val, idx) => {
      const x = (idx / (sparkline.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(" L ")}`;
  })() : null;

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden border p-6 bg-white transition-all duration-200 rounded-none ${
        highlight
          ? "border-black shadow-md"
          : "border-neutral-200 hover:border-black"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* Subtle top indicator bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-[3px] transition-opacity ${
          highlight
            ? "bg-[#007cc3] opacity-100"
            : "bg-black opacity-0 group-hover:opacity-100"
        }`}
      />

      {/* Header: Title & Icon */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="g-heading uppercase tracking-[0.06em] text-[12px] text-neutral-500 font-normal">
            {title}
          </span>
          {tag && (
            <span className="ml-2 font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 bg-[#007cc3]/10 text-[#007cc3] border border-[#007cc3]/20">
              {tag}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex h-8 w-8 items-center justify-center border border-neutral-200 bg-neutral-50 text-black transition-colors group-hover:bg-black group-hover:text-white group-hover:border-black">
            <Icon className="h-4 w-4" />
          </div>
          {onClick && (
            <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </div>

      {/* Value & Sparkline Row */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="g-heading text-3xl lg:text-[32px] font-normal tracking-tight text-black leading-none">
            {value}
          </h3>
        </div>

        {sparklinePath && (
          <div className="h-8 w-24 shrink-0 pb-1">
            <svg
              viewBox="0 0 120 32"
              className="h-full w-full overflow-visible"
              preserveAspectRatio="none"
            >
              <path
                d={sparklinePath}
                fill="none"
                stroke={sparklineColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Progress bar if present */}
      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 mb-1">
            <span>{progress.label || "Target"}</span>
            <span className="text-black font-semibold">
              {Math.round((progress.value / (progress.max || 100)) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full bg-black transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, (progress.value / (progress.max || 100)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Footer / Trend change */}
      <div className="mt-4 flex items-center justify-between text-[12px] font-sans pt-3 border-t border-neutral-100">
        {change ? (
          <div
            className={`flex items-center gap-1 font-medium ${
              isPositive ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            <span className="font-semibold">{change}</span>
          </div>
        ) : (
          <span className="text-neutral-400 font-mono text-[11px]">Real-time Telemetry</span>
        )}
        {subtitle && <span className="text-neutral-500 text-[11px]">{subtitle}</span>}
      </div>
    </div>
  );
}
