"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Layers,
  Sparkles,
  ExternalLink,
  Plus,
  Trash2,
  Edit2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Info,
  ArrowUp,
  ArrowDown,
  Sliders,
  Image as ImageIcon
} from "lucide-react";
import type {
  HomepageConfig,
  HeroBanner,
  CarouselBlock,
  ProductCarouselItem,
  PromoCarouselItem,
  HomepageTileBlock,
  CarouselType,
  ImageDimensionSpec
} from "@/lib/cms/types";
import { IMAGE_DIMENSION_SPECS } from "@/lib/cms/homepage-schema";
import { AdminModal } from "@/components/admin/AdminModal";
import { LocaleTabs, type ContentLocale } from "@/components/admin/LocaleTabs";
import { HomepageTranslationPanel } from "@/components/admin/HomepageTranslationPanel";
import { translationStatus } from "@/lib/cms/translation-input";
import { HOMEPAGE_SPEC } from "@/i18n/translate-record";

export default function AdminHomepagePage() {
  const [config, setConfig] = useState<HomepageConfig | null>(null);
  const [dimensionSpecs] = useState<Record<string, ImageDimensionSpec>>(IMAGE_DIMENSION_SPECS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"banners" | "carousels" | "blocks" | "specs">("banners");
  const [contentLocale, setContentLocale] = useState<ContentLocale>("en");

  // Modals state
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<{ index: number; data: HeroBanner } | null>(null);

  const [carouselModalOpen, setCarouselModalOpen] = useState(false);
  const [editingCarousel, setEditingCarousel] = useState<{ index: number; data: CarouselBlock } | null>(null);

  const [carouselItemModalOpen, setCarouselItemModalOpen] = useState(false);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<number | null>(null);
  const [editingCarouselItem, setEditingCarouselItem] = useState<{
    itemIndex: number;
    type: CarouselType;
    data: Partial<ProductCarouselItem & PromoCarouselItem>;
  } | null>(null);

  const [tileModalOpen, setTileModalOpen] = useState(false);
  const [tileCategory, setTileCategory] = useState<"promoTiles" | "storyTiles" | "categoryTiles">("promoTiles");
  const [editingTile, setEditingTile] = useState<{ index: number; data: HomepageTileBlock } | null>(null);

  // Fetch Homepage Config
  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/homepage");
      if (!res.ok) throw new Error("Failed to load homepage configuration");
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error(err);
      showNotification("error", "Failed to load homepage configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Save changes to API
  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      const res = await fetch("/api/admin/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfig(data.config);
        showNotification("success", "Homepage configuration saved successfully!");
      } else {
        const detail = Array.isArray(data.details) && data.details.length ? `: ${data.details.join("; ")}` : "";
        throw new Error(data.error && detail && !data.details.includes(data.error) ? `${data.error}${detail}` : data.error || "Save failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save homepage changes";
      showNotification("error", msg);
    } finally {
      setSaving(false);
    }
  };

  // Reset to default
  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset homepage configuration to defaults? Unsaved changes will be lost.")) {
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/admin/homepage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (res.ok && data.config) {
        setConfig(data.config);
        showNotification("success", "Homepage reset to default template.");
      }
    } catch (err) {
      console.error(err);
      showNotification("error", "Failed to reset homepage config.");
    } finally {
      setSaving(false);
    }
  };

  // ---------------- BANNERS LOGIC ----------------
  const handleOpenAddBanner = () => {
    setEditingBanner({
      index: -1,
      data: {
        id: `banner-${Date.now()}`,
        key: `slide-${(config?.heroBanners.length || 0) + 1}`,
        title: "",
        subtitle: "",
        image: "/homepage/featured/holiday.jpg",
        href: "/c/wearables-smartwatches",
        active: true,
        order: (config?.heroBanners.length || 0) + 1,
      },
    });
    setBannerModalOpen(true);
  };

  const handleOpenEditBanner = (index: number) => {
    if (!config) return;
    setEditingBanner({
      index,
      data: { ...config.heroBanners[index] },
    });
    setBannerModalOpen(true);
  };

  const handleSaveBannerModal = () => {
    if (!config || !editingBanner) return;
    const newBanners = [...config.heroBanners];
    if (editingBanner.index >= 0) {
      newBanners[editingBanner.index] = editingBanner.data;
    } else {
      newBanners.push(editingBanner.data);
    }
    setConfig({ ...config, heroBanners: newBanners });
    setBannerModalOpen(false);
    setEditingBanner(null);
  };

  const handleDeleteBanner = (index: number) => {
    if (!config) return;
    if (confirm("Remove this hero banner?")) {
      const newBanners = config.heroBanners.filter((_, i) => i !== index);
      setConfig({ ...config, heroBanners: newBanners });
    }
  };

  const handleMoveBanner = (index: number, direction: "up" | "down") => {
    if (!config) return;
    const newBanners = [...config.heroBanners];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBanners.length) return;
    const temp = newBanners[index];
    newBanners[index] = newBanners[targetIndex];
    newBanners[targetIndex] = temp;
    // update order numbers
    newBanners.forEach((b, i) => (b.order = i + 1));
    setConfig({ ...config, heroBanners: newBanners });
  };

  // ---------------- CAROUSEL LOGIC ----------------
  const handleOpenAddCarousel = (type: CarouselType) => {
    setEditingCarousel({
      index: -1,
      data: {
        id: `carousel-${Date.now()}`,
        title: type === "product" ? "Featured Products Carousel" : "Promotional Banner Carousel",
        subtitle: type === "product" ? "Hand-picked gear and exclusive deals" : "Discover our latest seasonal features",
        type,
        active: true,
        order: (config?.carousels.length || 0) + 1,
        items: [],
      },
    });
    setCarouselModalOpen(true);
  };

  const handleOpenEditCarousel = (index: number) => {
    if (!config) return;
    setEditingCarousel({
      index,
      data: { ...config.carousels[index] },
    });
    setCarouselModalOpen(true);
  };

  const handleSaveCarouselModal = () => {
    if (!config || !editingCarousel) return;
    const newCarousels = [...config.carousels];
    if (editingCarousel.index >= 0) {
      newCarousels[editingCarousel.index] = editingCarousel.data;
    } else {
      newCarousels.push(editingCarousel.data);
    }
    setConfig({ ...config, carousels: newCarousels });
    setCarouselModalOpen(false);
    setEditingCarousel(null);
  };

  const handleDeleteCarousel = (index: number) => {
    if (!config) return;
    if (confirm("Delete this entire carousel section?")) {
      const newCarousels = config.carousels.filter((_, i) => i !== index);
      setConfig({ ...config, carousels: newCarousels });
    }
  };

  // Carousel Item Logic
  const handleOpenAddCarouselItem = (carouselIndex: number) => {
    if (!config) return;
    const carousel = config.carousels[carouselIndex];
    setActiveCarouselIndex(carouselIndex);
    setEditingCarouselItem({
      itemIndex: -1,
      type: carousel.type,
      data: {
        id: `item-${Date.now()}`,
        title: "",
        description: "",
        image: carousel.type === "product" ? "/homepage/featured/fenix9.jpg" : "/homepage/featured/holiday.jpg",
        href: "/c/wearables-smartwatches",
        price: "$499.99",
        badge: "NEW",
        ctaText: "SHOP NOW",
        order: carousel.items.length + 1,
      },
    });
    setCarouselItemModalOpen(true);
  };

  const handleOpenEditCarouselItem = (carouselIndex: number, itemIndex: number) => {
    if (!config) return;
    const carousel = config.carousels[carouselIndex];
    setActiveCarouselIndex(carouselIndex);
    setEditingCarouselItem({
      itemIndex,
      type: carousel.type,
      data: { ...carousel.items[itemIndex] },
    });
    setCarouselItemModalOpen(true);
  };

  const handleSaveCarouselItemModal = () => {
    if (!config || activeCarouselIndex === null || !editingCarouselItem) return;
    const newCarousels = [...config.carousels];
    const carousel = { ...newCarousels[activeCarouselIndex] };
    const items = [...carousel.items];

    if (editingCarouselItem.itemIndex >= 0) {
      items[editingCarouselItem.itemIndex] = editingCarouselItem.data as ProductCarouselItem | PromoCarouselItem;
    } else {
      items.push(editingCarouselItem.data as ProductCarouselItem | PromoCarouselItem);
    }

    carousel.items = items;
    newCarousels[activeCarouselIndex] = carousel;
    setConfig({ ...config, carousels: newCarousels });
    setCarouselItemModalOpen(false);
    setEditingCarouselItem(null);
  };

  const handleDeleteCarouselItem = (carouselIndex: number, itemIndex: number) => {
    if (!config) return;
    const newCarousels = [...config.carousels];
    const carousel = { ...newCarousels[carouselIndex] };
    carousel.items = carousel.items.filter((_, i) => i !== itemIndex);
    newCarousels[carouselIndex] = carousel;
    setConfig({ ...config, carousels: newCarousels });
  };

  // ---------------- TILES LOGIC ----------------
  const handleOpenEditTile = (category: "promoTiles" | "storyTiles" | "categoryTiles", index: number) => {
    if (!config) return;
    setTileCategory(category);
    setEditingTile({
      index,
      data: { ...config[category][index] },
    });
    setTileModalOpen(true);
  };

  const handleSaveTileModal = () => {
    if (!config || !editingTile) return;
    const newTiles = [...config[tileCategory]];
    newTiles[editingTile.index] = editingTile.data;
    setConfig({ ...config, [tileCategory]: newTiles });
    setTileModalOpen(false);
    setEditingTile(null);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-[#007cc3]" />
          <p className="text-sm font-medium text-neutral-500">Loading Homepage CMS Configuration...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-semibold">Unable to load homepage configuration.</p>
        <button
          onClick={loadConfig}
          className="mt-3 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Notification */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-lg p-4 text-sm font-medium shadow-sm transition-all ${
            notification.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs uppercase tracking-wider text-neutral-400 hover:text-black"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 font-heading">
              Homepage Layout & Blocks
            </h1>
            <span className="rounded-full bg-[#007cc3]/10 px-2.5 py-0.5 text-xs font-semibold text-[#007cc3] border border-[#007cc3]/20">
              CMS v2.4
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Control hero banners, dual-type carousels (Products & Promo Cards), and containing grid blocks with image size specifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Storefront
          </Link>

          <button
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
            title="Reset to default template"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#007cc3] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0066a1] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving Changes..." : "Save All Changes"}
          </button>
        </div>
      </div>

      {/* Image Size Reference Callout Box */}
      <div className="rounded-lg border border-sky-100 bg-gradient-to-r from-sky-50/70 via-blue-50/40 to-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-[#007cc3] p-1.5 text-white">
            <Info className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-sky-950 font-heading">
                Required Image Upload Specifications & Guidelines
              </h2>
              <button
                onClick={() => setActiveTab("specs")}
                className="text-xs font-semibold text-[#007cc3] underline hover:text-[#005f94]"
              >
                View full specifications guide &rarr;
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border border-white/80 bg-white/80 p-2.5 shadow-xs">
                <span className="text-[11px] font-semibold text-neutral-500 block">Hero Banners</span>
                <span className="text-xs font-bold text-neutral-900 font-mono">1920 × 800 px</span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">Ratio: 2.4:1 / 16:9 (Max 2MB)</span>
              </div>
              <div className="rounded border border-white/80 bg-white/80 p-2.5 shadow-xs">
                <span className="text-[11px] font-semibold text-neutral-500 block">Product Carousel</span>
                <span className="text-xs font-bold text-neutral-900 font-mono">800 × 800 px</span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">Ratio: 1:1 Square (Max 1MB)</span>
              </div>
              <div className="rounded border border-white/80 bg-white/80 p-2.5 shadow-xs">
                <span className="text-[11px] font-semibold text-neutral-500 block">Promo Card Carousel</span>
                <span className="text-xs font-bold text-neutral-900 font-mono">1200 × 600 px</span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">Ratio: 2:1 Landscape (Max 1.5MB)</span>
              </div>
              <div className="rounded border border-white/80 bg-white/80 p-2.5 shadow-xs">
                <span className="text-[11px] font-semibold text-neutral-500 block">Containing Pods</span>
                <span className="text-xs font-bold text-neutral-900 font-mono">600 × 400 px</span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">Ratio: 3:2 Landscape (Max 1MB)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LocaleTabs
        value={contentLocale}
        onChange={setContentLocale}
        status={{
          ru: translationStatus(config, "ru", HOMEPAGE_SPEC),
          kk: translationStatus(config, "kk", HOMEPAGE_SPEC),
        }}
      />

      {contentLocale !== "en" ? (
        <HomepageTranslationPanel
          key={contentLocale}
          locale={contentLocale}
          config={config}
          onChange={(translations) => setConfig({ ...config, translations })}
        />
      ) : (
      <>
      {/* Tabs Header */}
      <div className="flex border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("banners")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === "banners"
              ? "border-[#007cc3] text-[#007cc3]"
              : "border-transparent text-neutral-500 hover:text-black"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Hero Banners ({config.heroBanners.length})
        </button>

        <button
          onClick={() => setActiveTab("carousels")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === "carousels"
              ? "border-[#007cc3] text-[#007cc3]"
              : "border-transparent text-neutral-500 hover:text-black"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Carousels ({config.carousels.length})
        </button>

        <button
          onClick={() => setActiveTab("blocks")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === "blocks"
              ? "border-[#007cc3] text-[#007cc3]"
              : "border-transparent text-neutral-500 hover:text-black"
          }`}
        >
          <Layers className="h-4 w-4" />
          Containing Blocks ({config.promoTiles.length + config.storyTiles.length + config.categoryTiles.length})
        </button>

        <button
          onClick={() => setActiveTab("specs")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === "specs"
              ? "border-[#007cc3] text-[#007cc3]"
              : "border-transparent text-neutral-500 hover:text-black"
          }`}
        >
          <HelpCircle className="h-4 w-4" />
          Image Specifications
        </button>
      </div>

      {/* ================= TAB 1: HERO BANNERS ================= */}
      {activeTab === "banners" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                Homepage Hero Rotator Slides
              </h2>
              <p className="text-xs text-neutral-500">
                Rotates across the top of the homepage. Use full-width 1920 × 800 px images.
              </p>
            </div>
            <button
              onClick={handleOpenAddBanner}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-black"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Hero Slide
            </button>
          </div>

          <div className="grid gap-3">
            {config.heroBanners.map((banner, index) => (
              <div
                key={banner.id || index}
                className={`flex flex-col sm:flex-row items-center gap-4 rounded-lg border bg-white p-3.5 shadow-2xs transition-all ${
                  banner.active ? "border-neutral-200" : "border-neutral-200 bg-neutral-50/50 opacity-60"
                }`}
              >
                {/* Thumbnail Preview */}
                <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded bg-neutral-100 border border-neutral-200">
                  <Image
                    src={banner.image || "/homepage/featured/holiday.jpg"}
                    alt={banner.title || "Banner"}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-mono text-white">
                    1920x800
                  </span>
                </div>

                {/* Banner Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-mono text-neutral-600 font-bold">
                      #{index + 1}
                    </span>
                    <h3 className="truncate text-sm font-bold text-neutral-900 font-heading">
                      {banner.title || "(Untitled Banner)"}
                    </h3>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                        banner.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {banner.active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{banner.subtitle || "No subtitle provided"}</p>
                  <p className="mt-1 truncate text-[11px] font-mono text-neutral-400">
                    URL: {banner.href}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleMoveBanner(index, "up")}
                    disabled={index === 0}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-black disabled:opacity-20"
                    title="Move slide up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMoveBanner(index, "down")}
                    disabled={index === config.heroBanners.length - 1}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-black disabled:opacity-20"
                    title="Move slide down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleOpenEditBanner(index)}
                    className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-[#007cc3]"
                    title="Edit banner"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBanner(index)}
                    className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                    title="Delete banner"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= TAB 2: CAROUSELS (DUAL TYPE) ================= */}
      {activeTab === "carousels" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                Homepage Carousels (Dual-Type Architecture)
              </h2>
              <p className="text-xs text-neutral-500">
                Configure both Type 1 (Product Cards with Price & Tags) and Type 2 (Promo Photos & Action Buttons).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenAddCarousel("product")}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#007cc3] bg-[#007cc3]/10 px-3 py-1.5 text-xs font-semibold text-[#007cc3] hover:bg-[#007cc3]/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Type 1 (Product Carousel)
              </button>
              <button
                onClick={() => handleOpenAddCarousel("promo")}
                className="inline-flex items-center gap-1.5 rounded-md border border-purple-600 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Type 2 (Promo Carousel)
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {config.carousels.map((carousel, cIndex) => {
              const isProductType = carousel.type === "product";

              return (
                <div
                  key={carousel.id || cIndex}
                  className="rounded-lg border border-neutral-200 bg-white p-5 shadow-xs"
                >
                  {/* Carousel Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                          isProductType
                            ? "bg-[#007cc3]/10 text-[#007cc3] border border-[#007cc3]/20"
                            : "bg-purple-100 text-purple-800 border border-purple-200"
                        }`}
                      >
                        {isProductType ? "Type 1: Product Carousel" : "Type 2: Promo Photo & Button"}
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-neutral-900 font-heading">
                          {carousel.title}
                        </h3>
                        {carousel.subtitle && (
                          <p className="text-xs text-neutral-500 mt-0.5">{carousel.subtitle}</p>
                        )}
                        <span className="inline-block mt-1 text-[11px] font-mono text-neutral-400">
                          {isProductType
                            ? "Image spec: 800 × 800 px (1:1 Square)"
                            : "Image spec: 1200 × 600 px (2:1 Landscape)"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenAddCarouselItem(cIndex)}
                        className="inline-flex items-center gap-1 rounded bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-black"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Card
                      </button>
                      <button
                        onClick={() => handleOpenEditCarousel(cIndex)}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-black"
                        title="Edit Carousel Settings"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCarousel(cIndex)}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                        title="Delete Carousel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Carousel Cards Grid */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {carousel.items.map((item, iIndex) => {
                      const prodItem = item as ProductCarouselItem;
                      const promoItem = item as PromoCarouselItem;

                      return (
                        <div
                          key={item.id || iIndex}
                          className="group relative flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-neutral-50/40 p-3 hover:border-neutral-300 hover:bg-white transition-all"
                        >
                          {/* Image preview */}
                          <div
                            className={`relative w-full overflow-hidden rounded bg-neutral-200 mb-2.5 ${
                              isProductType ? "aspect-square" : "aspect-2/1"
                            }`}
                          >
                            <Image
                              src={item.image || "/homepage/featured/holiday.jpg"}
                              alt={item.title || "Item"}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                            {/* Badges / Tags */}
                            {isProductType && prodItem.badge && (
                              <span
                                className={`absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-xs ${
                                  prodItem.badge === "NEW"
                                    ? "bg-[#007cc3] text-white"
                                    : "bg-emerald-600 text-white"
                                }`}
                              >
                                {prodItem.badge}
                              </span>
                            )}
                            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-mono text-white">
                              {isProductType ? "800x800" : "1200x600"}
                            </span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <h4 className="truncate text-xs font-bold text-neutral-900 font-heading">
                              {item.title || "(Untitled Item)"}
                            </h4>
                            <p className="line-clamp-2 text-[11px] text-neutral-500 mt-0.5">
                              {item.description || "No description"}
                            </p>

                            {/* Type Specific Fields */}
                            {isProductType ? (
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className="text-xs font-bold text-neutral-900 font-mono">
                                  {prodItem.price || "$0.00"}
                                </span>
                                {prodItem.originalPrice && (
                                  <span className="text-[10px] text-neutral-400 line-through font-mono">
                                    {prodItem.originalPrice}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className="rounded bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-700">
                                  CTA: {promoItem.ctaText || "SHOP"}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Card Action footer */}
                          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2">
                            <span className="text-[10px] font-mono text-neutral-400">Card #{iIndex + 1}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEditCarouselItem(cIndex, iIndex)}
                                className="rounded p-1 text-neutral-500 hover:text-black"
                                title="Edit item"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteCarouselItem(cIndex, iIndex)}
                                className="rounded p-1 text-neutral-400 hover:text-red-600"
                                title="Delete item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {carousel.items.length === 0 && (
                      <div className="col-span-full py-8 text-center border-2 border-dashed border-neutral-200 rounded-md">
                        <p className="text-xs text-neutral-400">No cards in this carousel.</p>
                        <button
                          onClick={() => handleOpenAddCarouselItem(cIndex)}
                          className="mt-2 text-xs font-semibold text-[#007cc3] hover:underline"
                        >
                          + Add your first {isProductType ? "product" : "promo"} card
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 3: CONTAINING BLOCKS ================= */}
      {activeTab === "blocks" && (
        <div className="space-y-8">
          {/* Section: Promotional Pods */}
          <div className="space-y-3">
            <div className="border-b border-neutral-200 pb-2">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                1. Promotional Feature Pods (3-Column Grid)
              </h2>
              <p className="text-xs text-neutral-500">
                Recommended size: 600 × 400 px (3:2 aspect ratio). Highlights key sport/lifestyle categories.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {config.promoTiles.map((tile, index) => (
                <div key={tile.id || index} className="rounded-lg border border-neutral-200 bg-white p-3.5 shadow-2xs">
                  <div className="relative aspect-3/2 w-full overflow-hidden rounded bg-neutral-100 mb-2.5">
                    <Image src={tile.image} alt={tile.title} fill className="object-cover" unoptimized />
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-mono text-white">
                      600x400
                    </span>
                  </div>
                  <h3 className="truncate text-xs font-bold text-neutral-900 font-heading">{tile.title}</h3>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
                    <span className="font-mono text-neutral-400 truncate max-w-[120px]">{tile.href}</span>
                    <span className="font-bold text-neutral-800 font-heading">CTA: {tile.cta}</span>
                  </div>
                  <div className="mt-3 border-t border-neutral-100 pt-2 flex justify-end">
                    <button
                      onClick={() => handleOpenEditTile("promoTiles", index)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#007cc3] hover:underline"
                    >
                      <Edit2 className="h-3 w-3" /> Edit Tile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Stories Pods */}
          <div className="space-y-3">
            <div className="border-b border-neutral-200 pb-2">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                2. Stories & Community Pods (2-Column Grid)
              </h2>
              <p className="text-xs text-neutral-500">
                Recommended size: 600 × 400 px (3:2 aspect ratio). Editorial features, health, and ambassador stories.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {config.storyTiles.map((tile, index) => (
                <div key={tile.id || index} className="rounded-lg border border-neutral-200 bg-white p-3.5 shadow-2xs">
                  <div className="relative aspect-3/2 w-full overflow-hidden rounded bg-neutral-100 mb-2.5">
                    <Image src={tile.image} alt={tile.title} fill className="object-cover" unoptimized />
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-mono text-white">
                      600x400
                    </span>
                  </div>
                  <h3 className="truncate text-xs font-bold text-neutral-900 font-heading">{tile.title}</h3>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
                    <span className="font-mono text-neutral-400 truncate max-w-[180px]">{tile.href}</span>
                    <span className="font-bold text-neutral-800 font-heading">CTA: {tile.cta}</span>
                  </div>
                  <div className="mt-3 border-t border-neutral-100 pt-2 flex justify-end">
                    <button
                      onClick={() => handleOpenEditTile("storyTiles", index)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#007cc3] hover:underline"
                    >
                      <Edit2 className="h-3 w-3" /> Edit Tile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Category Navigation Pods */}
          <div className="space-y-3">
            <div className="border-b border-neutral-200 pb-2">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide">
                3. Category Grid Shortcuts (6-Column Grid)
              </h2>
              <p className="text-xs text-neutral-500">
                Recommended size: 600 × 400 px (3:2 aspect ratio). Direct shortcuts to major category hubs.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {config.categoryTiles.map((tile, index) => (
                <div key={tile.id || index} className="rounded-lg border border-neutral-200 bg-white p-2.5 shadow-2xs">
                  <div className="relative aspect-3/2 w-full overflow-hidden rounded bg-neutral-100 mb-2">
                    <Image src={tile.image} alt={tile.title} fill className="object-cover" unoptimized />
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-mono text-white">
                      600x400
                    </span>
                  </div>
                  <h4 className="truncate text-xs font-bold text-neutral-900 font-heading">{tile.title}</h4>
                  <p className="truncate text-[10px] font-mono text-neutral-400 mt-0.5">{tile.href}</p>
                  <div className="mt-2 border-t border-neutral-100 pt-1.5 flex justify-end">
                    <button
                      onClick={() => handleOpenEditTile("categoryTiles", index)}
                      className="text-[11px] font-semibold text-[#007cc3] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: IMAGE GUIDELINES FULL TABLE ================= */}
      {activeTab === "specs" && (
        <div className="space-y-6">
          <div className="border-b border-neutral-200 pb-3">
            <h2 className="text-base font-bold text-neutral-900 font-heading uppercase tracking-wide">
              Official Media Asset & Image Dimension Guide
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Follow these exact dimension standards when preparing graphic banners, product cutouts, and promotional cards for the Garmin homepage.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(dimensionSpecs).map(([key, spec]) => (
              <div
                key={key}
                className="rounded-lg border border-neutral-200 bg-white p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-[#007cc3] uppercase tracking-wider">
                      {key}
                    </span>
                    <span className="text-xs font-mono text-neutral-500 font-semibold">
                      Max {spec.maxSizeFormatted}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-neutral-900 mt-2 font-heading">
                    {spec.label}
                  </h3>
                  <p className="text-xs text-neutral-600 mt-1">{spec.description}</p>
                </div>

                <div className="mt-4 border-t border-neutral-100 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Recommended Resolution:</span>
                    <span className="font-mono font-bold text-neutral-900">
                      {spec.recommendedWidth} × {spec.recommendedHeight} px
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Aspect Ratio:</span>
                    <span className="font-mono font-bold text-neutral-900">{spec.aspectRatio}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Supported Formats:</span>
                    <span className="font-mono text-neutral-700">WebP, PNG, JPG</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
            <h4 className="font-bold flex items-center gap-1.5 font-heading">
              <Sparkles className="h-4 w-4 text-amber-700" />
              Optimization Best Practices for Garmin Media
            </h4>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-amber-800">
              <li>Always convert exported graphics to modern <strong>WebP</strong> format for fast loading times and reduced mobile bandwidth.</li>
              <li>For Type 1 Product Carousels, use clean cutout PNGs or photos with transparent/neutral background centered in the 800 × 800 px frame.</li>
              <li>Keep hero rotator key focal points in the center 60% of the 1920 × 800 px frame to prevent mobile responsive cropping.</li>
              <li>Ensure compression quality is set between 80% to 85% to maintain crisp typography while staying below file size limits.</li>
            </ul>
          </div>
        </div>
      )}
      </>
      )}

      {/* ================= MODAL: HERO BANNER EDIT ================= */}
      {bannerModalOpen && editingBanner && (
        <AdminModal
          isOpen={bannerModalOpen}
          onClose={() => setBannerModalOpen(false)}
          title={editingBanner.index >= 0 ? "Edit Hero Banner" : "Add Hero Banner"}
          subtitle="Recommended Size: 1920 × 800 px (Ratio ~2.4:1 / 16:9), Max 2MB"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Banner Headline / Title
              </label>
              <input
                type="text"
                value={editingBanner.data.title}
                onChange={(e) =>
                  setEditingBanner({
                    ...editingBanner,
                    data: { ...editingBanner.data, title: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="e.g. HOLIDAY GIFT GUIDE"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Subtitle / Description
              </label>
              <input
                type="text"
                value={editingBanner.data.subtitle}
                onChange={(e) =>
                  setEditingBanner({
                    ...editingBanner,
                    data: { ...editingBanner.data, subtitle: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="e.g. Where 'best gift ever' begins"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Image Path / URL
                </label>
                <span className="text-[11px] font-bold text-[#007cc3] font-mono">
                  Target: 1920 × 800 px
                </span>
              </div>
              <input
                type="text"
                value={editingBanner.data.image}
                onChange={(e) =>
                  setEditingBanner({
                    ...editingBanner,
                    data: { ...editingBanner.data, image: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="/homepage/featured/holiday.jpg"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Asset recommendation: 1920 × 800 px WebP/JPG. Keep focus elements vertically centered.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Destination Link URL
              </label>
              <input
                type="text"
                value={editingBanner.data.href}
                onChange={(e) =>
                  setEditingBanner({
                    ...editingBanner,
                    data: { ...editingBanner.data, href: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="https://www.garmin.com/en-US/p/..."
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="bannerActive"
                checked={editingBanner.data.active}
                onChange={(e) =>
                  setEditingBanner({
                    ...editingBanner,
                    data: { ...editingBanner.data, active: e.target.checked },
                  })
                }
                className="h-4 w-4 rounded border-neutral-300 text-[#007cc3] focus:ring-[#007cc3]"
              />
              <label htmlFor="bannerActive" className="text-xs font-medium text-neutral-700">
                Display this slide on storefront
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setBannerModalOpen(false)}
                className="rounded border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBannerModal}
                className="rounded bg-[#007cc3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0066a1]"
              >
                Save Slide
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* ================= MODAL: CAROUSEL BLOCK EDIT ================= */}
      {carouselModalOpen && editingCarousel && (
        <AdminModal
          isOpen={carouselModalOpen}
          onClose={() => setCarouselModalOpen(false)}
          title={editingCarousel.index >= 0 ? "Edit Carousel Section" : "Add Carousel Section"}
          subtitle={`Carousel Architecture: ${editingCarousel.data.type === "product" ? "Type 1 (Products & Price)" : "Type 2 (Promo Photo & Button)"}`}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Carousel Type
              </label>
              <select
                value={editingCarousel.data.type}
                onChange={(e) =>
                  setEditingCarousel({
                    ...editingCarousel,
                    data: { ...editingCarousel.data, type: e.target.value as CarouselType },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
              >
                <option value="product">Type 1: Product Carousel (Product, Price, NEW/SALE Tag)</option>
                <option value="promo">Type 2: Promo Carousel (Photo, Hyperlink Button, Title)</option>
              </select>
              <p className="mt-1 text-[11px] text-neutral-500">
                {editingCarousel.data.type === "product"
                  ? "Required Image Size: 800 × 800 px (1:1 Square)"
                  : "Required Image Size: 1200 × 600 px (2:1 Landscape)"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Section Title
              </label>
              <input
                type="text"
                value={editingCarousel.data.title}
                onChange={(e) =>
                  setEditingCarousel({
                    ...editingCarousel,
                    data: { ...editingCarousel.data, title: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="e.g. Featured Smartwatches"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Section Subtitle
              </label>
              <input
                type="text"
                value={editingCarousel.data.subtitle || ""}
                onChange={(e) =>
                  setEditingCarousel({
                    ...editingCarousel,
                    data: { ...editingCarousel.data, subtitle: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="e.g. Top picks for training and health"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="carouselActive"
                checked={editingCarousel.data.active}
                onChange={(e) =>
                  setEditingCarousel({
                    ...editingCarousel,
                    data: { ...editingCarousel.data, active: e.target.checked },
                  })
                }
                className="h-4 w-4 rounded border-neutral-300 text-[#007cc3] focus:ring-[#007cc3]"
              />
              <label htmlFor="carouselActive" className="text-xs font-medium text-neutral-700">
                Section is active on storefront
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setCarouselModalOpen(false)}
                className="rounded border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCarouselModal}
                className="rounded bg-[#007cc3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0066a1]"
              >
                Save Section
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* ================= MODAL: CAROUSEL CARD ITEM EDIT ================= */}
      {carouselItemModalOpen && editingCarouselItem && (
        <AdminModal
          isOpen={carouselItemModalOpen}
          onClose={() => setCarouselItemModalOpen(false)}
          title={
            editingCarouselItem.itemIndex >= 0
              ? `Edit ${editingCarouselItem.type === "product" ? "Product Card" : "Promo Card"}`
              : `Add ${editingCarouselItem.type === "product" ? "Product Card" : "Promo Card"}`
          }
          subtitle={
            editingCarouselItem.type === "product"
              ? "Image Dimension: 800 × 800 px (1:1 Square, Max 1MB)"
              : "Image Dimension: 1200 × 600 px (2:1 Landscape, Max 1.5MB)"
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Title / Product Name
              </label>
              <input
                type="text"
                value={editingCarouselItem.data.title || ""}
                onChange={(e) =>
                  setEditingCarouselItem({
                    ...editingCarouselItem,
                    data: { ...editingCarouselItem.data, title: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder={editingCarouselItem.type === "product" ? "e.g. FĒNIX® 9" : "e.g. HOLIDAY GIFT GUIDE"}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Description
              </label>
              <textarea
                rows={2}
                value={editingCarouselItem.data.description || ""}
                onChange={(e) =>
                  setEditingCarouselItem({
                    ...editingCarouselItem,
                    data: { ...editingCarouselItem.data, description: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="Brief summary or marketing callout..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Photo / Image Path
                </label>
                <span className="text-[11px] font-bold text-[#007cc3] font-mono">
                  {editingCarouselItem.type === "product" ? "Required: 800 × 800 px" : "Required: 1200 × 600 px"}
                </span>
              </div>
              <input
                type="text"
                value={editingCarouselItem.data.image || ""}
                onChange={(e) =>
                  setEditingCarouselItem({
                    ...editingCarouselItem,
                    data: { ...editingCarouselItem.data, image: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="/homepage/featured/fenix9.jpg"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                {editingCarouselItem.type === "product"
                  ? "Square 800 × 800 px product shot. WebP or transparent PNG recommended."
                  : "Wide 1200 × 600 px lifestyle banner."}
              </p>
            </div>

            {/* Type 1 Product specific fields: Price & Tag */}
            {editingCarouselItem.type === "product" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                    Price
                  </label>
                  <input
                    type="text"
                    value={editingCarouselItem.data.price || ""}
                    onChange={(e) =>
                      setEditingCarouselItem({
                        ...editingCarouselItem,
                        data: { ...editingCarouselItem.data, price: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden font-mono"
                    placeholder="$799.99"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                    Tag / Badge (e.g. NEW, SALE)
                  </label>
                  <select
                    value={editingCarouselItem.data.badge || ""}
                    onChange={(e) =>
                      setEditingCarouselItem({
                        ...editingCarouselItem,
                        data: { ...editingCarouselItem.data, badge: e.target.value || undefined },
                      })
                    }
                    className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                  >
                    <option value="">No Badge</option>
                    <option value="NEW">NEW (Blue badge)</option>
                    <option value="SALE">SALE (Green badge)</option>
                    <option value="EXCLUSIVE">EXCLUSIVE</option>
                  </select>
                </div>
              </div>
            )}

            {/* Type 2 Promo specific field: Hyperlink Button CTA */}
            {editingCarouselItem.type === "promo" && (
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Button Text (CTA)
                </label>
                <input
                  type="text"
                  value={editingCarouselItem.data.ctaText || "SHOP NOW"}
                  onChange={(e) =>
                    setEditingCarouselItem({
                      ...editingCarouselItem,
                      data: { ...editingCarouselItem.data, ctaText: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                  placeholder="e.g. SHOP NOW, LEARN MORE, WATCH VIDEO"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Destination Link URL
              </label>
              <input
                type="text"
                value={editingCarouselItem.data.href || ""}
                onChange={(e) =>
                  setEditingCarouselItem({
                    ...editingCarouselItem,
                    data: { ...editingCarouselItem.data, href: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="https://www.garmin.com/en-US/p/..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setCarouselItemModalOpen(false)}
                className="rounded border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCarouselItemModal}
                className="rounded bg-[#007cc3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0066a1]"
              >
                Save Card
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* ================= MODAL: CONTAINING BLOCK TILE EDIT ================= */}
      {tileModalOpen && editingTile && (
        <AdminModal
          isOpen={tileModalOpen}
          onClose={() => setTileModalOpen(false)}
          title="Edit Containing Block"
          subtitle="Recommended Size: 600 × 400 px (3:2 Landscape, Max 1MB)"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Tile Title / Headline
              </label>
              <input
                type="text"
                value={editingTile.data.title}
                onChange={(e) =>
                  setEditingTile({
                    ...editingTile,
                    data: { ...editingTile.data, title: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Image Path / URL
                </label>
                <span className="text-[11px] font-bold text-[#007cc3] font-mono">
                  Target: 600 × 400 px
                </span>
              </div>
              <input
                type="text"
                value={editingTile.data.image}
                onChange={(e) =>
                  setEditingTile({
                    ...editingTile,
                    data: { ...editingTile.data, image: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Recommended 600 × 400 px landscape image (3:2 ratio).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Destination URL
              </label>
              <input
                type="text"
                value={editingTile.data.href}
                onChange={(e) =>
                  setEditingTile({
                    ...editingTile,
                    data: { ...editingTile.data, href: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Button Text (CTA)
              </label>
              <input
                type="text"
                value={editingTile.data.cta}
                onChange={(e) =>
                  setEditingTile({
                    ...editingTile,
                    data: { ...editingTile.data, cta: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#007cc3] focus:outline-hidden"
                placeholder="SHOP or LEARN MORE"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setTileModalOpen(false)}
                className="rounded border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTileModal}
                className="rounded bg-[#007cc3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0066a1]"
              >
                Save Tile
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
