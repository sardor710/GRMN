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
      className={`group relative overflow-hidden border p-5 transition-all duration-200 ${
        highlight
          ? "border-[#007cc3]/50 bg-gradient-to-b from-[#16202e] to-[#121620] shadow-lg shadow-[#007cc3]/5"
          : "border-[#232836] bg-[#12151e] hover:border-[#384257] hover:bg-[#151924]"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* Subtle top indicator bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] transition-opacity ${
          highlight
            ? "bg-[#007cc3] opacity-100"
            : "bg-[#007cc3] opacity-0 group-hover:opacity-100"
        }`}
      />

      {/* Header: Title & Icon */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#8a92a3]">
            {title}
          </span>
          {tag && (
            <span className="ml-2 font-mono text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#1e2535] text-[#00a0df] border border-[#00a0df]/20">
              {tag}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex h-8 w-8 items-center justify-center border border-[#262c3c] bg-[#181c28] text-[#007cc3] transition-colors group-hover:border-[#007cc3]/40 group-hover:text-white">
            <Icon className="h-4 w-4" />
          </div>
          {onClick && (
            <ArrowUpRight className="h-3.5 w-3.5 text-[#525b6c] opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </div>

      {/* Value & Sparkline Row */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-2xl lg:text-[28px] font-bold tracking-tight text-white leading-none">
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
                strokeWidth="2.2"
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
          <div className="flex items-center justify-between text-[10px] font-mono text-[#8a92a3] mb-1">
            <span>{progress.label || "Target"}</span>
            <span className="text-white font-semibold">
              {Math.round((progress.value / (progress.max || 100)) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#1b202c] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#007cc3] to-[#00c0f0] transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, (progress.value / (progress.max || 100)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Footer / Trend change */}
      <div className="mt-3 flex items-center justify-between text-[11px] font-sans pt-2.5 border-t border-[#1c212e]">
        {change ? (
          <div
            className={`flex items-center gap-1 font-medium font-sans ${
              isPositive ? "text-[#4ade80]" : "text-rose-400"
            }`}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span className="font-semibold">{change}</span>
          </div>
        ) : (
          <span className="text-[#64748b]">Real-time Telemetry</span>
        )}
        {subtitle && <span className="text-[#808b9e] text-[11px]">{subtitle}</span>}
      </div>
    </div>
  );
}
