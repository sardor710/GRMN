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
    <div className="border border-[#232836] bg-[#12151e] p-5 rounded font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e2330] pb-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-[#007cc3]" />
            <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">
              Revenue &amp; Order Performance
            </h3>
          </div>
          <p className="text-[12px] text-[#8a92a3] mt-0.5">
            Monthly gross sales volume and average order values
          </p>
        </div>

        {/* Selected Month Summary */}
        <div className="flex items-center gap-4 text-xs font-mono bg-[#171b26] px-3 py-1.5 rounded border border-[#232938]">
          <span className="text-[#8a92a3]">{activeItem.month} 2026:</span>
          <span className="font-heading font-bold text-sm text-white">
            {currencySymbol}
            {Math.round(activeItem.rev * currencyRate).toLocaleString()}
          </span>
          <span className="text-[#00a0df] font-semibold">{activeItem.orders} orders</span>
          <span className="text-[#4ade80] font-semibold flex items-center gap-0.5">
            <TrendingUp className="h-3 w-3" />
            +24.8%
          </span>
        </div>
      </div>

      {/* Bar Chart Grid */}
      <div className="relative pt-4">
        {/* Subtle grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-15">
          <div className="border-b border-[#475569] w-full" />
          <div className="border-b border-[#475569] w-full" />
          <div className="border-b border-[#475569] w-full" />
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
                  className={`absolute -top-9 z-20 px-2 py-1 bg-[#090b10] border border-[#007cc3] text-white text-[11px] font-mono rounded shadow-lg whitespace-nowrap transition-all duration-150 ${
                    isSelected ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                  }`}
                >
                  <span className="font-bold text-[#00a0df]">
                    {currencySymbol}
                    {Math.round(item.rev * currencyRate).toLocaleString()}
                  </span>
                  <span className="text-[#8a92a3]"> · {item.orders} ord</span>
                </div>

                {/* Bar */}
                <div className="w-full bg-[#181d28] rounded-t-sm h-full flex items-end overflow-hidden">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full transition-all duration-200 rounded-t-sm ${
                      isSelected
                        ? "bg-[#007cc3] shadow-md shadow-[#007cc3]/20"
                        : item.isCurrent
                        ? "bg-[#007cc3]/80"
                        : "bg-[#252c3c] group-hover:bg-[#343e54]"
                    }`}
                  />
                </div>

                {/* Month */}
                <span
                  className={`font-heading text-[11px] uppercase tracking-wider transition-colors ${
                    isSelected
                      ? "text-[#00a0df] font-bold"
                      : item.isCurrent
                      ? "text-white font-bold"
                      : "text-[#737b8c]"
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
