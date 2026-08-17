"use client";

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
      const [ordersRes, clientsRes, productsRes, discountsRes, blogsRes] =
        await Promise.all([
          fetch("/api/admin/orders"),
          fetch("/api/admin/clients"),
          fetch("/api/admin/products"),
          fetch("/api/admin/discounts"),
          fetch("/api/admin/blogs"),
        ]);

      const ordersData = await ordersRes.json();
      const clientsData = await clientsRes.json();
      const productsData = await productsRes.json();
      const discountsData = await discountsRes.json();
      const blogsData = await blogsRes.json();

      const orders: Order[] = ordersData.orders || [];
      const clients: Client[] = clientsData.clients || [];
      const products: CMSProduct[] = productsData.products || [];
      const discounts = discountsData.discounts || [];
      const blogs = blogsData.blogs || [];

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
            action: "Order Placed",
            target: "MARQ Captain (Gen 2) · $2,200",
            timestamp: new Date(Date.now() - 3600000 * 26).toISOString(),
          },
        ],
        recentClients: clients,
        products: products,
      });
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Quick Restock
  const handleRestockProduct = async (productId: string, addedStock: number) => {
    if (!data) return;
    const target = data.products.find((p) => p.id === productId);
    if (!target) return;

    const newStock = (target.stock || 0) + addedStock;

    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          stock: newStock,
        }),
      });

      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          const updated = prev.products.map((p) =>
            p.id === productId ? { ...p, stock: newStock } : p
          );
          return {
            ...prev,
            products: updated,
            recentActivities: [
              {
                id: `act-${Date.now()}`,
                adminName: "Garmin Admin",
                action: "Restocked inventory",
                target: `${target.name} (+${addedStock} units)`,
                timestamp: new Date().toISOString(),
              },
              ...prev.recentActivities,
            ],
          };
        });
        showToast(`Restocked ${target.name} (+${addedStock} units)`);
      }
    } catch (err) {
      console.error("Failed to restock:", err);
      showToast("Error updating stock.");
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!data) return;
    const headers = "OrderNumber,ClientName,ClientEmail,Total,PaymentStatus,FulfillmentStatus,Date\n";
    const rows = data.recentOrders
      .map(
        (o) =>
          `"${o.orderNumber}","${o.clientName}","${o.clientEmail}","${o.total}","${o.paymentStatus}","${o.fulfillmentStatus}","${o.createdAt}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Garmin_Orders_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Orders exported to CSV.");
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

  return (
    <div className="space-y-6 font-sans">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#121620] border border-[#007cc3] text-white px-4 py-3 rounded shadow-2xl">
          <Check className="h-4 w-4 text-[#00a0df]" />
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
        onExportCSV={handleExportCSV}
      />

      {/* 4 Essential High-Density KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          sparklineColor="#22c55e"
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
          sparklineColor="#8b5cf6"
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
          sparklineColor="#06b6d4"
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
          <div className="border border-[#232836] bg-[#12151e] p-5 rounded font-sans">
            {/* Header & Filter Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e2330] pb-4 mb-4">
              <div>
                <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-[#007cc3]" />
                  <span>Recent Customer Orders</span>
                </h3>
                <p className="text-[12px] text-[#8a92a3] mt-0.5">
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
                    className={`px-2.5 py-1 text-[10px] font-heading uppercase tracking-wider font-bold rounded transition-colors ${
                      orderFilter === tab.id
                        ? "bg-[#007cc3] text-white"
                        : "bg-[#171b26] text-[#8a92a3] hover:text-white border border-[#232836]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#737b8c]" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search by order number or customer name..."
                className="h-8 w-full border border-[#232836] bg-[#0c0e14] pl-9 pr-3 text-xs text-white placeholder-[#555f73] focus:border-[#007cc3] focus:outline-none rounded"
              />
            </div>

            {/* Orders Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#1e2330] bg-[#0c0e14] text-[#737b8c] text-[10px] font-heading uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-bold">Order No</th>
                    <th className="py-2.5 px-3 font-bold">Customer</th>
                    <th className="py-2.5 px-3 font-bold">Total</th>
                    <th className="py-2.5 px-3 font-bold">Fulfillment</th>
                    <th className="py-2.5 px-3 font-bold">Date</th>
                    <th className="py-2.5 px-3 font-bold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2330] text-[#c0c7d4]">
                  {loading || !data ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#737b8c] font-mono text-xs">
                        Loading orders...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#737b8c] font-mono text-xs">
                        No orders found.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.slice(0, 5).map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#171c26] transition-colors">
                        <td className="py-3 px-3 font-mono text-xs font-bold text-white">
                          {ord.orderNumber}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-medium text-white text-[13px]">{ord.clientName}</p>
                          <p className="text-[11px] text-[#737b8c] truncate max-w-[180px]">
                            {ord.clientEmail}
                          </p>
                        </td>
                        <td className="py-3 px-3 font-heading font-bold text-white text-sm">
                          {currencySymbol}
                          {(ord.total * currencyRate).toFixed(2)}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`font-heading uppercase tracking-wider px-2 py-0.5 text-[9px] font-bold rounded border ${
                              ord.fulfillmentStatus === "delivered"
                                ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                                : ord.fulfillmentStatus === "shipped"
                                ? "bg-blue-950/40 text-blue-400 border-blue-500/30"
                                : "bg-amber-950/40 text-amber-400 border-amber-500/30"
                            }`}
                          >
                            {ord.fulfillmentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[11px] font-mono text-[#8a92a3]">
                          {new Date(ord.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href="/admin/orders"
                            className="inline-flex items-center p-1 text-[#737b8c] hover:text-white transition-colors"
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

        {/* Right 1 Column: Categories, Low Stock Alerts, Recent Activity */}
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
          <div className="border border-[#232836] bg-[#12151e] p-5 rounded font-sans">
            <div className="flex items-center justify-between border-b border-[#1e2330] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#007cc3]" />
                <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">
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

            <div className="space-y-2.5">
              {loading || !data ? (
                <p className="text-xs text-[#737b8c]">Loading accounts...</p>
              ) : (
                data.recentClients.slice(0, 4).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between bg-[#171b26] p-2.5 border border-[#232938] rounded transition-all hover:border-[#384257]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 bg-[#232834] flex items-center justify-center font-heading font-bold text-white text-xs border border-[#2f3545] rounded">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-white">{c.name}</p>
                        <p className="text-[11px] text-[#8a92a3]">
                          {c.country} · {c.ordersCount} orders
                        </p>
                      </div>
                    </div>
                    <span className="font-heading font-bold text-white text-[13px]">
                      {currencySymbol}
                      {Math.round(c.totalSpent * currencyRate).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chronological Audit Log */}
          <div className="border border-[#232836] bg-[#12151e] p-5 rounded font-sans">
            <div className="flex items-center justify-between border-b border-[#1e2330] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#007cc3]" />
                <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">
                  Activity Feed
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#737b8c]">Audit Log</span>
            </div>

            <div className="space-y-3">
              {loading || !data ? (
                <p className="text-xs text-[#737b8c]">Loading feed...</p>
              ) : (
                data.recentActivities.map((act) => (
                  <div key={act.id} className="flex items-start gap-2.5 text-[12px]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#007cc3] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[#c0c7d4]">
                        <span className="font-semibold text-white">{act.adminName}</span> {act.action.toLowerCase()}:{" "}
                        <span className="text-[#e2e8f0] font-medium">{act.target}</span>
                      </p>
                      <p className="text-[10px] text-[#737b8c] font-mono mt-0.5">
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
