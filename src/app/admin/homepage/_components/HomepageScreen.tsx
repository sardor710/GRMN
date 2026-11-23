"use client";

import { AutoTranslateButton } from "@/components/admin/AutoTranslateButton";
import { useState, useEffect, useId } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Layers,
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
  Archive,
  ArchiveRestore,
  Image as ImageIcon
} from "lucide-react";
import type {
  HomepageConfig,
  HeroBanner,
  CarouselBlock,
  ProductCarouselItem,
  PromoCarouselItem,
  CarouselCard,
  HomepageTileBlock,
  ImageDimensionSpec
} from "@/lib/cms/types";
import { IMAGE_DIMENSION_SPECS } from "@/lib/cms/homepage-schema";
import { moveEntry, removeEntry, setEntryArchived, type HomepageEntryRef } from "@/lib/cms/homepage-archive";
import { HomepageImageField } from "./HomepageImageField";
import { CAROUSEL_BADGES, badgeCode, type CarouselBadgeCode } from "@/lib/cms/carousel-badges";

/** Admin preview chip: black like the storefront's garmin.ae starburst. */
const BADGE_CHIP: Record<CarouselBadgeCode, string> = {
  NEW: "bg-black text-white",
  SALE: "bg-black text-white",
  SOON: "bg-black text-white",
  HIT: "bg-black text-white",
  LIMITED: "bg-black text-white",
  EXCLUSIVE: "bg-black text-white",
  PREORDER: "bg-black text-white",
};
import {writeAdminRecord} from "@/lib/admin-collection";
import { AdminModal } from "@/components/admin/AdminModal";
import { LocaleTabs, type ContentLocale } from "@/components/admin/LocaleTabs";
import { HomepageTranslationPanel } from "@/components/admin/HomepageTranslationPanel";
import { translationStatus } from "@/lib/cms/translation-input";
import { HOMEPAGE_SPEC } from "@/i18n/translate-record";
import { Button, Select, buttonClass } from "@/components/admin/ui";

type TileSection = "promoTiles" | "storyTiles" | "categoryTiles";

const TILE_SECTIONS: { key: TileSection; heading: string; help: string; grid: string }[] = [
  {
    key: "promoTiles",
    heading: "1. Promotional Feature Pods (3-Column Grid)",
    help: "Recommended size: 600 × 400 px (3:2 aspect ratio). Highlights key sport/lifestyle categories.",
    grid: "grid grid-cols-1 sm:grid-cols-3 gap-4",
  },
  {
    key: "storyTiles",
    heading: "2. Stories & Community Pods (2-Column Grid)",
    help: "Recommended size: 600 × 400 px (3:2 aspect ratio). Editorial features, health, and ambassador stories.",
    grid: "grid grid-cols-1 sm:grid-cols-2 gap-4",
  },
  {
    key: "categoryTiles",
    heading: "3. Category Grid Shortcuts (6-Column Grid)",
    help: "Recommended size: 600 × 400 px (3:2 aspect ratio). Direct shortcuts to major category hubs.",
    grid: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3",
  },
];

const live = <T extends { archived?: boolean }>(list: T[]) => list.filter((entry) => entry.archived !== true);
const archivedOf = <T extends { archived?: boolean }>(list: T[]) => list.filter((entry) => entry.archived === true);

/** Owner 2026-11-23: every banner, carousel, card and tile has Archive and Delete. */
function EntryActions({ label, onArchive, onDelete, small = false }: { label: string; onArchive: () => void; onDelete: () => void; small?: boolean }) {
  const icon = small ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <>
      <button type="button" onClick={onArchive} className="p-1.5 text-muted-foreground hover:bg-neutral-100 hover:text-black" title={`Archive ${label}`} aria-label={`Archive ${label}`}>
        <Archive className={icon} />
      </button>
      <button type="button" onClick={onDelete} className="p-1.5 text-muted-foreground hover:bg-neutral-100 hover:text-garmin-error" title={`Delete ${label}`} aria-label={`Delete ${label}`}>
        <Trash2 className={icon} />
      </button>
    </>
  );
}

interface ArchivedRow { id: string; title: string; image?: string }

/** Archived entries of one list: hidden on the storefront, restorable here until deleted for good. */
function ArchivedStrip({ label, rows, onRestore, onDelete }: { label: string; rows: ArchivedRow[]; onRestore: (id: string) => void; onDelete: (row: ArchivedRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <details className="border border-dashed border-border bg-neutral-50 p-3" data-archived-strip={label}>
      <summary className="cursor-pointer text-xs font-bold text-neutral-700">
        Archived {label} ({rows.length})
      </summary>
      <ul className="mt-2 divide-y divide-neutral-200">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="relative h-10 w-14 shrink-0 overflow-hidden border border-border bg-neutral-100">
              {row.image && <Image src={row.image} alt="" fill className="object-cover" unoptimized />}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-black">{row.title || "(Untitled)"}</span>
            <Button variant="outline" size="sm" onClick={() => onRestore(row.id)} aria-label={`Restore ${row.title}`}>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Restore
            </Button>
            <Button variant="ghost" size="sm" className="text-garmin-error" onClick={() => onDelete(row)} aria-label={`Delete ${row.title} forever`}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete forever
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function TextField({ label, value, onChange, placeholder, help }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; help?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-neutral-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
        placeholder={placeholder}
      />
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export default function AdminHomepagePage() {
  const [version,setVersion]=useState<number>();
  // Task 24: ru/kk translations are stored on both backends (PostgreSQL: page_version_translations).
  const translatable = true;
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
    data: Partial<CarouselCard>;
  } | null>(null);

  const [tileModalOpen, setTileModalOpen] = useState(false);
  const [tileCategory, setTileCategory] = useState<TileSection>("promoTiles");
  const [editingTile, setEditingTile] = useState<{ index: number; data: HomepageTileBlock } | null>(null);

  // Fetch Homepage Config
  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/homepage");
      if (!res.ok) throw new Error("Failed to load homepage configuration");
      const data = await res.json();
      setVersion(data.version);
      if (data.config) {
        setConfig(data.config);
        setVersion(data.version);
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
    if(type==="success")setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Save changes to API
  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      // ru/kk overlays travel in config.translations on both backends (PostgreSQL stores them per version).
      const blocks: HomepageConfig = { ...config };
      if (!translatable) delete blocks.translations;
      const data=await writeAdminRecord(fetch,"homepage",{config:blocks,...(version===undefined?{}:{version})},"PUT");
      setConfig(data.config as HomepageConfig);setVersion(data.version as number|undefined);
      showNotification("success","Homepage saved.");
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
      const data=await writeAdminRecord(fetch,"homepage",{action:"reset",...(version===undefined?{}:{version})});
      setConfig(data.config as HomepageConfig);setVersion(data.version as number|undefined);
      showNotification("success","Homepage reset to default template.");
    } catch (err) {
      showNotification("error",err instanceof Error?err.message:"Failed to reset homepage config.");
    } finally {
      setSaving(false);
    }
  };

  // ---------------- ARCHIVE / RESTORE / DELETE (owner 2026-11-23) ----------------
  const archiveEntry = (ref: HomepageEntryRef) => {
    if (config) setConfig(setEntryArchived(config, ref, true));
  };
  const restoreEntry = (ref: HomepageEntryRef) => {
    if (config) setConfig(setEntryArchived(config, ref, false));
  };
  const deleteEntry = (ref: HomepageEntryRef, label: string) => {
    if (config && confirm(`Delete "${label || "this item"}" permanently?`)) setConfig(removeEntry(config, ref));
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
        image: "",
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

  // ---------------- CAROUSEL LOGIC (one card type) ----------------
  const handleOpenAddCarousel = () => {
    setEditingCarousel({
      index: -1,
      data: {
        id: `carousel-${Date.now()}`,
        title: "Featured",
        subtitle: "",
        type: "product",
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

  // Carousel card logic
  const handleOpenAddCarouselItem = (carouselIndex: number) => {
    if (!config) return;
    const carousel = config.carousels[carouselIndex];
    setActiveCarouselIndex(carouselIndex);
    setEditingCarouselItem({
      itemIndex: -1,
      data: {
        id: `item-${Date.now()}`,
        title: "",
        description: "",
        image: "",
        href: "/c/wearables-smartwatches",
        price: "",
        ctaText: "",
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

  // ---------------- TILES LOGIC ----------------
  const handleOpenAddTile = (category: TileSection) => {
    if (!config) return;
    setTileCategory(category);
    setEditingTile({
      index: -1,
      data: { id: `tile-${Date.now()}`, title: "", image: "", href: "", cta: "SHOP", order: config[category].length + 1 },
    });
    setTileModalOpen(true);
  };

  const handleOpenEditTile = (category: TileSection, index: number) => {
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
    if (editingTile.index >= 0) newTiles[editingTile.index] = editingTile.data;
    else newTiles.push(editingTile.data);
    setConfig({ ...config, [tileCategory]: newTiles });
    setTileModalOpen(false);
    setEditingTile(null);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-garmin-pill border-2 border-border border-t-garmin-blue" />
          <p className="text-sm font-medium text-muted-foreground">Loading Homepage CMS Configuration...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="border border-garmin-error bg-white p-6 text-garmin-error">
        {notification?.type==="error"&&<p role="alert">{notification.message}</p>}
        <p className="font-semibold">{version===0?"No homepage has been published.":"Unable to load homepage configuration."}</p>
        {version===0&&<button className="g-btn g-btn--black mt-3" disabled={saving} onClick={handleReset}>Create from default template</button>}
        <Button variant="danger" size="md" className="mt-3"
          onClick={loadConfig}
        >
          Reload configuration
        </Button>
      </div>
    );
  }

  const liveBanners = live(config.heroBanners);
  const liveCarousels = live(config.carousels);

  return (
    <div className="space-y-6">
      {/* Top Banner / Notification */}
      {notification && (
        <div
          className={`flex items-center justify-between p-4 text-sm font-medium transition-colors ${
            notification.type === "success"
              ? "border border-garmin-badge-lime bg-garmin-badge-lime/25 text-black"
              : "border border-garmin-error bg-white text-garmin-error"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-black" />
            ) : (
              <AlertCircle className="h-5 w-5 text-garmin-error" />
            )}
            <span>{notification.message}</span>
          {notification.type==="error"&&<button type="button" className="underline" onClick={loadConfig}>Reload configuration</button>}
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs uppercase text-muted-foreground hover:text-black"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h1 className="g-heading g-h2 text-black">Homepage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hero slides, carousels and tiles on the storefront homepage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/"
            target="_blank"
            className={buttonClass({ variant: "outline", size: "md" })}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Storefront
          </Link>

          <Button variant="outline" size="md"
            onClick={handleReset}
            disabled={saving}
            title="Reset to default template"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </Button>

          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving Changes..." : "Save All Changes"}
          </Button>
        </div>
      </div>

      {/* Image Size Reference Callout Box */}
      <div className="border border-garmin-rule bg-muted p-4">
        <div className="flex items-start gap-3">
          <div className="bg-garmin-blue p-1.5 text-white">
            <Info className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-sans text-xs font-bold text-black">
                Required Image Upload Specifications & Guidelines
              </h2>
              <button
                onClick={() => setActiveTab("specs")}
                className="text-xs font-semibold text-garmin-blue underline hover:text-[#005f94]"
              >
                View full specifications guide &rarr;
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="border border-white/80 bg-white/80 p-2.5">
                <span className="text-xs font-semibold text-muted-foreground block">Hero Banners</span>
                <span className="text-xs font-bold text-black tabular-nums">1920 × 800 px</span>
                <span className="text-xs text-muted-foreground block mt-0.5">Ratio: 2.4:1 / 16:9 (Max 2MB)</span>
              </div>
              <div className="border border-white/80 bg-white/80 p-2.5">
                <span className="text-xs font-semibold text-muted-foreground block">Carousel Cards</span>
                <span className="text-xs font-bold text-black tabular-nums">800 × 800 px</span>
                <span className="text-xs text-muted-foreground block mt-0.5">Ratio: 1:1 Square (Max 1MB)</span>
              </div>
              <div className="border border-white/80 bg-white/80 p-2.5">
                <span className="text-xs font-semibold text-muted-foreground block">Containing Pods</span>
                <span className="text-xs font-bold text-black tabular-nums">600 × 400 px</span>
                <span className="text-xs text-muted-foreground block mt-0.5">Ratio: 3:2 Landscape (Max 1MB)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {translatable && <LocaleTabs
        value={contentLocale}
        onChange={setContentLocale}
        status={{
          ru: translationStatus(config, "ru", HOMEPAGE_SPEC),
          kk: translationStatus(config, "kk", HOMEPAGE_SPEC),
        }}
      />}
      <AutoTranslateButton kind="homepage" record={() => config as unknown as Record<string, unknown>} onTranslated={(translations) => setConfig((prev) => (prev ? { ...prev, translations: translations as HomepageConfig["translations"] } : prev))} />

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
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("banners")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors ${
            activeTab === "banners"
              ? "border-garmin-blue text-garmin-blue"
              : "border-transparent text-muted-foreground hover:text-black"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Hero Banners ({liveBanners.length})
        </button>

        <button
          onClick={() => setActiveTab("carousels")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors ${
            activeTab === "carousels"
              ? "border-garmin-blue text-garmin-blue"
              : "border-transparent text-muted-foreground hover:text-black"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Carousels ({liveCarousels.length})
        </button>

        <button
          onClick={() => setActiveTab("blocks")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors ${
            activeTab === "blocks"
              ? "border-garmin-blue text-garmin-blue"
              : "border-transparent text-muted-foreground hover:text-black"
          }`}
        >
          <Layers className="h-4 w-4" />
          Containing Blocks ({live(config.promoTiles).length + live(config.storyTiles).length + live(config.categoryTiles).length})
        </button>

        <button
          onClick={() => setActiveTab("specs")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-bold transition-colors ${
            activeTab === "specs"
              ? "border-garmin-blue text-garmin-blue"
              : "border-transparent text-muted-foreground hover:text-black"
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
              <h2 className="font-sans text-sm font-bold text-black">
                Homepage Hero Rotator Slides
              </h2>
              <p className="text-xs text-muted-foreground">
                Rotates across the top of the homepage. Use full-width 1920 × 800 px images.
              </p>
            </div>
            <Button variant="primary" size="sm"
              onClick={handleOpenAddBanner}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Hero Slide
            </Button>
          </div>

          <div className="grid gap-3">
            {liveBanners.map((banner, index) => (
              <div
                key={banner.id || index}
                className={`flex flex-col sm:flex-row items-center gap-4 border bg-white p-3.5 shadow-2xs transition-colors ${
                  banner.active ? "border-neutral-200" : "border-border bg-neutral-50/50 opacity-60"
                }`}
              >
                {/* Thumbnail Preview */}
                <div className="relative h-20 w-36 shrink-0 overflow-hidden bg-neutral-100 border border-border">
                  <Image
                    src={banner.image || "/homepage/featured/holiday.jpg"}
                    alt={banner.title || "Banner"}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <span className="absolute bottom-1 right-1 bg-black/70 px-1 py-0.5 text-xs tabular-nums text-white">
                    1920x800
                  </span>
                </div>

                {/* Banner Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="bg-neutral-100 px-1.5 py-0.5 text-xs tabular-nums text-neutral-600 font-bold">
                      #{index + 1}
                    </span>
                    <h3 className="font-sans truncate text-sm font-bold text-black">
                      {banner.title || "(Untitled Banner)"}
                    </h3>
                    <span
                      className={` px-1.5 py-0.5 text-xs font-bold ${
                        banner.active
                          ? "bg-garmin-badge-lime/25 text-black"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {banner.active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{banner.subtitle || "No subtitle provided"}</p>
                  <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">
                    URL: {banner.href}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setConfig(moveEntry(config, { section: "heroBanners", id: banner.id }, "up"))}
                    disabled={index === 0}
                    className="p-1 text-muted-foreground hover:bg-neutral-100 hover:text-black disabled:opacity-20"
                    title="Move slide up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfig(moveEntry(config, { section: "heroBanners", id: banner.id }, "down"))}
                    disabled={index === liveBanners.length - 1}
                    className="p-1 text-muted-foreground hover:bg-neutral-100 hover:text-black disabled:opacity-20"
                    title="Move slide down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleOpenEditBanner(config.heroBanners.indexOf(banner))}
                    className="p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-garmin-blue"
                    title="Edit banner"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <EntryActions
                    label={`banner ${banner.title}`}
                    onArchive={() => archiveEntry({ section: "heroBanners", id: banner.id })}
                    onDelete={() => deleteEntry({ section: "heroBanners", id: banner.id }, banner.title)}
                  />
                </div>
              </div>
            ))}
          </div>
          <ArchivedStrip
            label="banners"
            rows={archivedOf(config.heroBanners)}
            onRestore={(id) => restoreEntry({ section: "heroBanners", id })}
            onDelete={(row) => deleteEntry({ section: "heroBanners", id: row.id }, row.title)}
          />
        </div>
      )}

      {/* ================= TAB 2: CAROUSELS (one card type, owner 2026-11-23) ================= */}
      {activeTab === "carousels" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-sans text-sm font-bold text-black">Carousels</h2>
              <p className="text-xs text-muted-foreground">
                Every card has an image, title, description and link. Price, badge and button are optional. Card image: 800 × 800 px.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={handleOpenAddCarousel}>
              <Plus className="h-3.5 w-3.5" />
              Add Carousel
            </Button>
          </div>

          <div className="space-y-6">
            {liveCarousels.map((carousel) => {
              const cIndex = config.carousels.indexOf(carousel);
              const cards = live(carousel.items);

              return (
                <div key={carousel.id || cIndex} className="border border-border bg-white p-5" data-carousel={carousel.id}>
                  {/* Carousel Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                    <div>
                      <h3 className="g-heading g-h4 text-black">{carousel.title}</h3>
                      {carousel.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{carousel.subtitle}</p>}
                      {!carousel.active && (
                        <span className="mt-1 inline-block bg-neutral-200 px-1.5 py-0.5 text-xs font-bold text-neutral-600">Disabled</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button variant="primary" size="sm" onClick={() => handleOpenAddCarouselItem(cIndex)}>
                        <Plus className="h-3.5 w-3.5" />
                        Add Card
                      </Button>
                      <button
                        onClick={() => handleOpenEditCarousel(cIndex)}
                        className="p-1.5 text-muted-foreground hover:bg-neutral-100 hover:text-black"
                        title="Edit carousel settings"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <EntryActions
                        label={`carousel ${carousel.title}`}
                        onArchive={() => archiveEntry({ section: "carousels", id: carousel.id })}
                        onDelete={() => deleteEntry({ section: "carousels", id: carousel.id }, carousel.title)}
                      />
                    </div>
                  </div>

                  {/* Carousel Cards Grid */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {cards.map((item, cardNumber) => {
                      const card = item as CarouselCard;
                      const iIndex = carousel.items.indexOf(item);
                      const ref: HomepageEntryRef = { section: "carouselItems", carouselId: carousel.id, id: item.id };

                      return (
                        <div
                          key={item.id || iIndex}
                          className="group relative flex flex-col overflow-hidden border border-border bg-neutral-50/40 p-3 hover:border-neutral-300 hover:bg-white transition-colors"
                        >
                          <div className="relative mb-2.5 aspect-square w-full overflow-hidden bg-neutral-200">
                            {card.image && <Image src={card.image} alt={card.title || "Card"} fill className="object-cover" unoptimized />}
                            {card.badge && (
                              <span
                                className={`absolute top-2 left-2 px-1.5 py-0.5 text-xs font-bold ${BADGE_CHIP[badgeCode(card.badge) ?? "NEW"]}`}
                              >
                                {card.badge}
                              </span>
                            )}
                            <span className="absolute bottom-1 right-1 bg-black/60 px-1 py-0.5 text-[8px] tabular-nums text-white">800x800</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-sans truncate text-xs font-bold text-black">{card.title || "(Untitled card)"}</h4>
                            <p className="line-clamp-2 text-xs text-muted-foreground mt-0.5">{card.description || "No description"}</p>
                            {card.price && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className="text-xs font-bold text-black tabular-nums">{card.price}</span>
                                {card.originalPrice && (
                                  <span className="text-xs text-muted-foreground line-through tabular-nums">{card.originalPrice}</span>
                                )}
                              </div>
                            )}
                            {card.ctaText && (
                              <div className="mt-2">
                                <span className="bg-neutral-200 px-2 py-0.5 text-xs font-bold text-neutral-700">Button: {card.ctaText}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2">
                            <span className="text-xs tabular-nums text-muted-foreground">Card #{cardNumber + 1}</span>
                            <div className="flex items-center">
                              <button
                                onClick={() => handleOpenEditCarouselItem(cIndex, iIndex)}
                                className="p-1.5 text-muted-foreground hover:text-black"
                                title={`Edit card ${card.title}`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <EntryActions
                                small
                                label={`card ${card.title}`}
                                onArchive={() => archiveEntry(ref)}
                                onDelete={() => deleteEntry(ref, card.title)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {cards.length === 0 && (
                      <div className="col-span-full py-8 text-center border-2 border-dashed border-border">
                        <p className="text-xs text-muted-foreground">No cards in this carousel.</p>
                        <button
                          onClick={() => handleOpenAddCarouselItem(cIndex)}
                          className="mt-2 text-xs font-semibold text-garmin-blue hover:underline"
                        >
                          + Add your first card
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <ArchivedStrip
                      label="cards"
                      rows={archivedOf(carousel.items)}
                      onRestore={(id) => restoreEntry({ section: "carouselItems", carouselId: carousel.id, id })}
                      onDelete={(row) => deleteEntry({ section: "carouselItems", carouselId: carousel.id, id: row.id }, row.title)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <ArchivedStrip
            label="carousels"
            rows={archivedOf(config.carousels).map((carousel) => ({ id: carousel.id, title: carousel.title, image: carousel.items[0]?.image }))}
            onRestore={(id) => restoreEntry({ section: "carousels", id })}
            onDelete={(row) => deleteEntry({ section: "carousels", id: row.id }, row.title)}
          />
        </div>
      )}

      {/* ================= TAB 3: CONTAINING BLOCKS ================= */}
      {activeTab === "blocks" && (
        <div className="space-y-8">
          {TILE_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-3" data-tile-section={section.key}>
              <div className="flex flex-col gap-2 border-b border-border pb-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-sans text-sm font-bold text-black">{section.heading}</h2>
                  <p className="text-xs text-muted-foreground">{section.help}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleOpenAddTile(section.key)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add tile
                </Button>
              </div>

              <div className={section.grid}>
                {live(config[section.key]).map((tile, index) => (
                  <div key={tile.id || index} className="flex flex-col border border-border bg-white p-3 shadow-2xs">
                    <div className="relative mb-2 aspect-3/2 w-full overflow-hidden bg-neutral-100">
                      {tile.image && <Image src={tile.image} alt={tile.title} fill className="object-cover" unoptimized />}
                      <span className="absolute bottom-1 right-1 bg-black/60 px-1 py-0.5 text-[8px] tabular-nums text-white">600x400</span>
                    </div>
                    <h3 className="font-sans truncate text-xs font-bold text-black">{tile.title || "(Untitled tile)"}</h3>
                    <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">{tile.href}</p>
                    {section.key !== "categoryTiles" && <p className="mt-0.5 truncate text-xs font-bold text-black">CTA: {tile.cta}</p>}
                    <div className="mt-auto flex items-center justify-end border-t border-neutral-100 pt-1.5">
                      <button
                        onClick={() => handleOpenEditTile(section.key, config[section.key].indexOf(tile))}
                        className="p-1.5 text-muted-foreground hover:bg-neutral-100 hover:text-garmin-blue"
                        title={`Edit tile ${tile.title}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <EntryActions
                        small
                        label={`tile ${tile.title}`}
                        onArchive={() => archiveEntry({ section: section.key, id: tile.id })}
                        onDelete={() => deleteEntry({ section: section.key, id: tile.id }, tile.title)}
                      />
                    </div>
                  </div>
                ))}
                {live(config[section.key]).length === 0 && (
                  <p className="col-span-full border-2 border-dashed border-border py-6 text-center text-xs text-muted-foreground">No tiles in this section.</p>
                )}
              </div>
              <ArchivedStrip
                label="tiles"
                rows={archivedOf(config[section.key])}
                onRestore={(id) => restoreEntry({ section: section.key, id })}
                onDelete={(row) => deleteEntry({ section: section.key, id: row.id }, row.title)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ================= TAB 4: IMAGE GUIDELINES FULL TABLE ================= */}
      {activeTab === "specs" && (
        <div className="space-y-6">
          <div className="border-b border-border pb-3">
            <h2 className="g-heading g-h4 text-black">
              Official Media Asset & Image Dimension Guide
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Follow these exact dimension standards when preparing graphic banners, product cutouts, and promotional cards for the Garmin homepage.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(dimensionSpecs).map(([key, spec]) => (
              <div
                key={key}
                className="border border-border bg-white p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="bg-muted px-2 py-0.5 text-xs font-bold text-garmin-blue">
                      {key}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground font-semibold">
                      Max {spec.maxSizeFormatted}
                    </span>
                  </div>
                  <h3 className="g-heading g-h4 mt-2 text-black">
                    {spec.label}
                  </h3>
                  <p className="text-xs text-neutral-600 mt-1">{spec.description}</p>
                </div>

                <div className="mt-4 border-t border-neutral-100 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Recommended Resolution:</span>
                    <span className="tabular-nums font-bold text-black">
                      {spec.recommendedWidth} × {spec.recommendedHeight} px
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Aspect Ratio:</span>
                    <span className="tabular-nums font-bold text-black">{spec.aspectRatio}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Supported Formats:</span>
                    <span className="tabular-nums text-neutral-700">WebP, PNG, JPG</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border border-garmin-control bg-muted p-4 text-sm text-black">
            <h4 className="font-sans font-bold">Image guidelines</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Use WebP.</li>
              <li>Product cards: 800 × 800 px, product centred on a plain background.</li>
              <li>Hero slides: 1920 × 800 px, subject in the centre 60% so it is not cropped on phones.</li>
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
          subtitle="Image: 1920 × 800 px, up to 2 MB."
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
                placeholder="e.g. HOLIDAY GIFT GUIDE"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
                placeholder="e.g. Where 'best gift ever' begins"
              />
            </div>

            <HomepageImageField
              label="Banner image"
              value={editingBanner.data.image}
              onChange={(image) => {
                // An upload resolves later: merge into the latest state, and only into the banner it was picked for.
                const id = editingBanner.data.id;
                setEditingBanner((prev) => (prev && prev.data.id === id ? { ...prev, data: { ...prev.data, image } } : prev));
              }}
              target="1920 × 800 px"
              aspect="banner"
            />

            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
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
                className="h-4 w-4 border-border text-garmin-blue focus:ring-garmin-blue"
              />
              <label htmlFor="bannerActive" className="text-xs font-medium text-neutral-700">
                Display this slide on storefront
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <Button variant="outline" size="md"
                type="button"
                onClick={() => setBannerModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="md"
                type="button"
                disabled={!editingBanner.data.image}
                title={editingBanner.data.image ? undefined : "Add an image first"}
                onClick={handleSaveBannerModal}
              >
                Save Slide
              </Button>
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
          subtitle="Cards show an image, title and link; price, badge and button are optional."
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
                placeholder="e.g. Featured Smartwatches"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
                placeholder="e.g. Top picks for training and health"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700">
                Merchandising Collection Key (optional)
              </label>
              <input
                type="text"
                value={editingCarousel.data.collectionKey || ""}
                onChange={(e) => {
                  const collectionKey = e.target.value.trim().toLowerCase();
                  setEditingCarousel({
                    ...editingCarousel,
                    data: { ...editingCarousel.data, collectionKey: collectionKey || undefined },
                  });
                }}
                pattern="[a-z0-9][a-z0-9_\-]{0,63}"
                className="mt-1 w-full border border-border px-3 py-2 text-sm tabular-nums focus:border-garmin-blue focus:outline-hidden"
                placeholder="e.g. homepage-featured"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                PostgreSQL mode: the carousel shows the published products of this collection. The cards below stay as a fallback while the collection is unpublished.
              </p>
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
                className="h-4 w-4 border-border text-garmin-blue focus:ring-garmin-blue"
              />
              <label htmlFor="carouselActive" className="text-xs font-medium text-neutral-700">
                Section is active on storefront
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <Button variant="outline" size="md"
                type="button"
                onClick={() => setCarouselModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="md"
                type="button"
                onClick={handleSaveCarouselModal}
              >
                Save Section
              </Button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* ================= MODAL: CAROUSEL CARD (one card type, owner 2026-11-23) ================= */}
      {carouselItemModalOpen && editingCarouselItem && (
        <AdminModal
          isOpen={carouselItemModalOpen}
          onClose={() => setCarouselItemModalOpen(false)}
          title={editingCarouselItem.itemIndex >= 0 ? "Edit Card" : "Add Card"}
          subtitle="Image: 800 × 800 px. Price, badge and button are optional."
        >
          {(() => {
            const card = editingCarouselItem.data;
            // Functional and id-guarded: an image upload resolves after later typing, or after another card was opened.
            const setCard = (patch: Partial<CarouselCard>) =>
              setEditingCarouselItem((prev) => (prev && prev.data.id === card.id ? { ...prev, data: { ...prev.data, ...patch } } : prev));
            return (
              <div className="space-y-4">
                <HomepageImageField label="Card image" value={card.image || ""} onChange={(image) => setCard({ image })} target="800 × 800 px" aspect="square" />
                <TextField label="Title" value={card.title || ""} onChange={(title) => setCard({ title })} placeholder="e.g. FĒNIX® 9" />
                <div>
                  <label htmlFor="card-description" className="block text-xs font-bold text-neutral-700">
                    Description
                  </label>
                  <textarea
                    id="card-description"
                    rows={2}
                    value={card.description || ""}
                    onChange={(e) => setCard({ description: e.target.value })}
                    className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
                    placeholder="Short marketing line"
                  />
                </div>
                <TextField label="Link" value={card.href || ""} onChange={(href) => setCard({ href })} placeholder="/c/wearables-smartwatches or https://…" />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Price (optional)" value={card.price || ""} onChange={(price) => setCard({ price })} placeholder="₸349 995" />
                  <TextField label="Old price (optional)" value={card.originalPrice || ""} onChange={(originalPrice) => setCard({ originalPrice })} placeholder="₸399 995" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="card-badge" className="block text-xs font-bold text-neutral-700">
                      Badge (optional)
                    </label>
                    <Select
                      id="card-badge"
                      wrapperClassName="mt-1"
                      value={card.badge || ""}
                      onChange={(e) => setCard({ badge: e.target.value || undefined })}
                    >
                      <option value="">No badge</option>
                      {CAROUSEL_BADGES.map((badge) => (
                        <option key={badge.code} value={badge.code}>
                          {badge.adminLabel}
                        </option>
                      ))}
                      {card.badge && !CAROUSEL_BADGES.some((badge) => badge.code === card.badge) && (
                        <option value={card.badge}>{card.badge}</option>
                      )}
                    </Select>
                  </div>
                  <TextField label="Button text (optional)" value={card.ctaText || ""} onChange={(ctaText) => setCard({ ctaText })} placeholder="SHOP NOW" help="Leave empty for no button." />
                </div>
                <TextField label="Image alt text (optional)" value={card.imageAlt || ""} onChange={(imageAlt) => setCard({ imageAlt: imageAlt || undefined })} />

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-200">
                  {!card.image && <span className="mr-auto text-xs text-muted-foreground">Add an image to save this card.</span>}
                  <Button variant="outline" size="md" type="button" onClick={() => setCarouselItemModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="md" type="button" disabled={!card.image} onClick={handleSaveCarouselItemModal}>
                    Save Card
                  </Button>
                </div>
              </div>
            );
          })()}
        </AdminModal>
      )}

      {/* ================= MODAL: CONTAINING BLOCK TILE EDIT ================= */}
      {tileModalOpen && editingTile && (
        <AdminModal
          isOpen={tileModalOpen}
          onClose={() => setTileModalOpen(false)}
          title={editingTile.index >= 0 ? "Edit Tile" : "Add Tile"}
          subtitle="Image: 600 × 400 px, up to 1 MB."
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
              />
            </div>

            <HomepageImageField
              label="Tile image"
              value={editingTile.data.image}
              onChange={(image) => {
                const id = editingTile.data.id;
                setEditingTile((prev) => (prev && prev.data.id === id ? { ...prev, data: { ...prev.data, image } } : prev));
              }}
              target="600 × 400 px"
              aspect="tile"
            />

            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700">
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
                className="mt-1 w-full border border-border px-3 py-2 text-sm focus:border-garmin-blue focus:outline-hidden"
                placeholder="SHOP or LEARN MORE"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <Button variant="outline" size="md"
                type="button"
                onClick={() => setTileModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="md"
                type="button"
                disabled={!editingTile.data.image}
                title={editingTile.data.image ? undefined : "Add an image first"}
                onClick={handleSaveTileModal}
              >
                Save Tile
              </Button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
