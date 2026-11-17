"use client";

import { useState, useEffect } from "react";
import {
  Percent,
  Plus,
  Search,
  Copy,
  Check,
  Trash2,
  Edit,
  Layers,
  Calendar,
} from "lucide-react";
import type {
  Discount,
  DiscountType,
  DiscountStatus,
  DiscountApplyType,
  CMSProduct,
} from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";

const AVAILABLE_CATEGORIES = [
  "Smartwatches & Wearables",
  "Sports & Fitness",
  "Outdoor Recreation",
  "Marine & Sailing",
  "Aviation",
  "Luxury Tool Watches (MARQ)",
];

export default function AdminDiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [products, setProducts] = useState<CMSProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [productSearch, setProductSearch] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    type: "percentage" as DiscountType,
    value: 20,
    minSpend: 150,
    usageLimit: 500,
    perCustomerLimit: 1,
    applyType: "all" as DiscountApplyType,
    targetCategories: [] as string[],
    targetSkus: [] as string[],
    startDate: new Date().toISOString().split("T")[0],
    expiresAt: "2026-12-31",
    isStackable: false,
    status: "active" as DiscountStatus,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [discRes, prodRes] = await Promise.all([
        fetch("/api/admin/discounts"),
        fetch("/api/admin/products"),
      ]);
      const discData = await discRes.json();
      const prodData = await prodRes.json();

      if (discData.discounts) setDiscounts(discData.discounts);
      if (prodData.products) setProducts(prodData.products);
    } catch (err) {
      console.error("Error loading discounts/products:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAdd = () => {
    setEditingDiscount(null);
    setFormData({
      code: "GARMIN" + Math.floor(10 + Math.random() * 90),
      description: "Promotional campaign discount voucher",
      type: "percentage",
      value: 15,
      minSpend: 100,
      usageLimit: 250,
      perCustomerLimit: 1,
      applyType: "all",
      targetCategories: ["Smartwatches & Wearables"],
      targetSkus: [],
      startDate: new Date().toISOString().split("T")[0],
      expiresAt: "2026-12-31",
      isStackable: false,
      status: "active",
    });
    setProductSearch("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (d: Discount) => {
    setEditingDiscount(d);
    setFormData({
      code: d.code,
      description: d.description,
      type: d.type,
      value: d.value,
      minSpend: d.minSpend || 0,
      usageLimit: d.usageLimit || 1000,
      perCustomerLimit: d.perCustomerLimit || 1,
      applyType: d.applyType || "all",
      targetCategories: d.targetCategories || [],
      targetSkus: d.targetSkus || [],
      startDate: d.startDate ? d.startDate.split("T")[0] : new Date().toISOString().split("T")[0],
      expiresAt: d.expiresAt ? d.expiresAt.split("T")[0] : "2026-12-31",
      isStackable: d.isStackable ?? false,
      status: d.status,
    });
    setProductSearch("");
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this discount coupon?")) return;
    try {
      await fetch(`/api/admin/discounts?id=${id}`, { method: "DELETE" });
      setDiscounts(discounts.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Failed to delete discount:", err);
    }
  };

  const toggleCategory = (cat: string) => {
    setFormData((prev) => {
      const exists = prev.targetCategories.includes(cat);
      return {
        ...prev,
        targetCategories: exists
          ? prev.targetCategories.filter((c) => c !== cat)
          : [...prev.targetCategories, cat],
      };
    });
  };

  const toggleSku = (sku: string) => {
    setFormData((prev) => {
      const exists = prev.targetSkus.includes(sku);
      return {
        ...prev,
        targetSkus: exists
          ? prev.targetSkus.filter((s) => s !== sku)
          : [...prev.targetSkus, sku],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingDiscount ? { id: editingDiscount.id } : {}),
        ...formData,
        startDate: new Date(formData.startDate).toISOString(),
        expiresAt: new Date(formData.expiresAt + "T23:59:59").toISOString(),
      };

      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to save discount:", err);
    }
  };

  const filteredDiscounts = discounts.filter(
    (d) =>
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredModalProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.family.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Percent className="h-6 w-6 text-[#007cc3]" />
            <h1 className="g-heading text-2xl uppercase tracking-tight text-neutral-900">
              Promotions & Discount Campaigns
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Configure price reductions, voucher percentages, scheduled campaign periods, and product targeting.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-black px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Promotion</span>
        </button>
      </div>

      {/* Discounts Table */}
      <div className="border border-neutral-200 bg-white rounded-none shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coupon codes or description..."
              className="h-10 w-full border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-black focus:outline-none rounded-none"
            />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {filteredDiscounts.length} Active Rules
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4 font-semibold">Coupon Code</th>
                <th className="py-3.5 px-4 font-semibold">Rule Value</th>
                <th className="py-3.5 px-4 font-semibold">Target Scope</th>
                <th className="py-3.5 px-4 font-semibold">Validity Period</th>
                <th className="py-3.5 px-4 font-semibold">Redemptions</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    Loading promotional vouchers...
                  </td>
                </tr>
              ) : filteredDiscounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    No promotional rules found.
                  </td>
                </tr>
              ) : (
                filteredDiscounts.map((disc) => (
                  <tr key={disc.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tracking-widest text-xs font-semibold text-neutral-900 bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-none">
                          {disc.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(disc.id, disc.code)}
                          className="text-neutral-400 hover:text-black p-1 transition-colors"
                          title="Copy Code"
                        >
                          {copiedId === disc.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-neutral-900 text-sm">
                        {disc.type === "percentage" ? `${disc.value}% OFF` : `$${disc.value} OFF`}
                      </p>
                      <p className="text-xs text-neutral-500 line-clamp-1">{disc.description}</p>
                      {disc.minSpend ? (
                        <p className="text-[11px] text-neutral-400 mt-0.5">Min spend: ${disc.minSpend}</p>
                      ) : null}
                    </td>
                    <td className="py-3.5 px-4">
                      {disc.applyType === "all" ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-none">
                          Sitewide
                        </span>
                      ) : disc.applyType === "categories" ? (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 text-neutral-800 border border-neutral-200 rounded-none">
                            {disc.targetCategories?.length || 0} Categories
                          </span>
                          <p className="text-xs text-neutral-500 line-clamp-1">
                            {disc.targetCategories?.join(", ")}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-none">
                            {disc.targetSkus?.length || 0} Specific Models
                          </span>
                          <p className="text-xs font-mono text-neutral-500 line-clamp-1">
                            {disc.targetSkus?.join(", ")}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-neutral-600">
                      <div className="space-y-0.5">
                        <p>
                          Start: <span className="font-medium text-neutral-900">{disc.startDate ? new Date(disc.startDate).toLocaleDateString() : "Immediate"}</span>
                        </p>
                        <p>
                          End: <span className="font-medium text-neutral-900">{disc.expiresAt ? new Date(disc.expiresAt).toLocaleDateString() : "Open"}</span>
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-neutral-100 border border-neutral-200 h-2 rounded-none overflow-hidden">
                            <div
                              className="bg-[#007cc3] h-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  ((disc.usageCount || 0) / (disc.usageLimit || 100)) * 100
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-neutral-900">
                            {disc.usageCount} / {disc.usageLimit || "∞"}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400">
                          Limit {disc.perCustomerLimit || 1} / customer
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-none ${
                          disc.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : disc.status === "expired"
                            ? "bg-neutral-100 text-neutral-600 border border-neutral-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {disc.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(disc)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors rounded-none"
                          title="Edit Promotion"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(disc.id)}
                          className="p-2 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-none"
                          title="Delete Promotion"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Add / Edit Promo Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="3xl"
        title={editingDiscount ? "Edit Promotion Campaign" : "Create Promotion Voucher"}
        subtitle="Configure discount rates, schedule validity, targeted product models, and redemptions"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Row 1: Code & Type */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Coupon Code *
              </label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. VIPMARQ20"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-mono tracking-wider font-semibold text-neutral-900 focus:border-black focus:outline-none uppercase rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Discount Rule
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as DiscountType })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              >
                <option value="percentage">Percentage Discount (% Off)</option>
                <option value="fixed">Fixed Dollar Reduction ($ Off)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Value, Min Spend, Total Limit, Per-Customer Limit */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                {formData.type === "percentage" ? "Percentage (% Off)" : "Amount ($ Off)"} *
              </label>
              <input
                type="number"
                required
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Min Spend ($)
              </label>
              <input
                type="number"
                value={formData.minSpend}
                onChange={(e) => setFormData({ ...formData, minSpend: Number(e.target.value) })}
                placeholder="0 = No Min"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Total Limit
              </label>
              <input
                type="number"
                value={formData.usageLimit}
                onChange={(e) => setFormData({ ...formData, usageLimit: Number(e.target.value) })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Per-Client Limit
              </label>
              <input
                type="number"
                value={formData.perCustomerLimit}
                onChange={(e) => setFormData({ ...formData, perCustomerLimit: Number(e.target.value) })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          {/* Row 3: Validity Period */}
          <div className="border border-neutral-200 bg-neutral-50/50 p-4 space-y-3 rounded-none">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-[#007cc3]" />
              <span>Schedule Validity Period</span>
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
                  End / Expiry Date
                </label>
                <input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Target Scope */}
          <div className="border border-neutral-200 bg-neutral-50/50 p-4 space-y-3 rounded-none">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-[#007cc3]" />
              <span>Target Scope & Product Filter</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: "all", label: "Entire Catalog", desc: "Applies to all products" },
                { id: "categories", label: "Specific Categories", desc: "Select watch series" },
                { id: "skus", label: "Specific SKUs", desc: "Select individual models" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, applyType: opt.id as DiscountApplyType })}
                  className={`p-3 text-left border rounded-none transition-all ${
                    formData.applyType === opt.id
                      ? "bg-white border-black text-black ring-1 ring-black"
                      : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider">{opt.label}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Categories */}
            {formData.applyType === "categories" && (
              <div className="pt-2">
                <p className="text-xs text-neutral-600 mb-2 font-medium">Select categories:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {AVAILABLE_CATEGORIES.map((cat) => {
                    const isSelected = formData.targetCategories.includes(cat);
                    return (
                      <label
                        key={cat}
                        className={`flex items-center gap-2 p-2.5 text-xs border rounded-none cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-neutral-100 border-neutral-400 text-neutral-900 font-semibold"
                            : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCategory(cat)}
                          className="h-4 w-4 accent-black rounded-none"
                        />
                        <span className="truncate">{cat}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SKUs */}
            {formData.applyType === "skus" && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-neutral-600">
                    Selected: <span className="text-emerald-700 font-semibold">{formData.targetSkus.length} models</span>
                  </p>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Filter models to include..."
                    className="h-8 w-52 border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 focus:border-black focus:outline-none rounded-none"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 border border-neutral-200 bg-white p-2 rounded-none">
                  {filteredModalProducts.map((p) => {
                    const isSelected = formData.targetSkus.includes(p.sku);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between p-2 text-xs cursor-pointer transition-colors border rounded-none ${
                          isSelected
                            ? "bg-neutral-50 border-neutral-400 text-neutral-900 font-medium"
                            : "border-transparent hover:bg-neutral-50 text-neutral-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSku(p.sku)}
                            className="h-4 w-4 accent-black rounded-none"
                          />
                          <span className="font-mono text-neutral-500 text-[11px]">{p.sku}</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className="font-semibold text-neutral-900 ml-2">${p.price.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Description & Rules */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Promotion Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. 20% off all luxury MARQ & fēnix watches during Summer promotion"
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          {/* Status & Stackable */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as DiscountStatus })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={formData.isStackable}
                  onChange={(e) => setFormData({ ...formData, isStackable: e.target.checked })}
                  className="h-4 w-4 accent-black rounded-none"
                />
                <span>Allow stacking with other discount vouchers</span>
              </label>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 rounded-none transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-black px-6 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
            >
              {editingDiscount ? "Save Promotion" : "Deploy Promotion"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
