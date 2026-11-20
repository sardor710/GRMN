"use client";

import Link from "next/link";

interface DashboardHeaderProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
}

/** Legacy JSON dashboard title row: the page name, a refresh and a shortcut to the product list. */
export function DashboardHeader({ onRefresh, isRefreshing = false }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="g-heading g-h2 text-black">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Totals from the JSON store. Exports are unavailable.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRefresh} disabled={isRefreshing} className="g-btn g-btn--secondary">
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
        <Link href="/admin/products" className="g-btn g-btn--black">Add Product</Link>
      </div>
    </div>
  );
}
