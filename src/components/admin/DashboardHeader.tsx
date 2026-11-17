"use client";

import Link from "next/link";
import { Plus, Download, RefreshCw } from "lucide-react";

interface DashboardHeaderProps {
  timeframe: string;
  setTimeframe: (tf: string) => void;
  currency: string;
  setCurrency: (c: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onExportCSV: () => void;
}

export function DashboardHeader({
  timeframe,
  setTimeframe,
  currency,
  setCurrency,
  onRefresh,
  isRefreshing = false,
  onExportCSV,
}: DashboardHeaderProps) {
  const timeframes = [
    { id: "7d", label: "7 Days" },
    { id: "30d", label: "30 Days" },
    { id: "90d", label: "90 Days" },
    { id: "ytd", label: "YTD" },
  ];

  const currencies = [
    { code: "USD", symbol: "$" },
    { code: "SGD", symbol: "S$" },
    { code: "EUR", symbol: "€" },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5 font-sans">
      {/* Title */}
      <div>
        <h1 className="g-heading uppercase tracking-wide text-2xl lg:text-[28px] text-black font-normal">
          Commerce Overview
        </h1>
        <p className="text-[14px] text-neutral-500 mt-1">
          Store performance, order fulfillment, and catalog inventory metrics.
        </p>
      </div>

      {/* Controls & Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Timeframe selector */}
        <div className="flex items-center border border-neutral-300 bg-white p-0.5 rounded-none">
          {timeframes.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => setTimeframe(tf.id)}
              className={`px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold transition-all rounded-none ${
                timeframe === tf.id
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:text-black hover:bg-neutral-100"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Currency selector */}
        <div className="flex items-center border border-neutral-300 bg-white p-0.5 rounded-none">
          {currencies.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCurrency(c.code)}
              className={`px-2.5 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold transition-all rounded-none ${
                currency === c.code
                  ? "bg-neutral-100 text-black border border-neutral-300"
                  : "text-neutral-500 hover:text-black"
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-700 hover:border-black hover:text-black transition-colors rounded-none disabled:opacity-50"
            title="Refresh metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#007cc3]" : ""}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          <button
            type="button"
            onClick={onExportCSV}
            className="flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-700 hover:border-black hover:text-black transition-colors rounded-none"
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5 text-neutral-500" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <Link
            href="/admin/products"
            className="flex items-center gap-1.5 bg-black text-white hover:bg-white hover:text-black border border-black px-4 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold transition-colors rounded-none"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Product</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
