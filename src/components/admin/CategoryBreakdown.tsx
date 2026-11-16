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
      color: "bg-black",
    },
    {
      name: "Outdoor & Multisport (fēnix / Enduro)",
      share: 34,
      revUSD: 32028,
      units: 38,
      color: "bg-[#007cc3]",
    },
    {
      name: "Running & Triathlon (Forerunner)",
      share: 14,
      revUSD: 13188,
      units: 21,
      color: "bg-neutral-700",
    },
    {
      name: "Marine & Sailing (Quatix)",
      share: 6,
      revUSD: 5652,
      units: 4,
      color: "bg-neutral-500",
    },
    {
      name: "Aviation & Tactical (D2)",
      share: 4,
      revUSD: 3768,
      units: 3,
      color: "bg-neutral-400",
    },
  ];

  return (
    <div className="border border-neutral-200 bg-white p-6 rounded-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-[#007cc3]" />
          <h3 className="g-heading uppercase tracking-wide text-[18px] text-black font-normal">
            Sales by Category
          </h3>
        </div>
        <span className="font-mono text-[11px] text-neutral-400">Share %</span>
      </div>

      {/* Categories List */}
      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.name} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-black truncate max-w-[200px]">
                {cat.name}
              </span>
              <div className="flex items-center gap-2 text-[12px] font-mono">
                <span className="text-neutral-500">
                  {currencySymbol}
                  {Math.round(cat.revUSD * currencyRate).toLocaleString()}
                </span>
                <span className="font-bold text-black w-8 text-right">
                  {cat.share}%
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full bg-neutral-100 rounded-none overflow-hidden">
              <div
                className={`h-full ${cat.color} transition-all duration-500 rounded-none`}
                style={{ width: `${cat.share}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
