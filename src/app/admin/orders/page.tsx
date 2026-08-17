"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  ShoppingBag,
  Search,
  Eye,
  FileSpreadsheet,
  Download,
  Check,
  ChevronDown,
  DollarSign,
  PackageCheck,
  Clock,
} from "lucide-react";
import type { Order, FulfillmentStatus } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  generateOrdersExcelXml,
  generateOrdersCSV,
  downloadExcelFile,
} from "@/lib/export/excel";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

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

      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...order,
          fulfillmentStatus: newStatus,
        }),
      });

      if (res.ok) {
        setOrders(
          orders.map((o) => (o.id === id ? { ...o, fulfillmentStatus: newStatus } : o))
        );
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, fulfillmentStatus: newStatus });
        }
        showToast(`Order ${order.orderNumber} status updated to ${newStatus}`);
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.clientName.toLowerCase().includes(search.toLowerCase()) ||
      o.clientEmail.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "all" || o.fulfillmentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate Metrics
  const totalRevenue = orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);
  const processingCount = orders.filter((o) => o.fulfillmentStatus === "processing").length;
  const completedCount = orders.filter((o) => o.fulfillmentStatus === "delivered").length;

  // Export Handlers
  const handleExportExcelAll = () => {
    const targetOrders = filteredOrders.length > 0 ? filteredOrders : orders;
    const excelContent = generateOrdersExcelXml(targetOrders);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadExcelFile(excelContent, `Garmin_Orders_Export_${dateStr}.xls`, "application/vnd.ms-excel");
    setExportMenuOpen(false);
    showToast(`Exported ${targetOrders.length} orders to Excel (.xls) with itemized breakdown`);
  };

  const handleExportCSVAll = () => {
    const targetOrders = filteredOrders.length > 0 ? filteredOrders : orders;
    const csvContent = generateOrdersCSV(targetOrders);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadExcelFile(csvContent, `Garmin_Orders_Export_${dateStr}.csv`, "text/csv");
    setExportMenuOpen(false);
    showToast(`Exported ${targetOrders.length} orders to CSV format`);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#121620] border border-[#007cc3] text-white px-4 py-3 rounded shadow-2xl animate-fade-in">
          <Check className="h-4 w-4 text-[#00a0df]" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <ShoppingBag className="h-6 w-6 text-[#007cc3]" />
            <span>Customer Orders &amp; Fulfillment</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Track transactions, update shipping fulfillment statuses, inspect line items, and export full reports.
          </p>
        </div>

        {/* Excel Export Action with Dropdown */}
        <div className="relative">
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleExportExcelAll}
              className="flex items-center gap-2 bg-[#166534] hover:bg-[#15803d] text-white px-4 py-2 text-xs font-heading uppercase tracking-wider font-bold rounded-l transition-all shadow-md active:scale-95"
              title="Export all order data and itemized lines to Microsoft Excel"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#4ade80]" />
              <span>Export to Excel</span>
            </button>
            <button
              type="button"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="bg-[#14532d] hover:bg-[#166534] text-white px-2 py-2 text-xs rounded-r border-l border-[#15803d]/40 transition-colors"
              title="More export formats"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Export options dropdown */}
          {exportMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-64 bg-[#141720] border border-[#262c39] shadow-2xl z-50 rounded p-1.5 font-sans">
              <div className="px-3 py-1.5 text-[10px] font-heading uppercase tracking-wider text-[#737b8c] font-bold border-b border-[#232732]">
                Export Data Formats
              </div>
              <button
                type="button"
                onClick={handleExportExcelAll}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs text-white hover:bg-[#1e2535] rounded transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#4ade80]" />
                <div>
                  <p className="font-semibold">Excel Workbook (.xls)</p>
                  <p className="text-[10px] text-[#8a92a3]">Formatted multi-sheet with line items</p>
                </div>
              </button>
              <button
                type="button"
                onClick={handleExportCSVAll}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs text-white hover:bg-[#1e2535] rounded transition-colors"
              >
                <Download className="h-4 w-4 text-[#00a0df]" />
                <div>
                  <p className="font-semibold">CSV Spreadsheet (.csv)</p>
                  <p className="text-[10px] text-[#8a92a3]">Standard UTF-8 comma separated values</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#141720] border border-[#262c39] p-3.5 rounded flex items-center justify-between">
          <div>
            <span className="text-[10px] font-heading uppercase tracking-wider text-[#8a92a3]">
              Total Revenue
            </span>
            <p className="font-heading text-xl font-bold text-white mt-0.5">
              ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="h-8 w-8 rounded bg-[#1e2535] border border-[#2e374d] flex items-center justify-center text-[#007cc3]">
            <DollarSign className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-[#141720] border border-[#262c39] p-3.5 rounded flex items-center justify-between">
          <div>
            <span className="text-[10px] font-heading uppercase tracking-wider text-[#8a92a3]">
              Pending Processing
            </span>
            <p className="font-heading text-xl font-bold text-[#fbbf24] mt-0.5">
              {processingCount} Orders
            </p>
          </div>
          <div className="h-8 w-8 rounded bg-[#1e2535] border border-[#2e374d] flex items-center justify-center text-[#fbbf24]">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-[#141720] border border-[#262c39] p-3.5 rounded flex items-center justify-between">
          <div>
            <span className="text-[10px] font-heading uppercase tracking-wider text-[#8a92a3]">
              Delivered Orders
            </span>
            <p className="font-heading text-xl font-bold text-[#4ade80] mt-0.5">
              {completedCount} Completed
            </p>
          </div>
          <div className="h-8 w-8 rounded bg-[#1e2535] border border-[#2e374d] flex items-center justify-center text-[#4ade80]">
            <PackageCheck className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 border border-[#262c39] bg-[#141720] p-3.5 sm:flex-row sm:items-center sm:justify-between rounded">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or customer..."
            className="h-9 w-full border border-[#262c39] bg-[#101217] pl-9 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none rounded"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-heading uppercase tracking-wider font-bold text-[#737b8c] mr-1">Status:</span>
          {["all", "processing", "shipped", "delivered", "cancelled"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 text-[11px] font-heading uppercase tracking-wider font-bold rounded transition-colors ${
                statusFilter === st
                  ? "bg-[#007cc3] text-white"
                  : "bg-[#101217] border border-[#262c39] text-[#8a92a3] hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="border border-[#262c39] bg-[#141720] overflow-hidden rounded">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#232732] bg-[#0f1117] text-[#737b8c] text-[11px] font-heading uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Order Number</th>
                <th className="py-3 px-4 font-bold">Customer Name</th>
                <th className="py-3 px-4 font-bold">Amount</th>
                <th className="py-3 px-4 font-bold">Payment</th>
                <th className="py-3 px-4 font-bold">Fulfillment Status</th>
                <th className="py-3 px-4 font-bold">Date Placed</th>
                <th className="py-3 px-4 font-bold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232732] text-[#c0c7d4]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#737b8c]">
                    Loading orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#737b8c]">
                    No orders matched your criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-[#191d28] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-white text-[13px]">
                      {ord.orderNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-white">{ord.clientName}</p>
                      <p className="text-[11px] text-[#8a92a3]">{ord.clientEmail}</p>
                    </td>
                    <td className="py-3.5 px-4 font-heading font-bold text-white text-[14px]">
                      ${ord.total.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded ${
                          ord.paymentStatus === "paid"
                            ? "bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30"
                            : "bg-[#2c2519] text-[#fbbf24] border border-[#fbbf24]/30"
                        }`}
                      >
                        {ord.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={ord.fulfillmentStatus}
                        onChange={(e) =>
                          handleUpdateStatus(ord.id, e.target.value as FulfillmentStatus)
                        }
                        className={`border px-2.5 py-1 text-[11px] font-heading uppercase font-bold rounded focus:outline-none ${
                          ord.fulfillmentStatus === "delivered"
                            ? "bg-[#1e2a22] border-[#4ade80]/30 text-[#4ade80]"
                            : ord.fulfillmentStatus === "shipped"
                            ? "bg-[#142334] border-[#60a5fa]/30 text-[#60a5fa]"
                            : ord.fulfillmentStatus === "processing"
                            ? "bg-[#2c2519] border-[#fbbf24]/30 text-[#fbbf24]"
                            : "bg-[#2c1919] border-rose-500/30 text-rose-400"
                        }`}
                      >
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-[12px] text-[#8a92a3] font-mono">
                      {new Date(ord.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(ord)}
                        className="p-1.5 text-[#8a92a3] hover:bg-[#1f2430] hover:text-white rounded transition-colors"
                        title="View Line Items"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <AdminModal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          maxWidth="2xl"
          title={`Order ${selectedOrder.orderNumber}`}
          subtitle={`Placed on ${new Date(selectedOrder.createdAt).toLocaleString()}`}
        >
          <div className="space-y-4 font-sans">
            {/* Customer info */}
            <div className="border border-[#262c39] bg-[#101217] p-3.5 text-[12px] space-y-1 rounded">
              <p className="text-white font-medium">Customer: {selectedOrder.clientName}</p>
              <p className="text-[#8a92a3]">Email: {selectedOrder.clientEmail}</p>
              <p className="text-[#8a92a3]">Shipping Destination: {selectedOrder.shippingAddress}</p>
            </div>

            {/* Line items */}
            <div>
              <p className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#8a92a3] mb-2">Purchased Items</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedOrder.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between border border-[#262c39] bg-[#101217] p-3 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 relative bg-[#0f1117] border border-[#262c39] p-0.5 shrink-0 overflow-hidden rounded">
                        <Image
                          src={item.image || "/images/products/1228429.jpg"}
                          alt={item.name}
                          width={40}
                          height={40}
                          className="object-contain"
                        />
                      </div>
                      <div>
                        <p className="font-medium text-white text-[13px]">{item.name}</p>
                        <p className="text-[11px] text-[#8a92a3]">Qty: {item.quantity} units</p>
                      </div>
                    </div>
                    <span className="font-heading font-bold text-white text-[14px]">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total and actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#232732]">
              <div>
                <p className="text-[11px] text-[#8a92a3] font-heading uppercase">Total Amount</p>
                <p className="font-heading font-bold text-2xl text-white">
                  ${selectedOrder.total.toFixed(2)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="bg-[#007cc3] px-5 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white hover:bg-[#006cae] rounded transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
