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
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <Percent className="h-6 w-6 text-[#007cc3]" />
            <span>Promotions & Discount Campaigns</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Configure price reductions, voucher percentages, scheduled campaign periods, and product targeting.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-[#007cc3] px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Promotion</span>
        </button>
      </div>

      {/* Discounts Table */}
      <div className="border border-[#262c39] bg-[#141720] overflow-hidden">
        <div className="p-3.5 border-b border-[#232732] flex items-center justify-between">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coupon codes or description..."
              className="h-9 w-full border border-[#262c39] bg-[#101217] pl-9 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none"
            />
          </div>
          <span className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#8a92a3]">
            {filteredDiscounts.length} Active Rules
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#232732] bg-[#0f1117] text-[#737b8c] text-[11px] font-heading uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Coupon Code</th>
                <th className="py-3 px-4 font-bold">Rule Value</th>
                <th className="py-3 px-4 font-bold">Target Scope</th>
                <th className="py-3 px-4 font-bold">Validity Period</th>
                <th className="py-3 px-4 font-bold">Redemptions</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232732] text-[#c0c7d4]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#737b8c]">
                    Loading promotional vouchers...
                  </td>
                </tr>
              ) : filteredDiscounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#737b8c]">
                    No promotional rules found.
                  </td>
                </tr>
              ) : (
                filteredDiscounts.map((disc) => (
                  <tr key={disc.id} className="hover:bg-[#191d28]">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-heading tracking-widest text-xs font-bold text-white bg-[#101217] border border-[#262c39] px-2.5 py-1">
                          {disc.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(disc.id, disc.code)}
                          className="text-[#737b8c] hover:text-white p-1"
                          title="Copy Code"
                        >
                          {copiedId === disc.id ? (
                            <Check className="h-3.5 w-3.5 text-[#4ade80]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-heading uppercase font-bold text-white text-[13px]">
                        {disc.type === "percentage" ? `${disc.value}% OFF` : `$${disc.value} OFF`}
                      </p>
                      <p className="text-[11px] text-[#8a92a3] line-clamp-1">{disc.description}</p>
                      {disc.minSpend ? (
                        <p className="text-[10px] text-[#737b8c] mt-0.5">Min spend: ${disc.minSpend}</p>
                      ) : null}
                    </td>
                    <td className="py-3.5 px-4">
                      {disc.applyType === "all" ? (
                        <span className="font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 bg-[#142334] text-[#60a5fa] border border-[#60a5fa]/30">
                          Sitewide
                        </span>
                      ) : disc.applyType === "categories" ? (
                        <div className="space-y-1">
                          <span className="font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 bg-[#191d28] text-white border border-[#262c39]">
                            {disc.targetCategories?.length || 0} Categories
                          </span>
                          <p className="text-[10px] text-[#8a92a3] line-clamp-1">
                            {disc.targetCategories?.join(", ")}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30">
                            {disc.targetSkus?.length || 0} Specific Models
                          </span>
                          <p className="text-[10px] font-mono text-[#8a92a3] line-clamp-1">
                            {disc.targetSkus?.join(", ")}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-[#c0c7d4]">
                      <div className="space-y-0.5">
                        <p className="text-[#8a92a3]">
                          Start: <span className="text-white">{disc.startDate ? new Date(disc.startDate).toLocaleDateString() : "Immediate"}</span>
                        </p>
                        <p className="text-[#8a92a3]">
                          End: <span className="text-white font-medium">{disc.expiresAt ? new Date(disc.expiresAt).toLocaleDateString() : "Open"}</span>
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-[#101217] border border-[#262c39] h-1.5 overflow-hidden">
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
                          <span className="font-heading font-bold text-white text-[11px]">
                            {disc.usageCount} / {disc.usageLimit || "∞"}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#737b8c]">
                          Limit {disc.perCustomerLimit || 1} / customer
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 ${
                          disc.status === "active"
                            ? "bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30"
                            : disc.status === "expired"
                            ? "bg-[#191d28] text-[#8a92a3] border border-[#262c39]"
                            : "bg-[#2c1919] text-rose-400 border border-rose-500/30"
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
                          className="p-1.5 text-[#8a92a3] hover:bg-[#1f2430] hover:text-white"
                          title="Edit Promotion"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(disc.id)}
                          className="p-1.5 text-[#8a92a3] hover:bg-rose-500/10 hover:text-rose-400"
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
        <form onSubmit={handleSubmit} className="space-y-5 font-sans">
          {/* Row 1: Code & Type */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Coupon Code *
              </label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. VIPMARQ20"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading tracking-wider font-bold text-white focus:border-[#007cc3] focus:outline-none uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Discount Rule
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as DiscountType })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="percentage">Percentage Discount (% Off)</option>
                <option value="fixed">Fixed Dollar Reduction ($ Off)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Value, Min Spend, Total Limit, Per-Customer Limit */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                {formData.type === "percentage" ? "Percentage (% Off)" : "Amount ($ Off)"} *
              </label>
              <input
                type="number"
                required
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading font-bold text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Min Spend ($)
              </label>
              <input
                type="number"
                value={formData.minSpend}
                onChange={(e) => setFormData({ ...formData, minSpend: Number(e.target.value) })}
                placeholder="0 = No Min"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Total Limit
              </label>
              <input
                type="number"
                value={formData.usageLimit}
                onChange={(e) => setFormData({ ...formData, usageLimit: Number(e.target.value) })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-heading font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Per-Client Limit
              </label>
              <input
                type="number"
                value={formData.perCustomerLimit}
                onChange={(e) => setFormData({ ...formData, perCustomerLimit: Number(e.target.value) })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          {/* Row 3: Validity Period */}
          <div className="border border-[#262c39] bg-[#101217] p-3.5 space-y-3">
            <h4 className="font-heading uppercase tracking-wider text-[11px] font-bold text-white flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#007cc3]" />
              <span>Schedule Validity Period</span>
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider font-bold text-[#737b8c]">
                  Start Date
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="mt-1 h-9 w-full border border-[#262c39] bg-[#141720] px-3 text-[12px] text-white focus:border-[#007cc3] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider font-bold text-[#737b8c]">
                  End / Expiry Date
                </label>
                <input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="mt-1 h-9 w-full border border-[#262c39] bg-[#141720] px-3 text-[12px] text-white focus:border-[#007cc3] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Target Scope */}
          <div className="border border-[#262c39] bg-[#101217] p-3.5 space-y-3">
            <h4 className="font-heading uppercase tracking-wider text-[11px] font-bold text-white flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-[#007cc3]" />
              <span>Target Scope & Product Filter</span>
            </h4>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "all", label: "Entire Catalog", desc: "Applies to all products" },
                { id: "categories", label: "Specific Categories", desc: "Select watch series" },
                { id: "skus", label: "Specific SKUs", desc: "Select individual models" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, applyType: opt.id as DiscountApplyType })}
                  className={`p-2.5 text-left border transition-all ${
                    formData.applyType === opt.id
                      ? "bg-[#142334] border-[#007cc3] text-white"
                      : "bg-[#141720] border-[#262c39] text-[#8a92a3] hover:border-[#384152] hover:text-white"
                  }`}
                >
                  <p className="font-heading uppercase tracking-wider text-[11px] font-bold">{opt.label}</p>
                  <p className="text-[10px] text-[#737b8c] mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Categories */}
            {formData.applyType === "categories" && (
              <div className="pt-2">
                <p className="text-[11px] text-[#8a92a3] mb-2 font-medium">Select categories:</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {AVAILABLE_CATEGORIES.map((cat) => {
                    const isSelected = formData.targetCategories.includes(cat);
                    return (
                      <label
                        key={cat}
                        className={`flex items-center gap-2 p-2 text-[12px] border cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#142334] border-[#007cc3] text-white font-medium"
                            : "bg-[#141720] border-[#262c39] text-[#8a92a3] hover:border-[#384152]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCategory(cat)}
                          className="h-3.5 w-3.5 accent-[#007cc3]"
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
                  <p className="text-[11px] text-[#8a92a3]">
                    Selected: <span className="text-[#4ade80] font-heading font-bold">{formData.targetSkus.length} models</span>
                  </p>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Filter models to include..."
                    className="h-7 w-48 border border-[#262c39] bg-[#141720] px-2 text-[11px] text-white focus:border-[#007cc3] focus:outline-none"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 border border-[#262c39] bg-[#141720] p-2">
                  {filteredModalProducts.map((p) => {
                    const isSelected = formData.targetSkus.includes(p.sku);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between p-2 text-[12px] cursor-pointer transition-colors border ${
                          isSelected
                            ? "bg-[#142334] border-[#007cc3] text-white font-medium"
                            : "border-transparent hover:bg-[#191d28] text-[#c0c7d4]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSku(p.sku)}
                            className="h-3.5 w-3.5 accent-[#007cc3]"
                          />
                          <span className="font-heading font-bold text-[11px] text-[#8a92a3]">{p.sku}</span>
                          <span className="truncate max-w-xs">{p.name}</span>
                        </div>
                        <span className="font-heading font-bold text-white text-[12px]">${p.price.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Description & Rules */}
          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Promotion Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. 20% off all luxury MARQ & fēnix watches during Summer promotion"
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          {/* Status & Stackable */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as DiscountStatus })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading font-bold uppercase text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-[12px] text-[#c0c7d4]">
                <input
                  type="checkbox"
                  checked={formData.isStackable}
                  onChange={(e) => setFormData({ ...formData, isStackable: e.target.checked })}
                  className="h-4 w-4 accent-[#007cc3]"
                />
                <span>Allow stacking with other discount vouchers</span>
              </label>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#232732]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-[#8a92a3] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#007cc3] px-5 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white hover:bg-[#006cae]"
            >
              {editingDiscount ? "Save Promotion" : "Deploy Promotion"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
