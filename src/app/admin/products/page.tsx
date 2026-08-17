"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Plus,
  Search,
  Trash2,
  Edit,
  Tag,
  Boxes,
  FileText,
  Sliders,
  Box,
  Share2,
  Globe,
} from "lucide-react";
import type {
  CMSProduct,
  ProductStatus,
  ProductSpecItem,
  ProductBadgeOption,
} from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";
import { GarminBadge } from "@/components/GarminBadge";
import { SEOEditor } from "@/components/admin/SEOEditor";

const PRIMARY_CATEGORIES = [
  "Smartwatches & Wearables",
  "Sports & Fitness",
  "Outdoor Recreation",
  "Marine & Sailing",
  "Aviation",
  "Luxury Tool Watches (MARQ)",
  "Accessories & Sensors",
];

const SUB_CATEGORIES_MAP: Record<string, string[]> = {
  "Smartwatches & Wearables": ["Multisport GPS", "Fashion & Wellness", "Kids Smartwatches", "Everyday Smartwatches"],
  "Sports & Fitness": ["Running GPS", "Triathlon & Multisport", "Cycling Computers", "Fitness Trackers"],
  "Outdoor Recreation": ["Adventure GPS", "Diving & Tactical", "Handheld GPS", "Satellite Communicators"],
  "Marine & Sailing": ["Marine & Sailing GPS", "Chartplotters", "Marine Instruments"],
  "Aviation": ["Aviation Smartwatches", "Flight Navigation GPS"],
  "Luxury Tool Watches (MARQ)": ["Modern Tool Watches", "Carbon Edition", "Damascus Edition", "Titanium Luxury"],
  "Accessories & Sensors": ["Bands & Straps", "Heart Rate & Sensors", "Cables & Power", "Mounts & Protection"],
};

const BADGE_OPTIONS: ProductBadgeOption[] = [
  "NONE",
  "NEW",
  "CUSTOMIZABLE",
  "SALE",
  "BEST SELLER",
  "LIMITED EDITION",
  "CARBON EDITION",
  "GARMIN SIGNATURE",
  "EXCLUSIVE",
  "POPULAR",
];

const WATCH_FAMILIES = [
  "MARQ",
  "fēnix",
  "Forerunner",
  "Venu",
  "Instinct",
  "Approach",
  "vívoactive",
  "Quatix",
  "Tactix",
  "D2",
  "Accessories",
];

const ALL_ACTIVITIES = [
  "Running",
  "Swimming",
  "Hiking",
  "Diving",
  "Boating",
  "Golfing",
  "Cycling",
  "Triathlon",
  "Tactical training",
  "Aviation",
  "Skiing",
  "Wellness",
];

const DEFAULT_SPECS_TEMPLATE: ProductSpecItem[] = [
  { label: "Lens Material", value: "Domed Sapphire Crystal" },
  { label: "Bezel Material", value: "Grade-5 Titanium with Ceramic Inlay" },
  { label: "Display Size", value: '1.4" AMOLED Display (454 x 454 pixels)' },
  { label: "Battery Life", value: "Smartwatch: Up to 16 days (7 days always-on)" },
  { label: "Water Rating", value: "10 ATM (100 meters / 40m dive)" },
  { label: "Memory / History", value: "32 GB onboard memory" },
  { label: "Connectivity", value: "Bluetooth®, ANT+®, Wi-Fi®, Garmin Pay™" },
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<CMSProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CMSProduct | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "media" | "specs" | "box" | "crossSell" | "seo">("general");
  const [accessorySearch, setAccessorySearch] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    price: 999.99,
    originalPrice: 1199.99,
    priceSuffix: "",
    description: "",
    image: "/marq/images/marq-spec-captain.png",
    badge: "NONE" as ProductBadgeOption,
    family: "MARQ",
    category: "Luxury Tool Watches (MARQ)",
    subCategory: "Modern Tool Watches",
    activities: ["Running", "Hiking"] as string[],
    level: "Premium" as "Entry" | "Advanced" | "Premium" | "Youth",
    caseSize: "Medium" as "Small" | "Medium" | "Large",
    stock: 25,
    status: "published" as ProductStatus,
    isFeatured: false,
    specs: [...DEFAULT_SPECS_TEMPLATE] as ProductSpecItem[],
    inTheBox: [
      "Smartwatch unit",
      "USB-C Charging / Data Cable",
      "Quick-Start Documentation & Warranty",
      "Alternative Silicone Strap",
    ] as string[],
    compatibleAccessories: [] as string[],
    // SEO
    seoTitle: "",
    seoDescription: "",
    focusKeywords: [] as string[],
    canonicalUrl: "",
    noIndex: false,
    ogImage: "",
  });

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/products");
      const data = await res.json();
      if (data.products) setProducts(data.products);
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      sku: `010-02${Math.floor(100 + Math.random() * 900)}-01`,
      price: 1299.99,
      originalPrice: 1499.99,
      priceSuffix: "",
      description: "Forged with supreme precision and aerospace materials. Engineered for performance.",
      image: "/marq/images/marq-spec-damascus.png",
      badge: "NEW",
      family: "MARQ",
      category: "Luxury Tool Watches (MARQ)",
      subCategory: "Modern Tool Watches",
      activities: ["Hiking", "Running", "Swimming"],
      level: "Premium",
      caseSize: "Medium",
      stock: 20,
      status: "published",
      isFeatured: true,
      specs: [
        { label: "Lens Material", value: "Domed Sapphire Crystal" },
        { label: "Bezel Material", value: "Grade-5 Titanium" },
        { label: "Display Size", value: '1.4" AMOLED (454 x 454)' },
        { label: "Battery Life", value: "Up to 16 days" },
        { label: "Water Rating", value: "10 ATM (100 meters)" },
        { label: "Memory", value: "32 GB" },
      ],
      inTheBox: [
        "Smartwatch unit",
        "USB-C Charging / Data Cable",
        "Quick-Start Manual & Warranty",
        "Alternative Silicone Band",
      ],
      compatibleAccessories: ["acc-hrm-pro-plus", "acc-qf22-silicone-black"],
      seoTitle: "",
      seoDescription: "",
      focusKeywords: [],
      canonicalUrl: "",
      noIndex: false,
      ogImage: "",
    });
    setActiveTab("general");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: CMSProduct) => {
    setEditingProduct(p);
    setFormData({
      name: p.name,
      sku: p.sku || `GRM-${p.id}`,
      price: p.price,
      originalPrice: p.originalPrice || p.price * 1.15,
      priceSuffix: p.priceSuffix || "",
      description: p.description || "",
      image: p.image || "/images/products/1228429.jpg",
      badge: (p.badge as ProductBadgeOption) || "NONE",
      family: p.family || "Smartwatches",
      category: p.category || "Smartwatches & Wearables",
      subCategory: p.subCategory || "Multisport GPS",
      activities: p.activities || ["Running"],
      level: p.level || "Premium",
      caseSize: p.caseSize || "Medium",
      stock: p.stock ?? 50,
      status: p.status || "published",
      isFeatured: p.isFeatured ?? false,
      specs: p.specs && p.specs.length > 0 ? p.specs : [...DEFAULT_SPECS_TEMPLATE],
      inTheBox:
        p.inTheBox && p.inTheBox.length > 0
          ? p.inTheBox
          : [`${p.name}`, "USB-C Charging Cable", "Manual"],
      compatibleAccessories: p.compatibleAccessories || [],
      seoTitle: p.seoTitle || "",
      seoDescription: p.seoDescription || "",
      focusKeywords: p.focusKeywords || [],
      canonicalUrl: p.canonicalUrl || "",
      noIndex: p.noIndex || false,
      ogImage: p.ogImage || "",
    });
    setActiveTab("general");
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      await fetch(`/api/admin/products?id=${id}`, { method: "DELETE" });
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete product:", err);
    }
  };

  const handleCategoryChange = (newCat: string) => {
    const subList = SUB_CATEGORIES_MAP[newCat] || ["General"];
    setFormData((prev) => ({
      ...prev,
      category: newCat,
      subCategory: subList[0] || "General",
    }));
  };

  const toggleActivity = (act: string) => {
    setFormData((prev) => {
      const exists = prev.activities.includes(act);
      return {
        ...prev,
        activities: exists
          ? prev.activities.filter((a) => a !== act)
          : [...prev.activities, act],
      };
    });
  };

  const toggleCrossSell = (prodId: string) => {
    setFormData((prev) => {
      const exists = prev.compatibleAccessories.includes(prodId);
      return {
        ...prev,
        compatibleAccessories: exists
          ? prev.compatibleAccessories.filter((id) => id !== prodId)
          : [...prev.compatibleAccessories, prodId],
      };
    });
  };

  const handleSpecChange = (index: number, field: "label" | "value", text: string) => {
    setFormData((prev) => {
      const newSpecs = [...prev.specs];
      newSpecs[index] = { ...newSpecs[index], [field]: text };
      return { ...prev, specs: newSpecs };
    });
  };

  const handleAddSpec = () => {
    setFormData((prev) => ({
      ...prev,
      specs: [...prev.specs, { label: "New Spec", value: "Value" }],
    }));
  };

  const handleRemoveSpec = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      specs: prev.specs.filter((_, i) => i !== index),
    }));
  };

  const handleInTheBoxChange = (index: number, text: string) => {
    setFormData((prev) => {
      const newBox = [...prev.inTheBox];
      newBox[index] = text;
      return { ...prev, inTheBox: newBox };
    });
  };

  const handleAddInTheBox = () => {
    setFormData((prev) => ({
      ...prev,
      inTheBox: [...prev.inTheBox, "Included Item in Packaging"],
    }));
  };

  const handleRemoveInTheBox = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      inTheBox: prev.inTheBox.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingProduct ? { id: editingProduct.id } : {}),
        ...formData,
      };

      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchProducts();
      }
    } catch (err) {
      console.error("Failed to save product:", err);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.family.toLowerCase().includes(search.toLowerCase());
    const matchesFamily = familyFilter === "all" || p.family === familyFilter;
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesFamily && matchesStatus;
  });

  const availableSubCategories =
    SUB_CATEGORIES_MAP[formData.category] || ["General"];

  const crossSellAvailableProducts = products.filter(
    (p) =>
      p.id !== editingProduct?.id &&
      (p.name.toLowerCase().includes(accessorySearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(accessorySearch.toLowerCase()) ||
        p.category.toLowerCase().includes(accessorySearch.toLowerCase()))
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <Boxes className="h-6 w-6 text-[#007cc3]" />
            <span>Product Catalog & Inventory</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Manage Garmin product models, technical specifications, retail packages, and cross-selling accessories.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-[#007cc3] px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-[#262c39] bg-[#141720] p-3.5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by model, SKU, or family..."
            className="h-9 w-full border border-[#262c39] bg-[#101217] pl-9 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="h-9 border border-[#262c39] bg-[#101217] px-3 text-[13px] font-medium text-white focus:border-[#007cc3] focus:outline-none"
          >
            <option value="all">All Watch Families</option>
            {WATCH_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f} Series
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 border border-[#262c39] bg-[#101217] px-3 text-[13px] font-medium text-white focus:border-[#007cc3] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="border border-[#262c39] bg-[#141720] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#232732] bg-[#0f1117] text-[#737b8c] text-[11px] font-heading uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Product & SKU</th>
                <th className="py-3 px-4 font-bold">Hierarchy</th>
                <th className="py-3 px-4 font-bold">Price</th>
                <th className="py-3 px-4 font-bold">Badge</th>
                <th className="py-3 px-4 font-bold">Stock</th>
                <th className="py-3 px-4 font-bold">Cross-Sell</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232732] text-[#c0c7d4]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#737b8c]">
                    Loading products...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#737b8c]">
                    No products matched your criteria.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-[#191d28]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 relative shrink-0 bg-[#0f1117] border border-[#262c39] p-1 flex items-center justify-center overflow-hidden">
                          <Image
                            src={p.image || "/images/products/1228429.jpg"}
                            alt={p.name}
                            width={40}
                            height={40}
                            className="object-contain"
                          />
                        </div>
                        <div>
                          <p className="font-medium text-white line-clamp-1">{p.name}</p>
                          <p className="font-heading text-[11px] uppercase tracking-wider text-[#8a92a3] font-bold">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-white text-[12px]">{p.category || "Smartwatches"}</p>
                      <p className="text-[11px] text-[#737b8c]">{p.subCategory || "General"}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-heading font-bold text-white text-[14px]">
                        ${p.price.toFixed(2)}
                      </span>
                      {p.priceSuffix && (
                        <span className="text-[10px] text-[#737b8c] ml-1">
                          {p.priceSuffix}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {p.badge && p.badge !== "NONE" ? (
                        <GarminBadge badge={p.badge} variant="pill" />
                      ) : (
                        <span className="text-[#606775] text-[11px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            p.stock > 20
                              ? "bg-[#4ade80]"
                              : p.stock > 5
                              ? "bg-[#fbbf24]"
                              : "bg-rose-400"
                          }`}
                        />
                        <span className="font-heading font-bold text-white text-[12px]">{p.stock} units</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] bg-[#191d28] px-2 py-0.5 text-[#c0c7d4] border border-[#262c39]">
                        {p.compatibleAccessories?.length || 0} linked
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 ${
                          p.status === "published"
                            ? "bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30"
                            : p.status === "draft"
                            ? "bg-[#2c2519] text-[#fbbf24] border border-[#fbbf24]/30"
                            : "bg-[#191d28] text-[#8a92a3] border border-[#262c39]"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 text-[#8a92a3] hover:bg-[#1f2430] hover:text-white"
                          title="Edit Product"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 text-[#8a92a3] hover:bg-rose-500/10 hover:text-rose-400"
                          title="Delete Product"
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

      {/* 5-Tab Enterprise Product Builder Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="4xl"
        title={editingProduct ? `Edit Model: ${editingProduct.name}` : "Create Product Catalog Entry"}
        subtitle="Manage product taxonomy, pricing, technical specifications, and cross-selling accessories"
      >
        <form onSubmit={handleSubmit} className="space-y-5 font-sans">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 border-b border-[#232732] pb-2">
            {[
              { id: "general" as const, label: "1. Hierarchy & Pricing", icon: Tag },
              { id: "media" as const, label: "2. Media & Description", icon: FileText },
              { id: "specs" as const, label: "3. Tech Specs", icon: Sliders },
              { id: "box" as const, label: "4. In The Box", icon: Box },
              { id: "crossSell" as const, label: "5. Cross-Selling", icon: Share2 },
              { id: "seo" as const, label: "6. Search & Social SEO", icon: Globe },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-heading uppercase tracking-wider font-bold transition-colors border-b-2 ${
                    isActive
                      ? "border-[#007cc3] text-[#007cc3] bg-[#1a202c]"
                      : "border-transparent text-[#8a92a3] hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: General & Hierarchy */}
          {activeTab === "general" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. MARQ® Captain (Gen 2)"
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    SKU / Part Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="e.g. 010-02648-11"
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading uppercase tracking-wider font-bold text-[#60a5fa] focus:border-[#007cc3] focus:outline-none"
                  />
                </div>
              </div>

              {/* Category, Subcategory & Family */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Product Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                  >
                    {PRIMARY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Sub-Category *
                  </label>
                  <select
                    value={formData.subCategory}
                    onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                  >
                    {availableSubCategories.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Watch Family / Series *
                  </label>
                  <select
                    value={formData.family}
                    onChange={(e) => setFormData({ ...formData, family: e.target.value })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                  >
                    {WATCH_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f} Series
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Badge Visual Section & Live Preview */}
              <div className="border border-[#262c39] bg-[#101217] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-heading uppercase tracking-wider text-[11px] font-bold text-white flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-[#007cc3]" />
                      <span>Product Ribbon Badge & Marketing Tag</span>
                    </h4>
                    <p className="text-[11px] text-[#8a92a3] mt-0.5">
                      Select official Garmin flag ribbon badge displayed on catalog cards and product detail header
                    </p>
                  </div>
                  {formData.badge && formData.badge !== "NONE" && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, badge: "NONE" })}
                      className="text-[10px] font-heading uppercase font-bold text-rose-400 hover:underline"
                    >
                      Clear Badge
                    </button>
                  )}
                </div>

                {/* Badge Visual Catalog Grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 pt-1">
                  {BADGE_OPTIONS.map((badgeOption) => {
                    const isSelected = formData.badge === badgeOption;
                    return (
                      <button
                        key={badgeOption}
                        type="button"
                        onClick={() => setFormData({ ...formData, badge: badgeOption })}
                        className={`relative p-2 text-left border flex flex-col items-center justify-center min-h-[58px] transition-all ${
                          isSelected
                            ? "bg-[#142334] border-[#007cc3] ring-1 ring-[#007cc3]"
                            : "bg-[#141720] border-[#262c39] hover:border-[#384152]"
                        }`}
                      >
                        {badgeOption === "NONE" ? (
                          <span className="text-[11px] text-[#737b8c] italic font-medium">No Badge</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 w-full">
                            <GarminBadge badge={badgeOption} variant="pill" className="text-[10px] py-0.5 px-2 text-center" />
                          </div>
                        )}
                        <span className="text-[9px] font-mono text-[#606775] mt-1 uppercase">
                          {isSelected ? "● ACTIVE" : badgeOption === "NONE" ? "Standard" : "Flag Ribbon"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Live Demonstration Preview Card */}
                {formData.badge && formData.badge !== "NONE" && (
                  <div className="mt-2 border border-[#232732] bg-[#0c0e12] p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-14 w-28 bg-[#141720] border border-[#262c39] flex items-center justify-center overflow-hidden">
                        <GarminBadge badge={formData.badge} variant="ribbon" />
                        <span className="text-[9px] text-[#737b8c] font-mono mt-4">Card Ribbon</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-heading uppercase text-[#8a92a3] font-bold">Storefront Renders:</p>
                        <div className="flex items-center gap-2">
                          <GarminBadge badge={formData.badge} variant="pill" />
                          <GarminBadge badge={formData.badge} variant="starburst" className="h-8 w-8" />
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-[#4ade80] font-medium font-heading uppercase">Live on Catalog & Detail Pages</p>
                      <p className="text-[10px] text-[#737b8c]">Changes will sync immediately upon saving</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Options */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Regular Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading font-bold text-white focus:border-[#007cc3] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    MSRP / Original Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: Number(e.target.value) })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-[#8a92a3] focus:border-[#007cc3] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Price Suffix
                  </label>
                  <input
                    type="text"
                    value={formData.priceSuffix}
                    onChange={(e) => setFormData({ ...formData, priceSuffix: e.target.value })}
                    placeholder='e.g. "and up"'
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                  />
                </div>
              </div>

              {/* Stock, Case Size, Level, Status */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Stock Inventory *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-heading font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Case Size
                  </label>
                  <select
                    value={formData.caseSize}
                    onChange={(e) => setFormData({ ...formData, caseSize: e.target.value as "Small" | "Medium" | "Large" })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                  >
                    <option value="Small">Small (42-43mm)</option>
                    <option value="Medium">Medium (46-47mm)</option>
                    <option value="Large">Large (51mm)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    User Level
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as "Entry" | "Advanced" | "Premium" | "Youth" })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                  >
                    <option value="Entry">Entry Level</option>
                    <option value="Advanced">Advanced Performance</option>
                    <option value="Premium">Luxury / Premium</option>
                    <option value="Youth">Youth</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ProductStatus })}
                    className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading uppercase tracking-wider font-bold text-white focus:border-[#007cc3] focus:outline-none"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Media & Overview */}
          {activeTab === "media" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                  Product Image URL *
                </label>
                <div className="mt-1 flex gap-3">
                  <input
                    type="text"
                    required
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    placeholder="/images/products/1228429.jpg or /marq/images/..."
                    className="h-9 flex-1 border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-mono"
                  />
                  <div className="h-14 w-14 relative shrink-0 border border-[#262c39] bg-[#0f1117] flex items-center justify-center p-1 overflow-hidden">
                    <Image
                      src={formData.image || "/images/products/1228429.jpg"}
                      alt="Preview"
                      width={56}
                      height={56}
                      className="object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Image Presets */}
              <div className="border border-[#262c39] bg-[#101217] p-3">
                <p className="text-[11px] font-heading uppercase tracking-wider font-bold text-[#737b8c] mb-2">Preset Watch Imagery:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "MARQ Captain", src: "/marq/images/marq-spec-captain.png" },
                    { label: "MARQ Damascus", src: "/marq/images/marq-spec-damascus.png" },
                    { label: "MARQ Golfer", src: "/marq/images/marq-spec-carbon-golfer.png" },
                    { label: "MARQ Athlete", src: "/marq/images/marq-spec-carbon-athlete.png" },
                    { label: "fēnix 8 AMOLED", src: "/images/products/1228429.jpg" },
                    { label: "Forerunner 970", src: "/images/products/1462801.jpg" },
                  ].map((preset) => (
                    <button
                      key={preset.src}
                      type="button"
                      onClick={() => setFormData({ ...formData, image: preset.src })}
                      className="bg-[#191d28] border border-[#262c39] px-2.5 py-1 text-[11px] text-[#c0c7d4] hover:bg-[#007cc3] hover:text-white transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                  Product Description *
                </label>
                <textarea
                  rows={4}
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Comprehensive description of materials, artisan crafts, AMOLED screen, and athlete coaching metrics..."
                  className="mt-1 w-full border border-[#262c39] bg-[#101217] p-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
                />
              </div>

              {/* Activities Multi-Select */}
              <div>
                <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3] mb-2">
                  Target Activities & Sports
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ACTIVITIES.map((act) => {
                    const isSelected = formData.activities.includes(act);
                    return (
                      <button
                        key={act}
                        type="button"
                        onClick={() => toggleActivity(act)}
                        className={`px-3 py-1 text-[11px] font-heading uppercase tracking-wider font-bold transition-colors ${
                          isSelected
                            ? "bg-[#007cc3] text-white"
                            : "bg-[#191d28] border border-[#262c39] text-[#8a92a3] hover:text-white"
                        }`}
                      >
                        {act}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Tech Specs Key-Value Builder */}
          {activeTab === "specs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#232732] pb-2">
                <p className="text-[12px] text-[#8a92a3]">
                  Define technical attributes (lens, bezel, battery, water rating, sensors).
                </p>
                <button
                  type="button"
                  onClick={handleAddSpec}
                  className="flex items-center gap-1 text-[11px] font-heading uppercase tracking-wider font-bold text-[#007cc3] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Spec Row</span>
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {formData.specs.map((spec, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-[#101217] p-2 border border-[#262c39]">
                    <input
                      type="text"
                      value={spec.label}
                      onChange={(e) => handleSpecChange(idx, "label", e.target.value)}
                      placeholder="e.g. Battery Life"
                      className="w-1/3 h-8 border border-[#262c39] bg-[#141720] px-2.5 text-[12px] text-white focus:border-[#007cc3] focus:outline-none font-medium"
                    />
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => handleSpecChange(idx, "value", e.target.value)}
                      placeholder="e.g. Up to 16 days"
                      className="flex-1 h-8 border border-[#262c39] bg-[#141720] px-2.5 text-[12px] text-[#c0c7d4] focus:border-[#007cc3] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSpec(idx)}
                      className="text-[#737b8c] hover:text-rose-400 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: In The Box */}
          {activeTab === "box" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#232732] pb-2">
                <p className="text-[12px] text-[#8a92a3]">
                  Itemized list of hardware, cables, and packaging contents.
                </p>
                <button
                  type="button"
                  onClick={handleAddInTheBox}
                  className="flex items-center gap-1 text-[11px] font-heading uppercase tracking-wider font-bold text-[#007cc3] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Item</span>
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {formData.inTheBox.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-[#101217] p-2 border border-[#262c39]">
                    <Box className="h-4 w-4 text-[#007cc3] shrink-0" />
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleInTheBoxChange(idx, e.target.value)}
                      placeholder="e.g. USB-C Charging / Data Cable"
                      className="flex-1 h-8 border border-[#262c39] bg-[#141720] px-2.5 text-[12px] text-white focus:border-[#007cc3] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveInTheBox(idx)}
                      className="text-[#737b8c] hover:text-rose-400 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: Cross-Selling & Compatible Accessories */}
          {activeTab === "crossSell" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#232732] pb-2">
                <div>
                  <p className="text-[12px] text-white font-semibold">
                    Select Compatible Cross-Selling Accessories
                  </p>
                  <p className="text-[11px] text-[#8a92a3]">
                    Selected: <span className="text-[#4ade80] font-heading font-bold">{formData.compatibleAccessories.length} items linked</span>
                  </p>
                </div>
                <input
                  type="text"
                  value={accessorySearch}
                  onChange={(e) => setAccessorySearch(e.target.value)}
                  placeholder="Filter catalog to link..."
                  className="h-8 w-52 border border-[#262c39] bg-[#101217] px-2.5 text-[11px] text-white focus:border-[#007cc3] focus:outline-none"
                />
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1.5 border border-[#262c39] bg-[#101217] p-2">
                {crossSellAvailableProducts.map((prod) => {
                  const isSelected = formData.compatibleAccessories.includes(prod.id);
                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center justify-between p-2 text-[12px] cursor-pointer transition-colors border ${
                        isSelected
                          ? "bg-[#142334] border-[#007cc3] text-white"
                          : "bg-[#141720] border-[#262c39] text-[#c0c7d4] hover:border-[#384152]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCrossSell(prod.id)}
                          className="h-3.5 w-3.5 accent-[#007cc3]"
                        />
                        <div className="h-8 w-8 relative bg-[#0f1117] border border-[#262c39] p-0.5 shrink-0 overflow-hidden">
                          <Image
                            src={prod.image || "/images/products/1228429.jpg"}
                            alt={prod.name}
                            width={32}
                            height={32}
                            className="object-contain"
                          />
                        </div>
                        <div>
                          <p className="font-medium text-white line-clamp-1">{prod.name}</p>
                          <p className="font-heading text-[10px] uppercase font-bold text-[#8a92a3]">{prod.sku} · {prod.family}</p>
                        </div>
                      </div>
                      <span className="font-heading font-bold text-white text-[13px]">
                        ${prod.price.toFixed(2)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: Search & Social SEO */}
          {activeTab === "seo" && (
            <div className="space-y-4">
              <SEOEditor
                type="product"
                nameOrTitle={formData.name}
                defaultDescription={formData.description}
                urlPath={editingProduct ? `/p/${editingProduct.id}` : `/p/${formData.sku || "new-product"}`}
                image={formData.image}
                category={formData.category}
                specs={formData.specs}
                seoTitle={formData.seoTitle}
                seoDescription={formData.seoDescription}
                focusKeywords={formData.focusKeywords}
                canonicalUrl={formData.canonicalUrl}
                noIndex={formData.noIndex}
                ogImage={formData.ogImage}
                onChange={(updates) => {
                  setFormData((prev) => ({
                    ...prev,
                    ...updates,
                  }));
                }}
              />
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-[#232732]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#737b8c]">
                Active: <span className="text-white uppercase font-heading font-bold">{activeTab}</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
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
                {editingProduct ? "Save Changes" : "Publish to Catalog"}
              </button>
            </div>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
