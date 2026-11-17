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
    <div className="border border-neutral-200 bg-white p-6 rounded-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h3 className="g-heading uppercase tracking-wide text-[18px] text-black font-normal">
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
              className="flex items-center justify-between gap-3 bg-neutral-50 p-3 border border-neutral-200 rounded-none hover:border-black transition-colors"
            >
              {/* Image & Title */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative h-10 w-10 shrink-0 bg-white border border-neutral-200 rounded-none overflow-hidden">
                  <Image
                    src={prod.image || "/images/products/1228429.jpg"}
                    alt={prod.name}
                    fill
                    sizes="40px"
                    className="object-contain p-1"
                  />
                </div>
                <div className="min-w-0 max-w-[140px] sm:max-w-[180px]">
                  <p className="font-medium text-[13px] text-black truncate">
                    {prod.name}
                  </p>
                  <p className="text-[11px] font-mono text-neutral-500">
                    {currencySymbol}{prod.price}
                  </p>
                </div>
              </div>

              {/* Stock count & restock buttons */}
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-none border ${
                    isCritical
                      ? "text-rose-700 bg-rose-50 border-rose-200"
                      : "text-amber-700 bg-amber-50 border-amber-200"
                  }`}
                >
                  {prod.stock} left
                </span>

                <button
                  type="button"
                  disabled={isRestocking}
                  onClick={() => handleQuickRestock(prod.id, 25)}
                  className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-black hover:text-white text-black text-[11px] font-mono font-medium rounded-none border border-neutral-300 hover:border-black transition-colors disabled:opacity-50"
                  title="Quick Restock +25 Units"
                >
                  {isRestocking ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-[#007cc3]" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  <span>+25</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
