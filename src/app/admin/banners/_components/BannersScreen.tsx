"use client";

import { AutoTranslateButton } from "@/components/admin/AutoTranslateButton";
import { useState } from "react";
import Image from "next/image";
import {
  ExternalLink,
  Trash2,
  Edit,
} from "lucide-react";
import type { Banner, BannerPosition } from "@/lib/cms/types";
import { useAdminCollection } from "@/hooks/useAdminCollection";
import { AdminPageControls } from "@/components/admin/AdminPageControls";
import { writeAdminRecord, archiveAdminRecord } from "@/lib/admin-collection";
import type { BannerTranslatable, Translations } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";
import { LocaleTabs, SharedAcrossLanguages, type ContentLocale } from "@/components/admin/LocaleTabs";
import { TranslationField } from "@/components/admin/TranslationField";
import { translationStatus } from "@/lib/cms/translation-input";
import { getOverlayString, setOverlayValue } from "@/lib/cms/translation-edit";
import { BANNER_SPEC } from "@/i18n/translate-record";

export default function AdminBannersPage() {
  const collection = useAdminCollection<Banner>("banners");
  const {items:banners, loading} = collection;
  const fetchBanners = collection.reload;
  // Task 24: ru/kk translations are stored on both backends (PostgreSQL: page_version_translations).
  const translatable = true;
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


  const handleOpenAdd = () => {
    setEditingBanner(null);
    setFormData({
      title: "New banner",
      subtitle: "",
      ctaLabel: "Shop",
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
    if(!confirm(collection.backend==="postgres"?"Archive this record?":"Permanently delete this record? This cannot be undone.")) return;
    try {
      const item=banners.find(item=>item.id===id); if(!item) return;
      await archiveAdminRecord(fetch,"banners",item);
      fetchBanners();
    } catch(error) { collection.setError(error instanceof Error ? error.message : "Change failed"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    try {
      // ru/kk overlays are stored by the legacy JSON CMS only (the PostgreSQL service rejects them).
      const { translations, ...base } = formData;
      const payload = {
        ...(editingBanner ? { id: editingBanner.id, ...(editingBanner.version===undefined?{}:{version:editingBanner.version}) } : {}),
        ...base,
        ...(translatable ? { translations } : {}),
      };

      await writeAdminRecord(fetch,"banners",payload);
      setIsModalOpen(false);
      fetchBanners();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Change failed";
      const badLocale = /^translations\.(ru|kk)\b/.exec(message)?.[1] as "ru" | "kk" | undefined;
      if (badLocale) { setContentLocale(badLocale); setSaveError(message); return; }
      collection.setError(message);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageControls page={collection} />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="g-heading g-h2 text-black">Banners</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Homepage hero slides, promo tiles and the announcement bar.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="g-btn g-btn--black gap-2"
        >
          <span>Add New Banner</span>
        </button>
      </div>

      {/* Grid of Banners */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading banners...</p>
        ) : (
          banners.map((b) => (
            <div
              key={b.id}
              className="border border-border bg-white rounded-none overflow-hidden flex flex-col justify-between hover:border-neutral-300 transition-colors"
            >
              {/* Media Preview Box */}
              <div className="relative h-48 w-full bg-neutral-100 overflow-hidden border-b border-border">
                <Image
                  src={b.image || "/marq/images/kv-bg.jpg"}
                  alt={b.title}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/40" />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 bg-neutral-900/90 text-white rounded-none">
                    {b.position.replace("_", " ")}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-none text-white ${
                      b.active ? "bg-emerald-600" : "bg-neutral-500"
                    }`}
                  >
                    {b.active ? "Active" : "Disabled"}
                  </span>
                </div>

                <div className="absolute top-3 right-3 text-xs font-semibold bg-white/95 text-black px-2.5 py-0.5 rounded-none">
                  ORDER #{b.order}
                </div>

                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="g-heading text-lg text-white line-clamp-1">
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
                      <span className="text-xs font-semibold text-garmin-blue bg-garmin-blue/10 px-2.5 py-1 rounded-none border border-garmin-blue/20">
                        {b.ctaLabel}
                      </span>
                    )}
                    {b.ctaUrl && (
                      <a
                        href={b.ctaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-black transition-colors"
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
                      className="p-2 text-muted-foreground hover:text-black hover:bg-neutral-100 transition-colors rounded-none"
                      title="Edit Banner"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id)}
                      className="p-2 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-none"
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
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {collection.error&&<div role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{collection.error}<button type="button" className="ml-3 underline" onClick={()=>{setIsModalOpen(false);collection.reload();}}>Reload records</button></div>}
          {translatable && <LocaleTabs
            value={contentLocale}
            onChange={setContentLocale}
            status={{
              ru: translationStatus(formData, "ru", BANNER_SPEC),
              kk: translationStatus(formData, "kk", BANNER_SPEC),
            }}
          />}
          <AutoTranslateButton kind="banner" record={() => formData} onTranslated={(translations) => setFormData((prev) => ({ ...prev, translations: translations as typeof prev.translations }))} />

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
              <section className="space-y-2 border border-dashed border-border bg-neutral-50 p-3">
                <SharedAcrossLanguages />
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="font-semibold text-muted-foreground">Image</dt>
                    <dd className="mt-1 truncate tabular-nums text-black">{formData.image}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted-foreground">Target URL</dt>
                    <dd className="mt-1 truncate tabular-nums text-black">{formData.ctaUrl}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted-foreground">Placement</dt>
                    <dd className="mt-1 text-black">{formData.position}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-muted-foreground">Active / order</dt>
                    <dd className="mt-1 text-black">
                      {formData.active ? "Yes" : "No"} · {formData.order}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : (
          <>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Headline Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. MARQ® (Gen 2) Carbon Collection"
              className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Subtitle / Supporting Text
            </label>
            <textarea
              rows={2}
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="e.g. Machined from a solid block of 130 layers of fused carbon fiber."
              className="w-full border border-border bg-white p-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Background Image Path *
            </label>
            <input
              type="text"
              required
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              placeholder="/marq/images/kv-bg.jpg or /images/hero/..."
              className="h-10 w-full border border-border bg-white px-3 text-sm tabular-nums text-black focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Button Label
              </label>
              <input
                type="text"
                value={formData.ctaLabel}
                onChange={(e) => setFormData({ ...formData, ctaLabel: e.target.value })}
                placeholder="e.g. Shop"
                className="h-10 w-full border border-border bg-white px-3 text-sm font-semibold text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Target URL / Route
              </label>
              <input
                type="text"
                value={formData.ctaUrl}
                onChange={(e) => setFormData({ ...formData, ctaUrl: e.target.value })}
                placeholder="/minisite/marq or /p/1228429"
                className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Placement Position
              </label>
              <select
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value as BannerPosition })}
                className="h-10 w-full border border-border bg-white px-3 text-sm font-semibold text-black focus:border-black focus:outline-none rounded-none"
              >
                <option value="hero">Hero Rotator Slide</option>
                <option value="promo_pod">Promo Feature Pod</option>
                <option value="announcement">Top Notification Bar</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Display Order
              </label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                className="h-10 w-full border border-border bg-white px-3 text-sm font-semibold text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-black">
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

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="g-btn g-btn--secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="g-btn g-btn--black"
            >
              {editingBanner ? "Save Changes" : "Create Banner"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
