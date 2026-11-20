"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatCount, formatKzt } from "@/lib/money";
import type { CMSProduct } from "@/lib/cms/types";

interface LowStockAlertsProps {
  products: CMSProduct[];
  onRestockProduct: (productId: string, addedStock: number) => Promise<void>;
}

/** Legacy JSON dashboard: the four products with the least stock and a +25 restock. */
export function LowStockAlerts({ products, onRestockProduct }: LowStockAlertsProps) {
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
    <section aria-label="Low stock" className="border border-garmin-control p-4">
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-garmin-rule pb-3.5">
        <h2 className="text-sm font-medium tracking-[0.64px] text-black">Low stock</h2>
        <Link href="/admin/products" className="text-sm tracking-[0.64px] text-black underline hover:no-underline">Products</Link>
      </div>

      {lowStockItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products yet.</p>
      ) : (
        <ul className="divide-y divide-garmin-rule text-sm">
          {lowStockItems.map((prod) => {
            const isRestocking = restockingId === prod.id;
            return (
              <li key={prod.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden border border-garmin-control bg-white">
                    <Image src={prod.image || "/images/products/1228429.jpg"} alt="" fill sizes="40px" className="object-contain p-1" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate">{prod.name}</p>
                    <p className="tabular-nums text-muted-foreground">{formatKzt({ major: prod.price }, "en")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`font-bold tabular-nums ${prod.stock <= 10 ? "text-garmin-error" : "text-black"}`}>{formatCount(prod.stock)} left</span>
                  <button
                    type="button"
                    disabled={isRestocking}
                    onClick={() => handleQuickRestock(prod.id, 25)}
                    aria-label={`Restock ${prod.name} by 25 units`}
                    className="g-btn g-btn--secondary g-btn--sm"
                  >
                    {isRestocking ? "Saving…" : "+25"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
