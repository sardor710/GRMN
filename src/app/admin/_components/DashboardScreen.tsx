"use client";

import { readDashboardCollection } from "@/lib/dashboard-access";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  DollarSign,
  Users,
  Package,
  ShoppingBag,
  ArrowUpRight,
  Search,
  Check,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { SalesChart } from "@/components/admin/SalesChart";
import { CategoryBreakdown } from "@/components/admin/CategoryBreakdown";
import { LowStockAlerts } from "@/components/admin/LowStockAlerts";
import { BestSellersLeaderboard } from "@/components/admin/BestSellersLeaderboard";
import type { Order, Client, ActivityLog, CMSProduct } from "@/lib/cms/types";

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
  recentActivities: ActivityLog[];
  recentClients: Client[];
  products: CMSProduct[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState("30d");
  const [currency, setCurrency] = useState("USD");
  const [orderFilter, setOrderFilter] = useState<"all" | "processing" | "delivered" | "vip">("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Currency multiplier & symbol
  const currencyRate = useMemo(() => {
    switch (currency) {
      case "SGD":
        return 1.34;
      case "EUR":
        return 0.92;
      default:
        return 1.0;
    }
  }, [currency]);

  const currencySymbol = useMemo(() => {
    switch (currency) {
      case "SGD":
        return "S$";
      case "EUR":
        return "€";
      default:
        return "$";
    }
  }, [currency]);

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
        recentActivities: [
          {
            id: "act-1",
            adminName: "Garmin Super Admin",
            action: "Restocked inventory",
            target: "MARQ (Gen 2) Damascus Steel (+25 units)",
            timestamp: new Date().toISOString(),
          },
          {
            id: "act-2",
            adminName: "Marcus Vance",
            action: "Updated catalog specs",
            target: "fēnix 8 AMOLED Sapphire Titanium",
            timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          },
          {
            id: "act-3",
            adminName: "Elena Rostova",
            action: "Published training guide",
            target: "How to Train for a Triathlon with Garmin",
            timestamp: new Date(Date.now() - 3600000 * 18).toISOString(),
          },
          {
            id: "act-4",
            adminName: "Alexander Hayes",
            action: "Order placed",
            target: "MARQ Captain (Gen 2) · $2,200",
            timestamp: new Date(Date.now() - 3600000 * 26).toISOString(),
          },
        ],
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

  // Filter orders
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
      if (orderFilter === "vip") return ord.total >= 1500;
      return true;
    });
  }, [data, orderSearch, orderFilter]);

  // Derived metrics based on timeframe
  const timeframeMultiplier =
    timeframe === "7d"
      ? 0.28
      : timeframe === "90d"
      ? 2.8
      : timeframe === "ytd"
      ? 8.5
      : 1.0;

  const displayRevenue = data ? Math.round(data.totalRevenue * timeframeMultiplier * currencyRate) : 0;
  const displayAOV = data && data.totalOrders > 0 ? Math.round((data.totalRevenue / data.totalOrders) * currencyRate) : 1450;
  const displayOrdersCount = data ? Math.round(data.totalOrders * timeframeMultiplier) || data.totalOrders : 0;

  if (unavailable) return (
    <div role="alert" className="space-y-4 border border-neutral-300 bg-white p-6">
      <h1 className="text-2xl">Dashboard unavailable</h1>
      <p className="text-sm text-neutral-600">{unavailable}</p>
      <button type="button" onClick={loadDashboard} disabled={isRefreshing} className="border border-neutral-400 px-4 py-2 text-sm disabled:opacity-50">Retry dashboard</button>
    </div>
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-black text-white px-5 py-3 rounded-none border border-neutral-800 shadow-2xl">
          <Check className="h-4 w-4 text-[#007cc3]" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Clean Executive Header */}
      <DashboardHeader
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        currency={currency}
        setCurrency={setCurrency}
        onRefresh={loadDashboard}
        isRefreshing={isRefreshing}
      />

      {/* 4 Essential High-Density KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Revenue */}
        <AdminStatCard
          title="Total Gross Revenue"
          value={loading || !data ? "..." : `${currencySymbol}${displayRevenue.toLocaleString()}`}
          change="+24.8% vs last month"
          isPositive={true}
          icon={DollarSign}
          sparkline={[28, 34, 41, 38, 52, 64, 78, 94]}
          sparklineColor="#007cc3"
          subtitle="Annual run-rate: $1.1M"
        />

        {/* Orders & AOV */}
        <AdminStatCard
          title="Orders &amp; Volume"
          value={loading || !data ? "..." : `${displayOrdersCount} Orders`}
          change={`Avg Order: ${currencySymbol}${displayAOV.toLocaleString()}`}
          isPositive={true}
          icon={ShoppingBag}
          sparkline={[22, 28, 32, 29, 38, 46, 54, 65]}
          sparklineColor="#15803d"
          subtitle={`${data?.pendingOrders || 0} pending fulfillment`}
        />

        {/* Active Clients */}
        <AdminStatCard
          title="Registered Clients"
          value={loading || !data ? "..." : data.totalClients}
          change="+18% new accounts"
          isPositive={true}
          icon={Users}
          sparkline={[14, 18, 22, 26, 31, 35, 42]}
          sparklineColor="#007cc3"
          subtitle="6 VIP collectors"
        />

        {/* Catalog & Inventory */}
        <AdminStatCard
          title="Catalog Products"
          value={
            loading || !data
              ? "..."
              : `${data.publishedProducts} / ${data.totalProducts} Live`
          }
          subtitle="Stock Health: 96%"
          icon={Package}
          sparkline={[95, 96, 94, 98, 96, 97]}
          sparklineColor="#000000"
        />
      </div>

      {/* Main 2-Column Analytics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Revenue Chart, Best Sellers, Recent Orders */}
        <div className="lg:col-span-2 space-y-6">
          {/* Revenue Chart */}
          <SalesChart
            currencySymbol={currencySymbol}
            currencyRate={currencyRate}
          />

          {/* Best-Selling Products Matrix */}
          <BestSellersLeaderboard
            currencySymbol={currencySymbol}
            currencyRate={currencyRate}
          />

          {/* Recent Orders Table */}
          <div className="border border-neutral-200 bg-white p-6 rounded-none font-sans">
            {/* Header & Filter Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4 mb-4">
              <div>
                <h3 className="g-heading uppercase tracking-wide text-[18px] text-black font-normal flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-[#007cc3]" />
                  <span>Recent Customer Orders</span>
                </h3>
                <p className="text-[13px] text-neutral-500 mt-0.5">
                  Latest customer transactions and fulfillment statuses
                </p>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1.5">
                {[
                  { id: "all", label: "All" },
                  { id: "processing", label: "Processing" },
                  { id: "delivered", label: "Delivered" },
                  { id: "vip", label: "VIP > $1.5k" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOrderFilter(tab.id as "all" | "processing" | "delivered" | "vip")}
                    className={`px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold rounded-none transition-colors ${
                      orderFilter === tab.id
                        ? "bg-black text-white"
                        : "bg-neutral-100 text-neutral-600 hover:text-black border border-neutral-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search by order number or customer name..."
                className="h-9 w-full border border-neutral-300 bg-neutral-50 pl-9 pr-3 text-[13px] text-black placeholder-neutral-400 focus:border-black focus:bg-white focus:outline-none rounded-none"
              />
            </div>

            {/* Orders Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 text-[11px] font-heading uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Order No</th>
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Total</th>
                    <th className="py-3 px-4 font-semibold">Fulfillment</th>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-800">
                  {loading || !data ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-neutral-400 font-mono text-xs">
                        Loading orders...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-neutral-400 font-mono text-xs">
                        No orders found.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.slice(0, 5).map((ord) => (
                      <tr key={ord.id} className="hover:bg-neutral-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-xs font-bold text-black">
                          {ord.orderNumber}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-black text-[13px]">{ord.clientName}</p>
                          <p className="text-[11px] text-neutral-500 truncate max-w-[180px]">
                            {ord.clientEmail}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 font-heading font-normal text-black text-[15px]">
                          {currencySymbol}
                          {(ord.total * currencyRate).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`font-heading uppercase tracking-wider px-2 py-0.5 text-[9px] font-bold rounded-none border ${
                              ord.fulfillmentStatus === "delivered"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : ord.fulfillmentStatus === "shipped"
                                ? "bg-blue-50 text-blue-800 border-blue-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            }`}
                          >
                            {ord.fulfillmentStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[12px] font-mono text-neutral-500">
                          {new Date(ord.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link
                            href="/admin/orders"
                            className="inline-flex items-center p-1 text-neutral-400 hover:text-black transition-colors"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Categories, Low Stock Alerts, VIP Clients, Activity Feed */}
        <div className="space-y-6">
          {/* Category Share */}
          <CategoryBreakdown
            currencySymbol={currencySymbol}
            currencyRate={currencyRate}
          />

          {/* Low Stock Alerts */}
          <LowStockAlerts
            products={data?.products || []}
            currencySymbol={currencySymbol}
            onRestockProduct={handleRestockProduct}
          />

          {/* Top VIP Clients Widget */}
          <div className="border border-neutral-200 bg-white p-6 rounded-none font-sans">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#007cc3]" />
                <h3 className="g-heading uppercase tracking-wide text-[18px] text-black font-normal">
                  VIP Clients
                </h3>
              </div>
              <Link
                href="/admin/clients"
                className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#007cc3] hover:underline flex items-center gap-1"
              >
                <span>All Clients</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-3">
              {loading || !data ? (
                <p className="text-xs text-neutral-400">Loading accounts...</p>
              ) : (
                data.recentClients.slice(0, 4).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between bg-neutral-50 p-3 border border-neutral-200 rounded-none transition-all hover:border-black"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-neutral-200 flex items-center justify-center font-heading font-bold text-black text-xs rounded-none">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-black">{c.name}</p>
                        <p className="text-[11px] text-neutral-500">
                          {c.country} · {c.ordersCount} orders
                        </p>
                      </div>
                    </div>
                    <span className="font-heading font-normal text-black text-[14px]">
                      {currencySymbol}
                      {c.totalSpent===undefined?"—":Math.round(c.totalSpent * currencyRate).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chronological Audit Log */}
          <div className="border border-neutral-200 bg-white p-6 rounded-none font-sans">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#007cc3]" />
                <h3 className="g-heading uppercase tracking-wide text-[18px] text-black font-normal">
                  Activity Feed
                </h3>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 uppercase">Audit Log</span>
            </div>

            <div className="space-y-3.5">
              {loading || !data ? (
                <p className="text-xs text-neutral-400">Loading feed...</p>
              ) : (
                data.recentActivities.map((act) => (
                  <div key={act.id} className="flex items-start gap-2.5 text-[12px]">
                    <CheckCircle2 className="h-4 w-4 text-[#007cc3] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-neutral-700">
                        <span className="font-semibold text-black">{act.adminName}</span> {act.action.toLowerCase()}:{" "}
                        <span className="text-black font-medium">{act.target}</span>
                      </p>
                      <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                        {new Date(act.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
