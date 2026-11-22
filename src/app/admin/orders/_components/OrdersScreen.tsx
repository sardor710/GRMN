"use client";

import { formatCount, formatRecordAmount } from "@/lib/money";
import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Search,
  Eye,
  Check,
  LayoutGrid,
  List,
  Calendar,
  MapPin,
  ExternalLink,
  Tag,
  Phone,
  Mail,
} from "lucide-react";
import type { Order, FulfillmentStatus } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  generateOrderMilestones,
  formatOrderDate,
  calculateOrderRouteProgress,
} from "@/lib/cms/order-lifecycle";
import {
  ORDER_STATUS_COLUMNS,
  isOrderCompleted,
  filterOrdersByStatuses,
  filterOrdersByDateRange,
} from "@/lib/cms/order-filters";
import { Button, StatusSelect } from "@/components/admin/ui";

const FULFILLMENT_STATUSES: FulfillmentStatus[] = ["new", "processing", "shipped", "delivered", "canceled", "returned"];

type DateRangePreset = "all" | "week" | "month" | "ytd" | "custom";
type ViewMode = "board" | "list";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("board");

  // Multi-select Status Filter (all enabled by default)
  const [selectedStatuses, setSelectedStatuses] = useState<FulfillmentStatus[]>([
    "new",
    "processing",
    "shipped",
    "delivered",
    "canceled",
    "returned",
  ]);

  // Date Filter State
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Modal and Interactive State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);


  // Drag and Drop State
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<FulfillmentStatus | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/orders");
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch (err) {
      console.error("Error loading orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: FulfillmentStatus) => {
    try {
      const order = orders.find((o) => o.id === id);
      if (!order) return;
      if (order.fulfillmentStatus === newStatus) return;

      const updated = {
        ...order,
        fulfillmentStatus: newStatus,
      };

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? updated : o))
      );
      if (selectedOrder && selectedOrder.id === id) {
        setSelectedOrder(updated);
      }

      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, fulfillmentStatus: newStatus }),
      });

      if (res.ok) {
        showToast(`Order ${order.orderNumber} status updated to ${newStatus.toUpperCase()}`);
      } else {
        // Rollback on failure
        fetchOrders();
        showToast("Failed to persist order status to server.");
      }
    } catch (err) {
      console.error("Failed to update status:", err);
      fetchOrders();
    }
  };

  // Toggle individual status filter button
  const toggleStatusFilter = (st: FulfillmentStatus) => {
    setSelectedStatuses((prev) => {
      const isSelected = prev.includes(st);
      if (isSelected) {
        // Don't allow empty if only one remaining, or allow empty meaning none
        return prev.filter((s) => s !== st);
      } else {
        return [...prev, st];
      }
    });
  };

  const selectAllStatuses = () => {
    setSelectedStatuses(["new", "processing", "shipped", "delivered", "canceled", "returned"]);
  };

  const clearAllStatuses = () => {
    setSelectedStatuses([]);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData("text/plain", orderId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedOrderId(orderId);
  };

  const handleDragEnd = () => {
    setDraggedOrderId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: FulfillmentStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, colId: FulfillmentStatus) => {
    // Only clear if leaving the drop container
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverColumn === colId) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, colId: FulfillmentStatus) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData("text/plain") || draggedOrderId;
    if (orderId) {
      handleUpdateStatus(orderId, colId);
    }
    setDragOverColumn(null);
    setDraggedOrderId(null);
  };

  // Filter Pipeline: Date -> Multi-Status -> Search
  const filteredOrders = useMemo(() => {
    let result = orders;

    // 1. Time / Date Filter
    result = filterOrdersByDateRange(
      result,
      dateRange,
      customStart,
      customEnd
    );

    // 2. Status Multi-select Filter
    result = filterOrdersByStatuses(result, selectedStatuses);

    // 3. Search Filter
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(query) ||
          o.clientName.toLowerCase().includes(query) ||
          o.clientEmail.toLowerCase().includes(query) ||
          (o.shippingAddress && o.shippingAddress.toLowerCase().includes(query)) ||
          (o.trackingNumber && o.trackingNumber.toLowerCase().includes(query))
      );
    }

    return result;
  }, [orders, dateRange, customStart, customEnd, selectedStatuses, search]);

  // Aggregate Metrics based on filtered dataset
  const totalRevenue = useMemo(
    () =>
      filteredOrders
        .filter((o) => o.paymentStatus === "paid")
        .reduce((sum, o) => sum + o.total, 0),
    [filteredOrders]
  );

  const processingCount = useMemo(
    () => filteredOrders.filter((o) => o.fulfillmentStatus === "processing").length,
    [filteredOrders]
  );

  const completedCount = useMemo(
    () => filteredOrders.filter((o) => o.fulfillmentStatus === "delivered").length,
    [filteredOrders]
  );

  // Helper to get status counts across all orders
  const getStatusCount = (statusId: FulfillmentStatus) => {
    return orders.filter(
      (o) =>
        o.fulfillmentStatus === statusId ||
        (statusId === "canceled" && o.fulfillmentStatus === "cancelled")
    ).length;
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div role="status" className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-black px-5 py-3 text-sm text-white">
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="g-heading g-h2 text-black">Orders</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-sans">
            Drag a card to another column to change its fulfillment stage.
          </p>
        </div>

        {/* View Switcher & Export Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* View Mode Toggle: Board vs List */}
          <div className="inline-flex border border-border bg-white p-0.5 rounded-none">
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "board"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:text-black hover:bg-neutral-100"
              }`}
              title="Switch to Kanban Board View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Board View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "list"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:text-black hover:bg-neutral-100"
              }`}
              title="Switch to Table List View"
            >
              <List className="h-3.5 w-3.5" />
              <span>List View</span>
            </button>
          </div>

          <p className="max-w-xs text-xs text-muted-foreground">Exports are unavailable.</p>
        </div>
      </div>

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-border p-5 rounded-none flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-semibold">
              Revenue (filtered)
            </span>
            <p className="mt-1 text-2xl font-bold leading-[30px] tabular-nums text-black">
              {formatRecordAmount(totalRevenue, filteredOrders.length > 0 && filteredOrders.every(o => o.currency === "KZT") ? "KZT" : undefined)}
            </p>
          </div>
        </div>

        <div className="bg-white border border-border p-5 rounded-none flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-semibold">
              Processing
            </span>
            <p className="mt-1 text-2xl font-bold leading-[30px] tabular-nums text-black">
              {formatCount(processingCount)}
            </p>
          </div>
        </div>

        <div className="bg-white border border-border p-5 rounded-none flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-semibold">
              Delivered
            </span>
            <p className="mt-1 text-2xl font-bold leading-[30px] tabular-nums text-black">
              {formatCount(completedCount)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Engine Suite */}
      <div className="border border-border bg-white p-4 rounded-none space-y-4">
        {/* Row 1: Search + Date Presets */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order #, client, email, address, or tracking..."
              className="h-10 w-full border border-border bg-white pl-9 pr-3 text-xs text-black placeholder-neutral-400 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          {/* Time Filter Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Time:
            </span>
            {[
              { id: "all", label: "All Time" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
              { id: "ytd", label: "Year to Date" },
              { id: "custom", label: "Custom Range" },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDateRange(preset.id as DateRangePreset)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors ${
                  dateRange === preset.id
                    ? "bg-black text-white"
                    : "bg-white border border-border text-neutral-600 hover:text-black hover:border-neutral-300"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker (shown when 'custom' is selected) */}
        {dateRange === "custom" && (
          <div className="flex items-center gap-3 pt-2 border-t border-neutral-100 flex-wrap text-xs">
            <span className="text-muted-foreground font-semibold">Date Window:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground font-medium">From</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 border border-border bg-white px-2 text-xs text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground font-medium">To</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 border border-border bg-white px-2 text-xs text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
            {(customStart || customEnd) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStart("");
                  setCustomEnd("");
                }}
                className="text-xs text-muted-foreground hover:text-black underline ml-2"
              >
                Reset Dates
              </button>
            )}
          </div>
        )}

        {/* Row 2: Multi-Select Toggle Status Buttons */}
        <div className="pt-2 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
Status
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllStatuses}
                className="text-xs font-semibold uppercase text-garmin-blue hover:underline"
              >
                Select All
              </button>
              <span className="text-neutral-300">вЂў</span>
              <button
                type="button"
                onClick={clearAllStatuses}
                className="text-xs font-semibold uppercase text-muted-foreground hover:text-black"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {ORDER_STATUS_COLUMNS.map((col) => {
              const isOn = selectedStatuses.includes(col.id);
              const count = getStatusCount(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => toggleStatusFilter(col.id)}
                  className={`flex items-center justify-between p-2.5 text-xs font-semibold rounded-none border transition-colors ${
                    isOn
                      ? "bg-black text-white border-black ring-1 ring-black"
                      : "bg-neutral-50 text-muted-foreground border-border hover:border-neutral-300 hover:text-black"
                  }`}
                  title={`Toggle ${col.label} status filter`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className={`h-2 w-2 rounded-garmin-pill shrink-0 ${
                        isOn ? "bg-black" : "bg-neutral-300"
                      }`}
                    />
                    <span className="text-xs">{col.label}</span>
                  </span>
                  <span
                    className={`text-xs tabular-nums px-1.5 py-0.5 rounded-none ${
                      isOn ? "bg-neutral-800 text-white" : "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Filter Count Status Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing <strong className="text-black">{filteredOrders.length}</strong> of {orders.length} orders
          {selectedStatuses.length < 6 && (
            <span className="ml-1 text-muted-foreground">
              ({selectedStatuses.length} of 6 statuses active)
            </span>
          )}
        </span>
        {viewMode === "board" && (
          <span className="text-xs text-muted-foreground italic">
            Tip: Drag and drop any card into another column to update order status instantly.
          </span>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. KANBAN BOARD VIEW (DRAG AND DROP)                     */}
      {/* ======================================================== */}
      {viewMode === "board" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start">
          {ORDER_STATUS_COLUMNS.map((col) => {
            const colOrders = filteredOrders.filter(
              (o) =>
                o.fulfillmentStatus === col.id ||
                (col.id === "canceled" && o.fulfillmentStatus === "cancelled")
            );
            const isDragTarget = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={(e) => handleDragLeave(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`bg-white border rounded-none flex flex-col transition-colors min-h-[500px] ${
                  isDragTarget
                    ? "border-black bg-neutral-100/90 ring-2 ring-black"
                    : "border-neutral-200"
                }`}
              >
                {/* Column Header */}
                <div className="p-3 border-b border-border bg-neutral-50/80 flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-sans text-xs font-bold text-black truncate">
                      {col.label}
                    </span>
                  </div>
                  <span className="text-xs tabular-nums font-bold bg-white border border-border px-2 py-0.5 text-black rounded-none shadow-2xs">
                    {colOrders.length}
                  </span>
                </div>

                {/* Drop Zone / Orders Card Stack */}
                <div className="p-2 space-y-2.5 flex-1 overflow-y-auto max-h-[750px]">
                  {loading ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">Loading...</div>
                  ) : colOrders.length === 0 ? (
                    <div
                      className={`p-6 text-center text-xs border border-dashed rounded-none transition-colors ${
                        isDragTarget
                          ? "border-black bg-white text-black font-semibold"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {isDragTarget ? "Drop order here" : "No orders"}
                    </div>
                  ) : (
                    colOrders.map((ord) => {
                      const isCompleted = isOrderCompleted(ord.fulfillmentStatus);
                      const isBeingDragged = draggedOrderId === ord.id;

                      return (
                        <div
                          key={ord.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, ord.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedOrder(ord)}
                          className={`border rounded-none p-3 cursor-grab active:cursor-grabbing hover:border-black transition-colors bg-white shadow-2xs ${
                            isCompleted ? "opacity-75 bg-neutral-50/50" : ""
                          } ${isBeingDragged ? "opacity-40 border-dashed border-black" : "border-neutral-200"}`}
                        >
                          {/* Card Header: Order Number + Total */}
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="tabular-nums text-xs font-bold text-black">
                              {ord.orderNumber}
                            </span>
                            <span className="whitespace-nowrap text-sm font-bold tabular-nums text-black">
                              {formatRecordAmount(ord.total, ord.currency)}
                            </span>
                          </div>

                          {/* Client Info */}
                          <p className="text-xs font-semibold text-black truncate">
                            {ord.clientName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mb-2">
                            {ord.clientEmail}
                          </p>

                          {/* Items Summary Preview */}
                          <div className="border-t border-neutral-100 pt-2 space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{ord.itemsCount || ord.items?.length || 1} item(s)</span>
                              <span
                                className={`text-xs font-semibold px-1.5 py-0.2 rounded-none border ${
                                  ord.paymentStatus === "paid"
                                    ? "bg-garmin-badge-lime/25 text-black border-garmin-badge-lime"
                                    : "bg-garmin-badge-gold/20 text-black border-garmin-badge-gold"
                                }`}
                              >
                                {ord.paymentStatus}
                              </span>
                            </div>

                            {/* First Item Name Preview */}
                            {ord.items && ord.items[0] && (
                              <p className="text-xs text-neutral-600 truncate italic">
                                {ord.items[0].name}
                              </p>
                            )}
                          </div>

                          {/* Footer: Date & Destination preview */}
                          <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                            <span>
                              {new Date(ord.createdAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            <span className="flex items-center gap-0.5 text-muted-foreground hover:text-black">
                              <Eye className="h-3 w-3" /> Details
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. LIST VIEW (TABLE WITH DROPDOWN AND MUTED COMPLETED)   */}
      {/* ======================================================== */}
      {viewMode === "list" && (
        <div className="border border-border bg-white overflow-hidden rounded-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted text-black text-xs uppercase tracking-[-0.2px]">
                  <th className="py-3 px-4 font-semibold">Order</th>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 text-right font-semibold">Total</th>
                  <th className="py-3 px-4 font-semibold">Payment</th>
                  <th className="py-3 px-4 font-semibold">Fulfillment</th>
                  <th className="py-3 px-4 font-semibold">Delivery</th>
                  <th className="py-3 px-4 font-semibold">Placed</th>
                  <th className="py-3 px-4 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-black">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Loading customer orders...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      No orders matched the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => {
                    const completed = isOrderCompleted(ord.fulfillmentStatus);

                    return (
                      <tr
                        key={ord.id}
                        className={`transition-colors cursor-pointer ${
                          completed
                            ? "bg-neutral-50/70 opacity-65 hover:opacity-100 hover:bg-neutral-100/70"
                            : "hover:bg-neutral-50/90"
                        }`}
                        onClick={(e) => {
                          // Don't trigger modal if interacting with select dropdown
                          if ((e.target as HTMLElement).tagName === "SELECT") return;
                          setSelectedOrder(ord);
                        }}
                      >
                        {/* Order Number */}
                        <td className="py-3.5 px-4 tabular-nums font-bold text-black text-xs">
                          <span className="flex items-center gap-1.5">
                            {ord.orderNumber}
                            {completed && (
                              <span className="text-xs tabular-nums bg-neutral-200 text-neutral-600 px-1 py-0.2 rounded-none font-normal">
                                closed
                              </span>
                            )}
                          </span>
                        </td>

                        {/* Customer */}
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-black">{ord.clientName}</p>
                          <p className="text-xs text-muted-foreground">{ord.clientEmail}</p>
                        </td>

                        {/* Total Amount */}
                        <td className="whitespace-nowrap py-3.5 px-4 text-right text-sm font-bold tabular-nums text-black">
                          {formatRecordAmount(ord.total, ord.currency)}
                        </td>

                        {/* Payment Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`capitalize text-xs font-bold px-2 py-0.5 rounded-none border ${
                              ord.paymentStatus === "paid"
                                ? "bg-garmin-badge-lime/25 text-black border-garmin-badge-lime"
                                : ord.paymentStatus === "refunded"
                                ? "bg-white text-garmin-error border-garmin-error"
                                : "bg-garmin-badge-gold/20 text-black border-garmin-badge-gold"
                            }`}
                          >
                            {ord.paymentStatus}
                          </span>
                        </td>

                        {/* Fulfillment Status Dropdown */}
                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <StatusSelect
                            size="sm"
                            wrapperClassName="inline-block min-w-[140px]"
                            aria-label={`Fulfillment status of ${ord.orderNumber}`}
                            value={ord.fulfillmentStatus}
                            options={FULFILLMENT_STATUSES}
                            onChange={(value) => handleUpdateStatus(ord.id, value as FulfillmentStatus)}
                          />
                        </td>

                        {/* Destination Address */}
                        <td className="py-3.5 px-4 text-xs text-neutral-600 max-w-xs truncate">
                          {ord.shippingAddress}
                        </td>

                        {/* Date Placed */}
                        <td className="py-3.5 px-4 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {new Date(ord.createdAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="p-1.5 text-muted-foreground hover:text-black hover:bg-neutral-100 rounded-none transition-colors"
                            title="Inspect Order Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. ORDER DETAILS POP-UP MODAL (WITH EMBEDDED MAP)        */}
      {/* ======================================================== */}
      {selectedOrder && (
        <AdminModal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          maxWidth="4xl"
          title={`Order ${selectedOrder.orderNumber}`}
          subtitle={`Placed on ${new Date(selectedOrder.createdAt).toLocaleString([], {
            dateStyle: "full",
            timeStyle: "short",
          })}`}
        >
          <div className="space-y-6 font-sans">
            {/* Top Status Summary Bar inside Modal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-neutral-50 border border-border rounded-none">
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <span className="text-xs text-muted-foreground block font-semibold">
                    Payment Status
                  </span>
                  <span
                    className={`capitalize text-xs font-bold px-2 py-0.5 rounded-none border ${
                      selectedOrder.paymentStatus === "paid"
                        ? "bg-garmin-badge-lime/25 text-black border-garmin-badge-lime"
                        : selectedOrder.paymentStatus === "refunded"
                        ? "bg-white text-garmin-error border-garmin-error"
                        : "bg-garmin-badge-gold/20 text-black border-garmin-badge-gold"
                    }`}
                  >
                    {selectedOrder.paymentStatus}
                  </span>
                </div>

                <div className="h-6 w-px bg-neutral-200 hidden sm:block" />

                <div>
                  <span className="text-xs text-muted-foreground block font-semibold">
                    Current Fulfillment
                  </span>
                  <StatusSelect
                    size="sm"
                    wrapperClassName="mt-0.5 min-w-[160px]"
                    aria-label="Current fulfillment status"
                    value={selectedOrder.fulfillmentStatus}
                    options={FULFILLMENT_STATUSES}
                    onChange={(value) => handleUpdateStatus(selectedOrder.id, value as FulfillmentStatus)}
                  />
                </div>
              </div>

              {/* Order Grand Total */}
              <div className="sm:text-right">
                <span className="text-xs text-muted-foreground block font-semibold">
                  Order Total
                </span>
                <span className="text-xl font-bold tabular-nums text-black">
                  {formatRecordAmount(selectedOrder.total, selectedOrder.currency)}
                </span>
              </div>
            </div>

            {/* Fulfillment Lifecycle Process Route Map */}
            {(() => {
              const milestones =
                selectedOrder.milestones && selectedOrder.milestones.length === 5
                  ? selectedOrder.milestones
                  : generateOrderMilestones(selectedOrder);
              const progressPct = calculateOrderRouteProgress(selectedOrder.fulfillmentStatus);
              const isCanceled =
                selectedOrder.fulfillmentStatus === "canceled" ||
                selectedOrder.fulfillmentStatus === "cancelled";

              return (
                <div className="border border-border bg-neutral-50/80 p-4 rounded-none">
                  <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
                    <span className="text-xs font-semibold text-black flex items-center gap-1.5">
Fulfillment
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Carrier: <strong className="text-black">{selectedOrder.carrier || "Garmin Express Priority"}</strong>
                      {selectedOrder.trackingNumber && ` · ${selectedOrder.trackingNumber}`}
                    </span>
                  </div>

                  {!isCanceled ? (
                    <div className="relative mb-2">
                      <div className="absolute top-3.5 left-4 right-4 h-1 bg-neutral-200 -z-0">
                        <div
                          className="h-full bg-garmin-blue transition-colors duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-5 relative z-10">
                        {milestones.map((m, idx) => (
                          <div key={idx} className="flex flex-col items-center text-center px-1">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-garmin-pill border-2 text-xs font-bold ${
                                m.completed
                                  ? "border-garmin-blue bg-garmin-blue text-white"
                                  : m.current
                                  ? "border-garmin-blue bg-white text-garmin-blue ring-2 ring-garmin-blue/30"
                                  : "border-border bg-white text-muted-foreground"
                              }`}
                            >
                              {m.completed ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : idx + 1}
                            </div>
                            <span
                              className={`mt-1.5 text-xs font-bold ${
                                m.completed || m.current ? "text-black" : "text-neutral-400"
                              }`}
                            >
                              {m.label}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums mt-0.5">
                              {formatOrderDate(m.date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-garmin-error font-semibold italic">Order was canceled.</p>
                  )}
                </div>
              );
            })()}

            {/* Customer & Shipping Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Contact Box */}
              <div className="border border-border bg-white p-4 rounded-none space-y-2.5">
                <h4 className="font-sans text-xs font-semibold text-black border-b border-neutral-100 pb-2 flex items-center gap-1.5">
Customer
                </h4>
                <div className="space-y-1.5 text-xs">
                  <p className="text-black font-semibold text-sm">{selectedOrder.clientName}</p>
                  <p className="text-neutral-600 flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`mailto:${selectedOrder.clientEmail}`} className="hover:underline text-garmin-blue">
                      {selectedOrder.clientEmail}
                    </a>
                  </p>
                  {selectedOrder.clientPhone && (
                    <p className="text-neutral-600 flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{selectedOrder.clientPhone}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Shipping Logistics Box */}
              <div className="border border-border bg-white p-4 rounded-none space-y-2.5">
                <h4 className="font-sans text-xs font-semibold text-black border-b border-neutral-100 pb-2 flex items-center gap-1.5">
Shipping address
                </h4>
                <div className="space-y-1.5 text-xs">
                  <p className="text-black flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{selectedOrder.shippingAddress}</span>
                  </p>
                  {selectedOrder.trackingNumber ? (
                    <p className="text-neutral-600 flex items-center gap-1.5 tabular-nums">
                      <span className="text-muted-foreground font-sans text-xs">Tracking:</span>
                      <span className="font-semibold text-black">{selectedOrder.trackingNumber}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No tracking number assigned yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Comments & Staff Notes Section */}
            {(selectedOrder.comments || selectedOrder.notes) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedOrder.comments && (
                  <div className="border border-border bg-neutral-50/60 p-3.5 rounded-none">
                    <h5 className="font-sans text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
Customer note
                    </h5>
                    <p className="text-xs text-neutral-700 leading-relaxed italic">
                      &ldquo;{selectedOrder.comments}&rdquo;
                    </p>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="border border-border bg-neutral-50/60 p-3.5 rounded-none">
                    <h5 className="font-sans text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground" /> Internal Staff Notes
                    </h5>
                    <p className="text-xs text-neutral-700 leading-relaxed">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Address Map Embed Section */}
            <div className="border border-border bg-white rounded-none overflow-hidden">
              <div className="p-3 bg-neutral-50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-black flex items-center gap-1.5">
Map
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedOrder.shippingAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-garmin-blue hover:underline flex items-center gap-1 font-semibold uppercase"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Map Iframe Embed */}
              <div className="relative h-64 w-full bg-neutral-100">
                <iframe
                  title={`Map showing delivery address: ${selectedOrder.shippingAddress}`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight={0}
                  marginWidth={0}
                  src={
                    selectedOrder.coordinates
                      ? `https://www.openstreetmap.org/export/embed.html?bbox=${selectedOrder.coordinates.lng - 0.03}%2C${selectedOrder.coordinates.lat - 0.02}%2C${selectedOrder.coordinates.lng + 0.03}%2C${selectedOrder.coordinates.lat + 0.02}&layer=mapnik&marker=${selectedOrder.coordinates.lat}%2C${selectedOrder.coordinates.lng}`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(selectedOrder.shippingAddress)}&t=&z=14&ie=UTF8&iwloc=&output=embed`
                  }
                  className="w-full h-full border-none filter contrast-105"
                  loading="lazy"
                />
              </div>
              <div className="px-3 py-1.5 bg-neutral-50 border-t border-border text-xs text-muted-foreground tabular-nums flex items-center justify-between">
                <span className="truncate">{selectedOrder.shippingAddress}</span>
                {selectedOrder.coordinates && (
                  <span className="shrink-0 text-muted-foreground">
                    GPS: {selectedOrder.coordinates.lat.toFixed(4)}, {selectedOrder.coordinates.lng.toFixed(4)}
                  </span>
                )}
              </div>
            </div>

            {/* Purchased Product Line Items */}
            <div>
              <p className="text-xs font-semibold text-neutral-700 mb-2">
                Purchased Line Items ({selectedOrder.items?.length || 0})
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto border border-border bg-neutral-50/50 p-2 rounded-none">
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border border-border bg-white p-3 rounded-none shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 relative bg-neutral-50 border border-border p-0.5 shrink-0 overflow-hidden rounded-none">
                          <Image
                            src={item.image || "/images/products/1228429.jpg"}
                            alt={item.name}
                            width={48}
                            height={48}
                            className="object-contain"
                          />
                        </div>
                        <div>
                          <p className="font-semibold text-black text-xs">{item.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            SKU ID: {item.productId}
                          </p>
                          <p className="text-xs text-neutral-600 mt-0.5">
                            {formatRecordAmount(item.price, selectedOrder.currency)} × {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-base font-bold tabular-nums text-black">
                        {formatRecordAmount(item.price * item.quantity, selectedOrder.currency)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="p-4 text-center text-xs text-muted-foreground">No line items recorded.</p>
                )}
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground">
                <span>Order Reference: </span>
                <span className="tabular-nums font-bold text-black">{selectedOrder.id}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="primary" size="md"
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close Window
                </Button>
              </div>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
