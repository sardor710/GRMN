import React from "react";

export type BadgeType =
  | "NEW"
  | "CUSTOMIZABLE"
  | "SALE"
  | "BEST SELLER"
  | "LIMITED EDITION"
  | "CARBON EDITION"
  | "GARMIN SIGNATURE"
  | "EXCLUSIVE"
  | "POPULAR"
  | string;

interface BadgeStyleConfig {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor?: string;
  ribbonClass: string;
  pillClass: string;
  starburstFill: string;
  subText?: string;
}

export const BADGE_CONFIGS: Record<string, BadgeStyleConfig> = {
  NEW: {
    label: "NEW",
    bgColor: "bg-[#00a0df]",
    textColor: "text-white",
    ribbonClass: "bg-[#00a0df] text-white",
    pillClass: "bg-[#00a0df] text-white font-heading uppercase tracking-wider",
    starburstFill: "#00a0df",
  },
  CUSTOMIZABLE: {
    label: "CUSTOMIZABLE",
    bgColor: "bg-[#5bc2e7]",
    textColor: "text-white",
    ribbonClass: "bg-[#5bc2e7] text-white",
    pillClass: "bg-[#5bc2e7] text-white font-heading uppercase tracking-wider",
    starburstFill: "#5bc2e7",
  },
  SALE: {
    label: "SALE",
    bgColor: "bg-[#dc2626]",
    textColor: "text-white",
    ribbonClass: "bg-[#dc2626] text-white font-bold",
    pillClass: "bg-[#dc2626] text-white font-heading uppercase tracking-wider font-bold",
    starburstFill: "#dc2626",
  },
  "BEST SELLER": {
    label: "BEST SELLER",
    bgColor: "bg-[#0f172a]",
    textColor: "text-[#fbbf24]",
    borderColor: "border-[#f59e0b]/40",
    ribbonClass: "bg-[#0f172a] text-[#fbbf24] border-r border-[#f59e0b]/50",
    pillClass: "bg-[#0f172a] text-[#fbbf24] border border-[#f59e0b]/50 font-heading uppercase tracking-wider",
    starburstFill: "#0f172a",
  },
  "LIMITED EDITION": {
    label: "LIMITED EDITION",
    bgColor: "bg-[#090a0f]",
    textColor: "text-[#e2e8f0]",
    borderColor: "border-[#94a3b8]/40",
    ribbonClass: "bg-[#090a0f] text-[#e2e8f0] border-r border-[#94a3b8]/50",
    pillClass: "bg-[#090a0f] text-[#e2e8f0] border border-[#94a3b8]/40 font-heading uppercase tracking-wider font-semibold",
    starburstFill: "#090a0f",
  },
  "CARBON EDITION": {
    label: "CARBON EDITION",
    bgColor: "bg-[#18181b]",
    textColor: "text-white",
    borderColor: "border-[#38bdf8]/40",
    ribbonClass: "bg-[#18181b] text-white border-r border-[#38bdf8]/50",
    pillClass: "bg-[#18181b] text-white border border-[#38bdf8]/40 font-heading uppercase tracking-wider",
    starburstFill: "#18181b",
  },
  "GARMIN SIGNATURE": {
    label: "GARMIN SIGNATURE",
    bgColor: "bg-[#007cc3]",
    textColor: "text-white",
    ribbonClass: "bg-[#007cc3] text-white",
    pillClass: "bg-[#007cc3] text-white font-heading uppercase tracking-wider font-bold",
    starburstFill: "#007cc3",
  },
  EXCLUSIVE: {
    label: "EXCLUSIVE",
    bgColor: "bg-[#1e1b4b]",
    textColor: "text-[#38bdf8]",
    borderColor: "border-[#38bdf8]/40",
    ribbonClass: "bg-[#1e1b4b] text-[#38bdf8] border-r border-[#38bdf8]/50",
    pillClass: "bg-[#1e1b4b] text-[#38bdf8] border border-[#38bdf8]/40 font-heading uppercase tracking-wider",
    starburstFill: "#1e1b4b",
  },
  POPULAR: {
    label: "POPULAR",
    bgColor: "bg-[#d97706]",
    textColor: "text-white",
    ribbonClass: "bg-[#d97706] text-white",
    pillClass: "bg-[#d97706] text-white font-heading uppercase tracking-wider",
    starburstFill: "#d97706",
  },
};

function starburstPath(points: number, outer: number, inner: number, cx = 50, cy = 50) {
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d + "Z";
}

export function GarminBadge({
  badge,
  variant = "ribbon",
  className = "",
}: {
  badge: string;
  variant?: "ribbon" | "pill" | "starburst";
  className?: string;
}) {
  if (!badge || badge === "NONE") return null;

  const normalized = badge.trim().toUpperCase();
  const config = BADGE_CONFIGS[normalized] || {
    label: badge,
    bgColor: "bg-[#007cc3]",
    textColor: "text-white",
    ribbonClass: "bg-[#007cc3] text-white",
    pillClass: "bg-[#007cc3] text-white font-heading uppercase tracking-wider",
    starburstFill: "#007cc3",
  };

  if (variant === "starburst") {
    return (
      <div className={`relative grid place-items-center ${className}`}>
        <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-md">
          <path d={starburstPath(14, 50, 43)} fill={config.starburstFill} />
        </svg>
        <span className="font-heading uppercase absolute text-[12px] tracking-[0.06em] text-white font-bold text-center px-1">
          {config.label}
        </span>
      </div>
    );
  }

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 text-[11px] font-heading uppercase tracking-wider font-bold ${config.pillClass} ${className}`}
      >
        {config.label}
      </span>
    );
  }

  // Default: ribbon flag (used on Product Cards)
  return (
    <span
      className={`absolute left-0 top-4 z-10 px-3 py-1 text-[11px] font-heading uppercase tracking-wider font-bold shadow-sm ${config.ribbonClass} ${className}`}
      style={{ clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)" }}
    >
      {config.label}
    </span>
  );
}
