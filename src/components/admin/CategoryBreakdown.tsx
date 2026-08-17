"use client";

import { PieChart } from "lucide-react";

interface CategoryBreakdownProps {
  currencySymbol: string;
  currencyRate: number;
}

export function CategoryBreakdown({
  currencySymbol,
  currencyRate,
}: CategoryBreakdownProps) {
  const categories = [
    {
      name: "Luxury Tool Watches (MARQ)",
      share: 42,
      revUSD: 39564,
      units: 16,
      color: "bg-[#007cc3]",
    },
    {
      name: "Outdoor & Multisport (fēnix / Enduro)",
      share: 34,
      revUSD: 32028,
      units: 38,
      color: "bg-[#22c55e]",
    },
    {
      name: "Running & Triathlon (Forerunner)",
      share: 14,
      revUSD: 13188,
      units: 21,
      color: "bg-[#f59e0b]",
    },
    {
      name: "Marine & Sailing (Quatix)",
      share: 6,
      revUSD: 5652,
      units: 4,
      color: "bg-[#8b5cf6]",
    },
    {
      name: "Aviation & Tactical (D2)",
      share: 4,
      revUSD: 3768,
      units: 3,
      color: "bg-[#06b6d4]",
    },
  ];

  return (
    <div className="border border-[#232836] bg-[#12151e] p-5 rounded font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e2330] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-[#007cc3]" />
          <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">
            Sales by Category
          </h3>
        </div>
        <span className="font-mono text-[10px] text-[#8a92a3]">Share %</span>
      </div>

      {/* Categories List */}
      <div className="space-y-3.5">
        {categories.map((cat) => (
          <div key={cat.name} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white truncate max-w-[200px]">
                {cat.name}
              </span>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-[#8a92a3]">
                  {currencySymbol}
                  {Math.round(cat.revUSD * currencyRate).toLocaleString()}
                </span>
                <span className="font-bold text-white w-8 text-right">
                  {cat.share}%
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-[#181d28] rounded-full overflow-hidden">
              <div
                className={`h-full ${cat.color} transition-all duration-500 rounded-full`}
                style={{ width: `${cat.share}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
