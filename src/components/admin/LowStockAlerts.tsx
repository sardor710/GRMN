"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Plus, RefreshCw, ChevronRight } from "lucide-react";
import type { CMSProduct } from "@/lib/cms/types";

interface LowStockAlertsProps {
  products: CMSProduct[];
  currencySymbol: string;
  onRestockProduct: (productId: string, addedStock: number) => Promise<void>;
}

export function LowStockAlerts({
  products,
  currencySymbol,
  onRestockProduct,
}: LowStockAlertsProps) {
  const [restockingId, setRestockingId] = useState<string | null>(null);

  const lowStockItems = [...products]
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 4);

  const handleQuickRestock = async (productId: string, amount: number) => {
    setRestockingId(productId);
    try {
      await onRestockProduct(productId, amount);
    } finally {
      setRestockingId(null);
    }
  };

  return (
    <div className="border border-[#232836] bg-[#12151e] p-5 rounded font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e2330] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
          <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">
            Low Stock Alerts
          </h3>
        </div>
        <Link
          href="/admin/products"
          className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#007cc3] hover:underline flex items-center gap-1"
        >
          <span>Catalog</span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* List */}
      <div className="space-y-3">
        {lowStockItems.map((prod) => {
          const isCritical = prod.stock <= 10;
          const isRestocking = restockingId === prod.id;

          return (
            <div
              key={prod.id}
              className="flex items-center justify-between gap-3 bg-[#171b26] p-2.5 border border-[#232938] rounded"
            >
              {/* Image & Title */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative h-9 w-9 shrink-0 bg-[#0e1118] border border-[#232938] rounded overflow-hidden">
                  <Image
                    src={prod.image || "/images/products/1228429.jpg"}
                    alt={prod.name}
                    fill
                    sizes="36px"
                    className="object-contain p-0.5"
                  />
                </div>
                <div className="min-w-0 max-w-[140px] sm:max-w-[180px]">
                  <p className="font-heading text-xs font-bold text-white truncate">
                    {prod.name}
                  </p>
                  <p className="text-[10px] font-mono text-[#8a92a3]">
                    {currencySymbol}{prod.price}
                  </p>
                </div>
              </div>

              {/* Stock count & restock buttons */}
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    isCritical
                      ? "text-rose-400 bg-rose-950/40 border-rose-500/30"
                      : "text-amber-400 bg-amber-950/40 border-amber-500/30"
                  }`}
                >
                  {prod.stock} left
                </span>

                <button
                  type="button"
                  disabled={isRestocking}
                  onClick={() => handleQuickRestock(prod.id, 25)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#1f2636] hover:bg-[#007cc3] text-white text-[10px] font-mono font-semibold rounded border border-[#2e374d] hover:border-[#007cc3] transition-all disabled:opacity-50"
                  title="Quick Restock +25 Units"
                >
                  {isRestocking ? (
                    <RefreshCw className="h-2.5 w-2.5 animate-spin text-[#00a0df]" />
                  ) : (
                    <Plus className="h-2.5 w-2.5" />
                  )}
                  <span>25</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
