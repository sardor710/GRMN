"use client";

import { readDashboardCollection } from "@/lib/dashboard-access";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { LowStockAlerts } from "@/components/admin/LowStockAlerts";
import { formatCount, formatKzt } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Order, Client, CMSProduct } from "@/lib/cms/types";

// Legacy JSON mode dashboard. Task 5b.1: it shows only what the store file holds (paid order totals,
// counts, recent orders, low stock, recent clients) in the same Garmin styling as the PostgreSQL
// ReportsScreen. The invented charts, growth percentages, currency switcher and activity feed are gone.

interface DashboardData {
  totalRevenue: number;
  totalClients: number;
  totalProducts: number;
  publishedProducts: number;
  activeDiscounts: number;
  publishedBlogs: number;
  totalOrders: number;
  pendingOrders: number;
  recentOrders: Order[];
  recentClients: Client[];
  products: CMSProduct[];
}

type OrderFilter = "all" | "processing" | "delivered";
const ORDER_FILTERS: { id: OrderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "processing", label: "Processing" },
  { id: "delivered", label: "Delivered" },
];
const kzt = (value: number) => formatKzt({ major: value }, "en");

function Tile({ title, value, foot }: { title: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="border border-garmin-control p-4">
      <p className="text-sm font-medium tracking-[0.64px] text-black">{title}</p>
      <div className="mt-2 text-2xl font-bold leading-[30px] tabular-nums text-black">{value}</div>
      {foot && <div className="mt-1 text-sm text-muted-foreground">{foot}</div>}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="border border-garmin-control p-4">
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-garmin-rule pb-3.5">
        <h2 className="font-sans text-sm font-medium tracking-[0.64px] text-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadDashboard = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setUnavailable(null);
      const [ordersRes, clientsRes, productsRes, discountsRes, blogsRes] =
        await Promise.all([
          fetch("/api/admin/orders"),
          fetch("/api/admin/clients"),
          fetch("/api/admin/products"),
          fetch("/api/admin/discounts"),
          fetch("/api/admin/blogs"),
        ]);

      const [orders, clients, products, discounts, blogs] = await Promise.all([
        readDashboardCollection<Order>(ordersRes, "orders"),
        readDashboardCollection<Client>(clientsRes, "clients"),
        readDashboardCollection<CMSProduct>(productsRes, "products"),
        readDashboardCollection<{ status: string }>(discountsRes, "discounts"),
        readDashboardCollection<{ status: string }>(blogsRes, "blogs"),
      ]);

      const totalRev = orders
        .filter((o) => o.paymentStatus === "paid")
        .reduce((sum, o) => sum + o.total, 0);

      setData({
        totalRevenue: totalRev,
        totalClients: clients.length,
        totalProducts: products.length,
        publishedProducts: products.filter((p: { status: string }) => p.status === "published").length,
        activeDiscounts: discounts.filter((d: { status: string }) => d.status === "active").length,
        publishedBlogs: blogs.filter((b: { status: string }) => b.status === "published").length,
        totalOrders: orders.length,
        pendingOrders: orders.filter((o) => o.fulfillmentStatus === "processing").length,
        recentOrders: orders,
        recentClients: clients,
        products,
      });
    } catch (err) {
      setData(null);
      setUnavailable(err instanceof Error ? err.message : "Dashboard data is currently unavailable.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Quick restock action
  const handleRestockProduct = async (productId: string, addedStock: number) => {
    if (!data) return;
    try {
      const target = data.products.find((p) => p.id === productId);
      if (!target) return;

      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(Object.entries(target).filter(([key]) => key !== "createdAt")),
          stock: target.stock + addedStock,
        }),
      });

      if (res.ok) {
        setData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            products: prev.products.map((p) =>
              p.id === productId ? { ...p, stock: p.stock + addedStock } : p
            ),
          };
        });
        showToast(`Restocked ${target.name} (+${addedStock} units)`);
      }
    } catch (err) {
      console.error("Failed to restock:", err);
      showToast("Error updating stock.");
    }
  };

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    return data.recentOrders.filter((ord) => {
      const matchSearch =
        ord.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
        ord.clientName.toLowerCase().includes(orderSearch.toLowerCase()) ||
        ord.clientEmail.toLowerCase().includes(orderSearch.toLowerCase());

      if (!matchSearch) return false;

      if (orderFilter === "processing") return ord.fulfillmentStatus === "processing";
      if (orderFilter === "delivered") return ord.fulfillmentStatus === "delivered" || ord.fulfillmentStatus === "shipped";
      return true;
    });
  }, [data, orderSearch, orderFilter]);

  if (unavailable) return (
    <div role="alert" className="space-y-4 border border-garmin-control bg-white p-6">
      <h1 className="g-heading g-h2 text-black">Dashboard unavailable</h1>
      <p className="text-sm text-muted-foreground">{unavailable}</p>
      <button type="button" onClick={loadDashboard} disabled={isRefreshing} className="g-btn g-btn--secondary">Retry dashboard</button>
    </div>
  );

  const pending = loading || !data;

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div role="status" className="fixed bottom-6 right-6 z-50 bg-black px-5 py-3 text-sm text-white">
          {toastMessage}
        </div>
      )}

      <DashboardHeader onRefresh={loadDashboard} isRefreshing={isRefreshing} />

      <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile title="Revenue" value={pending ? "…" : kzt(data.totalRevenue)} foot="Paid orders in the store file" />
        <Tile title="Orders" value={pending ? "…" : formatCount(data.totalOrders)} foot={pending ? null : `${formatCount(data.pendingOrders)} processing`} />
        <Tile title="Clients" value={pending ? "…" : formatCount(data.totalClients)} />
        <Tile title="Products" value={pending ? "…" : formatCount(data.publishedProducts)} foot={pending ? null : `published of ${formatCount(data.totalProducts)}`} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title="Recent orders"
            action={<Link href="/admin/orders" className="text-sm tracking-[0.64px] text-black underline hover:no-underline">All orders</Link>}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div role="group" aria-label="Fulfillment filter" className="flex gap-2">
                {ORDER_FILTERS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={orderFilter === tab.id}
                    onClick={() => setOrderFilter(tab.id)}
                    className={cn("g-btn g-btn--sm", orderFilter === tab.id ? "g-btn--black" : "g-btn--secondary")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <input
                type="search"
                aria-label="Search orders"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Order number or customer"
                className="h-10 w-full border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none sm:w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-muted text-xs font-bold tracking-[-0.2px] text-black">
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Fulfillment</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-garmin-rule">
                  {pending ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading orders…</td></tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No orders found.</td></tr>
                  ) : (
                    filteredOrders.slice(0, 5).map((ord) => (
                      <tr key={ord.id}>
                        <td className="px-3 py-3 font-bold tabular-nums">{ord.orderNumber}</td>
                        <td className="px-3 py-3">
                          <p>{ord.clientName}</p>
                          <p className="max-w-[180px] truncate text-muted-foreground">{ord.clientEmail}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums">{kzt(ord.total)}</td>
                        <td className="px-3 py-3 capitalize">{ord.fulfillmentStatus}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">
                          {new Date(ord.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <LowStockAlerts products={data?.products || []} onRestockProduct={handleRestockProduct} />

          <Card
            title="Recent clients"
            action={<Link href="/admin/clients" className="text-sm tracking-[0.64px] text-black underline hover:no-underline">All clients</Link>}
          >
            {pending ? (
              <p className="text-sm text-muted-foreground">Loading clients…</p>
            ) : data.recentClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients yet.</p>
            ) : (
              <ul className="divide-y divide-garmin-rule text-sm">
                {data.recentClients.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate">{c.name}</p>
                      <p className="text-muted-foreground">{c.country} · {formatCount(c.ordersCount ?? 0)} {c.ordersCount === 1 ? "order" : "orders"}</p>
                    </div>
                    <span className="whitespace-nowrap font-bold tabular-nums">{c.totalSpent === undefined ? "—" : kzt(c.totalSpent)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
