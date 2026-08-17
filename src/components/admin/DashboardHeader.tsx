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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232836] pb-5 font-sans">
      {/* Title */}
      <div>
        <h1 className="font-heading uppercase tracking-wider text-2xl lg:text-[26px] font-bold text-white">
          Commerce Overview
        </h1>
        <p className="text-[13px] text-[#8a92a3] mt-0.5">
          Store performance, order fulfillment, and catalog inventory metrics.
        </p>
      </div>

      {/* Controls & Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Timeframe selector */}
        <div className="flex items-center border border-[#262d3d] bg-[#12151e] p-0.5 rounded">
          {timeframes.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => setTimeframe(tf.id)}
              className={`px-2.5 py-1 text-[11px] font-heading uppercase tracking-wider font-bold transition-all rounded-sm ${
                timeframe === tf.id
                  ? "bg-[#007cc3] text-white shadow-sm"
                  : "text-[#8a92a3] hover:text-white hover:bg-[#1c2230]"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Currency selector */}
        <div className="flex items-center border border-[#262d3d] bg-[#12151e] p-0.5 rounded">
          {currencies.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCurrency(c.code)}
              className={`px-2 py-1 text-[11px] font-heading uppercase tracking-wider font-bold transition-all rounded-sm ${
                currency === c.code
                  ? "bg-[#1f2636] text-[#00a0df] border border-[#00a0df]/30"
                  : "text-[#737b8c] hover:text-white"
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 border border-[#262d3d] bg-[#12151e] px-2.5 py-1.5 text-[11px] font-heading uppercase tracking-wider font-bold text-[#c0c7d4] hover:bg-[#181d28] hover:text-white transition-colors rounded disabled:opacity-50"
            title="Refresh metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#007cc3]" : ""}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          <button
            type="button"
            onClick={onExportCSV}
            className="flex items-center gap-1 border border-[#262d3d] bg-[#12151e] px-2.5 py-1.5 text-[11px] font-heading uppercase tracking-wider font-bold text-[#c0c7d4] hover:bg-[#181d28] hover:text-white transition-colors rounded"
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5 text-[#007cc3]" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <Link
            href="/admin/products"
            className="flex items-center gap-1.5 bg-[#007cc3] hover:bg-[#006cae] px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-bold text-white transition-all rounded"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Product</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
