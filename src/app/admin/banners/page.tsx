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
import type { Banner, BannerPosition, BannerTranslatable, Translations } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";
import { LocaleTabs, SharedAcrossLanguages, type ContentLocale } from "@/components/admin/LocaleTabs";
import { TranslationField } from "@/components/admin/TranslationField";
import { translationStatus } from "@/lib/cms/translation-input";
import { getOverlayString, setOverlayValue } from "@/lib/cms/translation-edit";
import { BANNER_SPEC } from "@/i18n/translate-record";

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [contentLocale, setContentLocale] = useState<ContentLocale>("en");
  const [saveError, setSaveError] = useState("");

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
    translations: {} as Translations<BannerTranslatable>,
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
      translations: {},
    });
    setContentLocale("en");
    setSaveError("");
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
      translations: b.translations || {},
    });
    setContentLocale("en");
    setSaveError("");
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
    setSaveError("");
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
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      const badLocale = /^translations\.(ru|kk)\b/.exec(data.error || "")?.[1] as "ru" | "kk" | undefined;
      if (badLocale) setContentLocale(badLocale);
      setSaveError(data.error || `Save failed (HTTP ${res.status}).`);
    } catch (err) {
      console.error("Failed to save banner:", err);
      setSaveError("Network error — the banner was not saved.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-[#007cc3]" />
            <h1 className="g-heading text-2xl uppercase tracking-tight text-neutral-900">
              Hero Rotators & Marketing Banners
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Manage homepage visual hero sliders, promo pods, and top header announcement messages.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-black px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add New Banner</span>
        </button>
      </div>

      {/* Grid of Banners */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading ? (
          <p className="text-sm text-neutral-400">Loading banners...</p>
        ) : (
          banners.map((b) => (
            <div
              key={b.id}
              className="border border-neutral-200 bg-white rounded-none shadow-sm overflow-hidden flex flex-col justify-between hover:border-neutral-300 transition-colors"
            >
              {/* Media Preview Box */}
              <div className="relative h-48 w-full bg-neutral-100 overflow-hidden border-b border-neutral-200">
                <Image
                  src={b.image || "/marq/images/kv-bg.jpg"}
                  alt={b.title}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-neutral-900/90 text-white rounded-none shadow-xs">
                    {b.position.replace("_", " ")}
                  </span>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-none shadow-xs text-white ${
                      b.active ? "bg-emerald-600" : "bg-neutral-500"
                    }`}
                  >
                    {b.active ? "Active" : "Disabled"}
                  </span>
                </div>

                <div className="absolute top-3 right-3 text-xs font-semibold bg-white/95 text-neutral-900 px-2.5 py-0.5 rounded-none shadow-xs">
                  ORDER #{b.order}
                </div>

                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="g-heading text-lg uppercase tracking-tight text-white drop-shadow-sm line-clamp-1">
                    {b.title}
                  </h3>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  {b.subtitle && (
                    <p className="text-xs text-neutral-600 line-clamp-2">{b.subtitle}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {b.ctaLabel && (
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#007cc3] bg-[#007cc3]/10 px-2.5 py-1 rounded-none border border-[#007cc3]/20">
                        {b.ctaLabel}
                      </span>
                    )}
                    {b.ctaUrl && (
                      <a
                        href={b.ctaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-400 hover:text-black transition-colors"
                        title="Open Link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(b)}
                      className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors rounded-none"
                      title="Edit Banner"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id)}
                      className="p-2 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-none"
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <LocaleTabs
            value={contentLocale}
            onChange={setContentLocale}
            status={{
              ru: translationStatus(formData, "ru", BANNER_SPEC),
              kk: translationStatus(formData, "kk", BANNER_SPEC),
            }}
          />

          {contentLocale !== "en" ? (
            <div key={contentLocale} className="space-y-4">
              <TranslationField
                label="Headline title"
                field="title"
                value={getOverlayString(formData.translations, contentLocale, ["title"])}
                source={formData.title}
                onChange={(v) =>
                  setFormData({ ...formData, translations: setOverlayValue(formData.translations, contentLocale, ["title"], v) })
                }
              />
              <TranslationField
                label="Subtitle / supporting text"
                field="subtitle"
                multiline
                rows={2}
                value={getOverlayString(formData.translations, contentLocale, ["subtitle"])}
                source={formData.subtitle}
                onChange={(v) =>
                  setFormData({ ...formData, translations: setOverlayValue(formData.translations, contentLocale, ["subtitle"], v) })
                }
              />
              <TranslationField
                label="Button label"
                field="ctaLabel"
                value={getOverlayString(formData.translations, contentLocale, ["ctaLabel"])}
                source={formData.ctaLabel}
                onChange={(v) =>
                  setFormData({ ...formData, translations: setOverlayValue(formData.translations, contentLocale, ["ctaLabel"], v) })
                }
              />
              <section className="space-y-2 border border-dashed border-neutral-300 bg-neutral-50 p-3">
                <SharedAcrossLanguages />
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="font-semibold uppercase tracking-wider text-neutral-500">Image</dt>
                    <dd className="mt-1 truncate font-mono text-neutral-800">{formData.image}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wider text-neutral-500">Target URL</dt>
                    <dd className="mt-1 truncate font-mono text-neutral-800">{formData.ctaUrl}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wider text-neutral-500">Placement</dt>
                    <dd className="mt-1 uppercase text-neutral-800">{formData.position}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wider text-neutral-500">Active / order</dt>
                    <dd className="mt-1 text-neutral-800">
                      {formData.active ? "Yes" : "No"} · {formData.order}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : (
          <>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Headline Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. MARQ® (Gen 2) Carbon Collection"
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Subtitle / Supporting Text
            </label>
            <textarea
              rows={2}
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="e.g. Machined from a solid block of 130 layers of fused carbon fiber."
              className="w-full border border-neutral-300 bg-white p-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Background Image Path *
            </label>
            <input
              type="text"
              required
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              placeholder="/marq/images/kv-bg.jpg or /images/hero/..."
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-mono text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Button Label
              </label>
              <input
                type="text"
                value={formData.ctaLabel}
                onChange={(e) => setFormData({ ...formData, ctaLabel: e.target.value })}
                placeholder="e.g. Explore MARQ"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Target URL / Route
              </label>
              <input
                type="text"
                value={formData.ctaUrl}
                onChange={(e) => setFormData({ ...formData, ctaUrl: e.target.value })}
                placeholder="/minisite/marq or /p/1228429"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Placement Position
              </label>
              <select
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value as BannerPosition })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              >
                <option value="hero">Hero Rotator Slide</option>
                <option value="promo_pod">Promo Feature Pod</option>
                <option value="announcement">Top Notification Bar</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Display Order
              </label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-neutral-800">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="h-4 w-4 accent-black rounded-none"
                />
                <span>Banner Active</span>
              </label>
            </div>
          </div>
          </>
          )}

          {saveError && (
            <p role="alert" className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {saveError}
            </p>
          )}

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
              {editingBanner ? "Save Changes" : "Create Banner"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
