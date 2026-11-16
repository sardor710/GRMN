"use client";

import { useState } from "react";
import { BarChart2, TrendingUp } from "lucide-react";

interface SalesChartProps {
  currencySymbol: string;
  currencyRate: number;
}

export function SalesChart({ currencySymbol, currencyRate }: SalesChartProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(7); // default current month

  const data = [
    { month: "Jan", rev: 28400, orders: 22, aov: 1290 },
    { month: "Feb", rev: 34200, orders: 28, aov: 1221 },
    { month: "Mar", rev: 41500, orders: 32, aov: 1296 },
    { month: "Apr", rev: 38900, orders: 29, aov: 1341 },
    { month: "May", rev: 52100, orders: 38, aov: 1371 },
    { month: "Jun", rev: 64800, orders: 46, aov: 1408 },
    { month: "Jul", rev: 78500, orders: 54, aov: 1453 },
    { month: "Aug", rev: 94200, orders: 65, aov: 1449, isCurrent: true },
  ];

  const maxRev = Math.max(...data.map((d) => d.rev));
  const activeItem = selectedIdx !== null ? data[selectedIdx] : data[7];

  return (
    <div className="border border-neutral-200 bg-white p-6 rounded-none font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-[#007cc3]" />
            <h3 className="g-heading uppercase tracking-wide text-[18px] text-black font-normal">
              Revenue &amp; Order Performance
            </h3>
          </div>
          <p className="text-[13px] text-neutral-500 mt-0.5">
            Monthly gross sales volume and average order values
          </p>
        </div>

        {/* Selected Month Summary */}
        <div className="flex items-center gap-4 text-xs font-mono bg-neutral-50 px-3.5 py-2 rounded-none border border-neutral-200">
          <span className="text-neutral-500">{activeItem.month} 2026:</span>
          <span className="font-heading font-bold text-sm text-black">
            {currencySymbol}
            {Math.round(activeItem.rev * currencyRate).toLocaleString()}
          </span>
          <span className="text-[#007cc3] font-semibold">{activeItem.orders} orders</span>
          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
            <TrendingUp className="h-3 w-3" />
            +24.8%
          </span>
        </div>
      </div>

      {/* Bar Chart Grid */}
      <div className="relative pt-4">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
          <div className="border-b border-neutral-100 w-full" />
          <div className="border-b border-neutral-100 w-full" />
          <div className="border-b border-neutral-100 w-full" />
        </div>

        <div className="flex h-48 items-end gap-3 pt-6 relative z-10">
          {data.map((item, idx) => {
            const heightPercent = (item.rev / maxRev) * 100;
            const isSelected = selectedIdx === idx;

            return (
              <div
                key={item.month}
                onMouseEnter={() => setSelectedIdx(idx)}
                className="group relative flex flex-1 flex-col items-center gap-2 h-full justify-end cursor-pointer"
              >
                {/* Tooltip */}
                <div
                  className={`absolute -top-9 z-20 px-2.5 py-1 bg-black text-white text-[11px] font-mono rounded-none shadow-lg whitespace-nowrap transition-all duration-150 ${
                    isSelected ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                  }`}
                >
                  <span className="font-bold">
                    {currencySymbol}
                    {Math.round(item.rev * currencyRate).toLocaleString()}
                  </span>
                  <span className="text-neutral-300"> · {item.orders} ord</span>
                </div>

                {/* Bar */}
                <div className="w-full bg-neutral-100 rounded-none h-full flex items-end overflow-hidden">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full transition-all duration-200 rounded-none ${
                      isSelected
                        ? "bg-[#007cc3]"
                        : item.isCurrent
                        ? "bg-black"
                        : "bg-neutral-300 group-hover:bg-[#007cc3]"
                    }`}
                  />
                </div>

                {/* Month */}
                <span
                  className={`font-heading text-[11px] uppercase tracking-wider transition-colors ${
                    isSelected
                      ? "text-[#007cc3] font-bold"
                      : item.isCurrent
                      ? "text-black font-bold"
                      : "text-neutral-500"
                  }`}
                >
                  {item.month}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
