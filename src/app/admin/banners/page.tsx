"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Image as ImageIcon,
  Plus,
  ExternalLink,
  Trash2,
  Edit,
} from "lucide-react";
import type { Banner, BannerPosition } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    ctaLabel: "Shop Now",
    ctaUrl: "/minisite/marq",
    image: "/marq/images/kv-bg.jpg",
    position: "hero" as BannerPosition,
    active: true,
    order: 1,
  });

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/banners");
      const data = await res.json();
      if (data.banners) setBanners(data.banners);
    } catch (err) {
      console.error("Error loading banners:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const handleOpenAdd = () => {
    setEditingBanner(null);
    setFormData({
      title: "New Promotional Campaign",
      subtitle: "Discover high-performance smartwatches designed for your passion.",
      ctaLabel: "Explore Collection",
      ctaUrl: "/minisite/marq",
      image: "/marq/images/kv-bg.jpg",
      position: "hero",
      active: true,
      order: banners.length + 1,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: Banner) => {
    setEditingBanner(b);
    setFormData({
      title: b.title,
      subtitle: b.subtitle || "",
      ctaLabel: b.ctaLabel || "Learn More",
      ctaUrl: b.ctaUrl || "#",
      image: b.image || "/marq/images/kv-bg.jpg",
      position: b.position,
      active: b.active,
      order: b.order,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this banner?")) return;
    try {
      await fetch(`/api/admin/banners?id=${id}`, { method: "DELETE" });
      setBanners(banners.filter((b) => b.id !== id));
    } catch (err) {
      console.error("Failed to delete banner:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingBanner ? { id: editingBanner.id } : {}),
        ...formData,
      };

      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchBanners();
      }
    } catch (err) {
      console.error("Failed to save banner:", err);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <ImageIcon className="h-6 w-6 text-[#007cc3]" />
            <span>Hero Rotators & Marketing Banners</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Manage homepage visual hero sliders, promo pods, and top header announcement messages.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-[#007cc3] px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add New Banner</span>
        </button>
      </div>

      {/* Grid of Banners */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading ? (
          <p className="text-sm text-[#737b8c]">Loading banners...</p>
        ) : (
          banners.map((b) => (
            <div
              key={b.id}
              className="border border-[#262c39] bg-[#141720] overflow-hidden flex flex-col justify-between"
            >
              {/* Media Preview Box */}
              <div className="relative h-48 w-full bg-[#0f1117] overflow-hidden border-b border-[#232732]">
                <Image
                  src={b.image || "/marq/images/kv-bg.jpg"}
                  alt={b.title}
                  fill
                  className="object-cover opacity-75"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#141720] via-transparent to-transparent" />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 bg-[#142334] text-[#60a5fa] border border-[#60a5fa]/30">
                    {b.position.replace("_", " ")}
                  </span>
                  <span
                    className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 ${
                      b.active
                        ? "bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30"
                        : "bg-[#101217] text-[#8a92a3] border border-[#262c39]"
                    }`}
                  >
                    {b.active ? "Active" : "Disabled"}
                  </span>
                </div>

                <div className="absolute top-3 right-3 font-heading font-bold text-[10px] bg-[#101217]/80 text-[#c0c7d4] px-2 py-0.5 border border-[#262c39]">
                  ORDER #{b.order}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-heading uppercase tracking-wider text-base font-bold text-white line-clamp-1">{b.title}</h3>
                  {b.subtitle && (
                    <p className="text-[12px] text-[#8a92a3] mt-1 line-clamp-2">{b.subtitle}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-[#232732] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {b.ctaLabel && (
                      <span className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#007cc3] bg-[#007cc3]/10 px-2 py-0.5 border border-[#007cc3]/20">
                        {b.ctaLabel}
                      </span>
                    )}
                    {b.ctaUrl && (
                      <a
                        href={b.ctaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#737b8c] hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(b)}
                      className="p-1.5 text-[#8a92a3] hover:bg-[#1f2430] hover:text-white"
                      title="Edit Banner"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id)}
                      className="p-1.5 text-[#8a92a3] hover:bg-rose-500/10 hover:text-rose-400"
                      title="Delete Banner"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Banner Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBanner ? "Edit Promotional Banner" : "Create New Banner"}
        subtitle="Manage hero graphics, title copy, call-to-action button, and placement"
      >
        <form onSubmit={handleSubmit} className="space-y-4 font-sans">
          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Headline Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. MARQ® (Gen 2) Carbon Collection"
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-heading tracking-wider"
            />
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Subtitle / Supporting Text
            </label>
            <textarea
              rows={2}
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="e.g. Machined from a solid block of 130 layers of fused carbon fiber."
              className="mt-1 w-full border border-[#262c39] bg-[#101217] p-2.5 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Background Image Path *
            </label>
            <input
              type="text"
              required
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              placeholder="/marq/images/kv-bg.jpg or /images/hero/..."
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-mono"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Button Label
              </label>
              <input
                type="text"
                value={formData.ctaLabel}
                onChange={(e) => setFormData({ ...formData, ctaLabel: e.target.value })}
                placeholder="e.g. Explore MARQ"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-heading uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Target URL / Route
              </label>
              <input
                type="text"
                value={formData.ctaUrl}
                onChange={(e) => setFormData({ ...formData, ctaUrl: e.target.value })}
                placeholder="/minisite/marq or /p/1228429"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Placement Position
              </label>
              <select
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value as BannerPosition })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading uppercase font-bold text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="hero">Hero Rotator Slide</option>
                <option value="promo_pod">Promo Feature Pod</option>
                <option value="announcement">Top Notification Bar</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Display Order
              </label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-heading font-bold"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-[12px] text-[#c0c7d4]">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="h-4 w-4 accent-[#007cc3]"
                />
                <span className="font-heading uppercase tracking-wider font-bold">Banner Active</span>
              </label>
            </div>
          </div>

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
              {editingBanner ? "Save Changes" : "Create Banner"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
