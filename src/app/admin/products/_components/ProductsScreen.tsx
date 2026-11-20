"use client";

import { AutoTranslateButton } from "@/components/admin/AutoTranslateButton";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Plus,
  Search,
  Trash2,
  Tag,
  Boxes,
  FileText,
  Sliders,
  Box,
  Share2,
  Globe,
  Layers,
  Eye,
  Download,
  AlertTriangle,
} from "lucide-react";
import type {
  CMSProduct,
  ProductStatus,
  ProductSpecItem,
  ProductBadgeOption,
  ProductImage,
  ProductOption,
  ProductVariant,
  SpecGroup,
  ProductSource,
} from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminPageControls } from "@/components/admin/AdminPageControls";
import { useAdminCollection } from "@/hooks/useAdminCollection";
import { archiveAdminRecord } from "@/lib/admin-collection";
import { GarminBadge } from "@/components/GarminBadge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BulkActionBar,
  BulkResultMessage,
  bulkReason,
  type BulkOutcome,
  type BulkProductAction,
  type BulkResult,
} from "@/components/admin/products/BulkActionBar";
import { StatusMenu } from "@/components/admin/products/StatusMenu";
import { SEOEditor } from "@/components/admin/SEOEditor";
import {
  GarminImportDialog,
  OptionsEditor,
  ProductImagesEditor,
  ProductPreviewModal,
  ProductTranslationPanel,
  VariantsTable,
  formatKzt,
  newId,
  type ProductDraft,
  type ProductTranslations,
} from "@/components/admin/product-editor";
import { LocaleTabs, type ContentLocale } from "@/components/admin/LocaleTabs";
import { translationStatus } from "@/lib/cms/translation-input";
import { PRODUCT_SPEC } from "@/i18n/translate-record";

/** RU/KK tab is "complete" once the product title and description are translated (storefront indexing rule). */
const PRODUCT_REQUIRED_FIELDS = ["name", "description"] as const;

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

type CaseSize = CMSProduct["caseSize"];
type Level = CMSProduct["level"];
type EditorTab = "general" | "media" | "variants" | "specs" | "box" | "crossSell" | "seo";

const blankForm = () => ({
  name: "",
  sku: `GRM-${Math.floor(100000 + Math.random() * 900000)}`,
  price: 799.99,
  originalPrice: 899.99 as number | undefined,
  priceSuffix: "",
  description: "",
  image: "",
  badge: "NONE" as ProductBadgeOption,
  family: "fēnix",
  category: "Smartwatches & Wearables",
  subCategory: "Multisport GPS",
  activities: ["Running", "Hiking"] as string[],
  level: "Premium" as Level,
  caseSize: "Medium" as CaseSize,
  stock: 50,
  status: "published" as ProductStatus,
  isFeatured: false,
  specs: DEFAULT_SPECS_TEMPLATE,
  inTheBox: [
    "Garmin GPS Smartwatch",
    "USB-C Charging / Data Cable",
    "Documentation & Quick-Start Manual",
  ],
  compatibleAccessories: [] as string[],
  // Media, options & variants
  images: [] as ProductImage[],
  defaultImageId: "",
  options: [] as ProductOption[],
  variants: [] as ProductVariant[],
  overviewHtml: "",
  specGroups: [] as SpecGroup[],
  source: undefined as ProductSource | undefined,
  // SEO fields
  seoTitle: "",
  seoDescription: "",
  focusKeywords: [] as string[],
  canonicalUrl: "",
  noIndex: false,
  ogImage: "",
  // ru/kk overlays (sent whole on save; the API merges them per locale)
  translations: {} as ProductTranslations,
});

type ProductForm = ReturnType<typeof blankForm>;

/** Keep the current value selectable even when it is not one of the preset choices (e.g. imported family). */
const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list);

const defaultImageSrc = (images: ProductImage[], defaultImageId: string) =>
  (images.find((i) => i.id === defaultImageId) || images[0])?.src || "";

/** Products listed by the admin API; PostgreSQL rows carry the optimistic-concurrency version. */
type ListedProduct = CMSProduct & { version?: number };
/** `version` is dropped after a version conflict so it is re-read from the list before the next send. */
type SelectedProduct = { version?: number; name: string };
/** The bulk endpoint accepts at most this many products per request. */
const BULK_LIMIT = 100;

/**
 * Product list and editor (options, variants, photos, garmin.com import) for both stores.
 * Selection, the bulk bar and the inline status menu need PostgreSQL and are hidden in legacy JSON mode.
 */
export default function AdminProductsPage() {
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Server-side filtered, paginated list (shared admin API).
  const collection = useAdminCollection<CMSProduct>("products", { search, status: statusFilter, family: familyFilter });
  const { items: products, loading } = collection;
  // Selected rows by id (kept across pages); the version is re-read from the current page when an action runs.
  const [selected, setSelected] = useState<Map<string, SelectedProduct>>(() => new Map());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOutcome, setBulkOutcome] = useState<BulkOutcome | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CMSProduct | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("general");
  const [contentLocale, setContentLocale] = useState<ContentLocale>("en");
  const [accessorySearch, setAccessorySearch] = useState("");
  const crossSellPage = useAdminCollection<CMSProduct>("products", { search: accessorySearch, status: "published" });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [skuConflicts, setSkuConflicts] = useState<string[]>([]);

  const [formData, setFormData] = useState<ProductForm>(blankForm);

  // Unsaved-changes guard: snapshot the form when the editor opens; confirm before discarding edits
  // (Escape, backdrop click or Cancel). A successful save closes directly.
  const openedSnapshot = useRef("");
  useEffect(() => {
    if (isModalOpen) openedSnapshot.current = JSON.stringify(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot only at the moment the editor opens
  }, [isModalOpen]);
  const requestCloseEditor = () => {
    if (
      JSON.stringify(formData) !== openedSnapshot.current &&
      !window.confirm("Discard your unsaved changes to this product?")
    ) {
      return;
    }
    setIsModalOpen(false);
  };

  const fetchProducts = () => {
    collection.reload();
    crossSellPage.reload();
  };

  const resetEditorState = () => {
    setActiveTab("general");
    setContentLocale("en");
    setSaveError("");
    setSkuConflicts([]);
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData(blankForm());
    resetEditorState();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prod: CMSProduct) => {
    setEditingProduct(prod);
    // Legacy products only have `image`: seed the gallery with it so the photo editor shows it.
    const images: ProductImage[] =
      prod.images && prod.images.length > 0
        ? prod.images
        : prod.image
          ? [{ id: newId("img"), src: prod.image, alt: prod.name, source: "url" }]
          : [];
    setFormData({
      name: prod.name,
      sku: prod.sku,
      price: prod.price,
      originalPrice: prod.originalPrice ?? (prod.variants?.length ? undefined : prod.price * 1.15),
      priceSuffix: prod.priceSuffix || "",
      description: prod.description || "",
      image: prod.image,
      badge: (prod.badge as ProductBadgeOption) || "NONE",
      family: prod.family,
      category: prod.category,
      subCategory: prod.subCategory,
      activities: prod.activities || [],
      level: prod.level || "Premium",
      caseSize: prod.caseSize || "Medium",
      stock: prod.stock,
      status: prod.status,
      isFeatured: prod.isFeatured || false,
      specs: prod.specs && prod.specs.length > 0 ? prod.specs : DEFAULT_SPECS_TEMPLATE,
      inTheBox: prod.inTheBox && prod.inTheBox.length > 0 ? prod.inTheBox : ["Garmin Device", "Charging Cable", "Manual"],
      compatibleAccessories: prod.compatibleAccessories || [],
      images,
      defaultImageId: images.some((i) => i.id === prod.defaultImageId) ? (prod.defaultImageId as string) : images[0]?.id || "",
      options: prod.options || [],
      variants: prod.variants || [],
      overviewHtml: prod.overviewHtml || "",
      specGroups: prod.specGroups || [],
      source: prod.source,
      seoTitle: prod.seoTitle || "",
      seoDescription: prod.seoDescription || "",
      focusKeywords: prod.focusKeywords || [],
      canonicalUrl: prod.canonicalUrl || "",
      noIndex: prod.noIndex || false,
      ogImage: prod.ogImage || "",
      translations: prod.translations || {},
    });
    resetEditorState();
    setIsModalOpen(true);
  };

  const handleImagesChange = (images: ProductImage[], defaultImageId: string) => {
    setFormData((prev) => {
      const ids = new Set(images.map((i) => i.id));
      return {
        ...prev,
        images,
        defaultImageId,
        image: defaultImageSrc(images, defaultImageId) || prev.image,
        // a removed photo can no longer be picked by variants or used as a swatch
        variants: prev.variants.some((v) => v.imageIds.some((id) => !ids.has(id)))
          ? prev.variants.map((v) => ({ ...v, imageIds: v.imageIds.filter((id) => ids.has(id)) }))
          : prev.variants,
      };
    });
  };

  const formHasData = Boolean(
    formData.name.trim() || formData.description.trim() || formData.images.length || formData.variants.length,
  );

  const applyImportedDraft = (draft: ProductDraft) => {
    const images = draft.images || [];
    const defaultImageId = images.some((i) => i.id === draft.defaultImageId) ? (draft.defaultImageId as string) : images[0]?.id || "";
    setFormData((prev) => ({
      ...prev,
      name: draft.name,
      sku: draft.sku || prev.sku,
      price: draft.price,
      originalPrice: draft.originalPrice,
      priceSuffix: draft.priceSuffix || "",
      description: draft.description || "",
      image: defaultImageSrc(images, defaultImageId) || draft.image || prev.image,
      badge: (draft.badge as ProductBadgeOption) || "NONE",
      family: draft.family || prev.family,
      category: draft.category || prev.category,
      subCategory: draft.subCategory || prev.subCategory,
      activities: draft.activities?.length ? draft.activities : prev.activities,
      level: draft.level || prev.level,
      caseSize: draft.caseSize || prev.caseSize,
      stock: draft.stock ?? prev.stock,
      // imported products start as drafts until the owner reviews prices and stock
      status: "draft",
      specs: draft.specs?.length ? draft.specs : prev.specs,
      inTheBox: draft.inTheBox?.length ? draft.inTheBox : prev.inTheBox,
      images,
      defaultImageId,
      options: draft.options || [],
      variants: draft.variants || [],
      overviewHtml: draft.overviewHtml || "",
      specGroups: draft.specGroups || [],
      source: draft.source,
      seoTitle: draft.seoTitle || "",
      seoDescription: draft.seoDescription || "",
      focusKeywords: draft.focusKeywords || [],
      canonicalUrl: draft.canonicalUrl || "",
      ogImage: draft.ogImage || "",
    }));
    setSkuConflicts([]);
    setSaveError("");
    setActiveTab(draft.variants?.length ? "variants" : "general");
  };

  // Selection, bulk actions and the inline status menu use PostgreSQL-only endpoints.
  const postgresStore = collection.backend === "postgres";

  const clearSelection = () => setSelected(new Map());

  // Legacy JSON store: no bulk endpoint, so the open editor offers a permanent delete instead.
  const handleLegacyDelete = async (product: CMSProduct) => {
    if (!confirm("Permanently delete this product from the catalog? This cannot be undone.")) return;
    try {
      await archiveAdminRecord(fetch, "products", product);
      setIsModalOpen(false);
      fetchProducts();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const toggleRow = (p: ListedProduct, checked: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked && p.version !== undefined) next.set(p.id, { version: p.version, name: p.name });
      else next.delete(p.id);
      return next;
    });
  };

  const pageRows = products as ListedProduct[];
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));
  const someOnPageSelected = pageRows.some((p) => selected.has(p.id));

  const toggleAllOnPage = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of pageRows) {
        if (checked && p.version !== undefined) next.set(p.id, { version: p.version, name: p.name });
        else next.delete(p.id);
      }
      return next;
    });
  };

  const runBulk = async (action: BulkProductAction) => {
    const entries = [...selected];
    if (entries.length === 0) return;
    // A row on the current page has the freshest version (e.g. after an inline status change). A row on
    // another page whose stored version was dropped after a conflict is not sent until it is seen again.
    const results: BulkResult[] = [];
    const items: { id: string; version: number }[] = [];
    for (const [id, s] of entries) {
      const version = pageRows.find((p) => p.id === id)?.version ?? s.version;
      if (version === undefined) {
        results.push({ id, ok: false, code: "STALE_SELECTION", message: "changed elsewhere; open its page to refresh it, then try again" });
      } else {
        items.push({ id, version });
      }
    }
    setBulkBusy(true);
    setBulkOutcome(null);
    let requestError: string | undefined;
    try {
      for (let start = 0; start < items.length; start += BULK_LIMIT) {
        const res = await fetch("/api/admin/products/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, items: items.slice(start, start + BULK_LIMIT) }),
        });
        const data = (await res.json().catch(() => null)) as { results?: BulkResult[]; error?: { message?: string } } | null;
        if (!res.ok || !Array.isArray(data?.results)) {
          throw new Error(data?.error?.message || `The bulk action failed (HTTP ${res.status}).`);
        }
        results.push(...data.results);
      }
    } catch (error) {
      requestError =
        error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Network error. Reload to see which products changed.";
    } finally {
      setBulkBusy(false);
    }
    const sent = results.some((r) => r.ok || r.code !== "STALE_SELECTION");
    if (!sent && requestError) {
      // Nothing reached the server: no reload, so the page error banner stays visible.
      collection.setError(requestError);
      return;
    }
    const failed = results.filter((r): r is Extract<BulkResult, { ok: false }> => !r.ok);
    const done = new Set(results.filter((r) => r.ok).map((r) => r.id));
    const conflicted = new Set(failed.filter((r) => r.code === "VERSION_CONFLICT").map((r) => r.id));
    // Only products the server confirmed leave the selection; the rest stay selected to retry or act on.
    // A version conflict drops the stored version so the row is re-read from the list before it is sent again.
    setSelected(
      (prev) =>
        new Map(
          [...prev]
            .filter(([id]) => !done.has(id))
            .map(([id, s]): [string, SelectedProduct] => [id, conflicted.has(id) ? { name: s.name } : s]),
        ),
    );
    // The error travels in the outcome because the reload below clears the page error banner.
    setBulkOutcome({
      updated: done.size,
      unchanged: failed.length,
      reasons: failed.map((r) => ({ id: r.id, name: selected.get(r.id)?.name ?? r.id, message: bulkReason(action, r.code, r.message) })),
      error: requestError,
    });
    if (sent) fetchProducts();
  };

  const handleCategoryChange = (newCat: string) => {
    const subList = SUB_CATEGORIES_MAP[newCat] || ["General"];
    setFormData((prev) => ({
      ...prev,
      category: newCat,
      subCategory: subList[0],
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

  const handleSpecChange = (index: number, field: "label" | "value", val: string) => {
    setFormData((prev) => {
      const newSpecs = [...prev.specs];
      newSpecs[index] = { ...newSpecs[index], [field]: val };
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
    setSaveError("");
    setSkuConflicts([]);
    if (formData.images.length === 0 && !formData.image) {
      setSaveError("Add at least one product photo.");
      setContentLocale("en");
      setActiveTab("media");
      return;
    }
    if (formData.variants.some((v) => !v.sku.trim())) {
      setSaveError("Every variant needs a SKU.");
      setContentLocale("en");
      setActiveTab("variants");
      return;
    }
    // New products get a server-generated id: an existing id would overwrite that product.
    const id = editingProduct ? editingProduct.id : undefined;
    // PostgreSQL: saves are versioned (optimistic concurrency) and stock moves only through the
    // Inventory screen, so the product stock field is not sent (variant stock is ignored there).
    const { stock, ...rest } = formData;
    const postgres = collection.backend === "postgres";
    const payload = {
      ...(id ? { id } : {}),
      ...(postgres && editingProduct ? { version: (editingProduct as CMSProduct & { version?: number }).version } : {}),
      ...rest,
      ...(postgres ? {} : { stock }),
      image: defaultImageSrc(formData.images, formData.defaultImageId) || formData.image,
      // empty arrays are sent on purpose so removing all options turns the product back into a simple one
      options: formData.options,
      variants: formData.variants,
    };
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchProducts();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string | { message?: string }; conflicts?: string[] };
      const message = typeof data.error === "string" ? data.error : data.error?.message;
      if (res.status === 409 && data.conflicts?.length) {
        const conflicts = data.conflicts.map((c) => c.toUpperCase());
        setSkuConflicts(conflicts);
        const variantHit = formData.variants.some((v) => conflicts.includes(v.sku.trim().toUpperCase()));
        setContentLocale("en");
        setActiveTab(variantHit ? "variants" : "general");
      }
      // e.g. "translations.kk.name is longer than 300 characters" → open that language tab
      const badLocale = /^translations\.(ru|kk)\b/.exec(message || "")?.[1] as "ru" | "kk" | undefined;
      if (badLocale) setContentLocale(badLocale);
      setSaveError(message || `Save failed (HTTP ${res.status}).`);
    } catch (err) {
      console.error("Failed to save product:", err);
      setSaveError("Network error — the product was not saved.");
    } finally {
      setSaving(false);
    }
  };

  const hasVariants = formData.variants.length > 0;
  const defaultVariant = formData.variants.find((v) => v.isDefault) || formData.variants[0];
  const productSkuConflict = skuConflicts.includes(formData.sku.trim().toUpperCase());

  // Filtering happens on the server (useAdminCollection).
  const filteredProducts = pageRows;
  const columnCount = postgresStore ? 8 : 7;

  const availableSubCategories =
    SUB_CATEGORIES_MAP[formData.category] || ["General"];

  const crossSellAvailableProducts = crossSellPage.items.filter((p) => p.id !== editingProduct?.id);

  return (
    <div className="space-y-6 font-sans">
      <AdminPageControls page={collection} />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <h1 className="g-heading uppercase tracking-wide text-2xl text-black font-normal flex items-center gap-2.5">
            <Boxes className="h-6 w-6 text-[#007cc3]" />
            <span>Product Catalog &amp; Inventory</span>
          </h1>
          <p className="text-[14px] text-neutral-500 mt-1 font-sans">
            Manage Garmin product models, technical specifications, retail packages, and cross-selling accessories.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-black text-white hover:bg-neutral-800 border border-black px-4 py-2 text-[12px] font-medium tracking-[0.06em] uppercase transition-colors rounded-none"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-neutral-200 bg-white p-4 rounded-none">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              clearSelection();
            }}
            placeholder="Search by model, SKU, or family..."
            className="h-9 w-full border border-neutral-300 bg-neutral-50 pl-9 pr-3 text-[13px] text-black placeholder-neutral-400 focus:border-black focus:bg-white focus:outline-none rounded-none"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={familyFilter}
            onChange={(e) => {
              setFamilyFilter(e.target.value);
              clearSelection();
            }}
            className="h-9 border border-neutral-300 bg-white px-3 text-[13px] font-medium text-black focus:border-black focus:outline-none rounded-none"
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
            onChange={(e) => {
              setStatusFilter(e.target.value);
              clearSelection();
            }}
            className="h-9 border border-neutral-300 bg-white px-3 text-[13px] font-medium text-black focus:border-black focus:outline-none rounded-none"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {postgresStore && (
        <BulkActionBar count={selected.size} busy={bulkBusy} onAction={(action) => void runBulk(action)} onClear={clearSelection} />
      )}
      {bulkOutcome && <BulkResultMessage outcome={bulkOutcome} onDismiss={() => setBulkOutcome(null)} />}

      {/* Products Table */}
      <div className="border border-neutral-200 bg-white overflow-hidden rounded-none shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 text-[11px] font-heading uppercase tracking-wider">
                {postgresStore && (
                  <th className="w-10 py-3 pl-4 pr-0 font-semibold">
                    <Checkbox
                      aria-label="Select all products on this page"
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected && !allOnPageSelected}
                      disabled={loading || pageRows.length === 0}
                      onCheckedChange={toggleAllOnPage}
                      className="rounded-none border-neutral-400 data-checked:border-black data-checked:bg-black data-indeterminate:border-black data-indeterminate:bg-black"
                    />
                  </th>
                )}
                <th className="py-3 px-4 font-semibold">Product &amp; SKU</th>
                <th className="py-3 px-4 font-semibold">Hierarchy</th>
                <th className="py-3 px-4 font-semibold">Price</th>
                <th className="py-3 px-4 font-semibold">Badge</th>
                <th className="py-3 px-4 font-semibold">Stock</th>
                <th className="py-3 px-4 font-semibold">Cross-Sell</th>
                <th className="py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={columnCount} className="py-8 text-center text-neutral-400">
                    Loading products...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-8 text-center text-neutral-400">
                    No products matched your criteria.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr
                    key={p.id}
                    data-product-id={p.id}
                    className={`transition-colors ${selected.has(p.id) ? "bg-neutral-100" : "hover:bg-neutral-50/70"}`}
                  >
                    {postgresStore && (
                      <td className="w-10 py-3.5 pl-4 pr-0">
                        <Checkbox
                          aria-label={`Select ${p.name}`}
                          checked={selected.has(p.id)}
                          onCheckedChange={(checked) => toggleRow(p, checked)}
                          className="relative z-10 rounded-none border-neutral-400 data-checked:border-black data-checked:bg-black"
                        />
                      </td>
                    )}
                    {/* Image, name and SKU open the editor through one focusable overlay button. */}
                    <td className="group/edit relative py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(p)}
                        aria-label={`Edit ${p.name}`}
                        className="absolute inset-0 z-[1] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                      />
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 relative shrink-0 bg-neutral-50 border border-neutral-200 p-1 flex items-center justify-center overflow-hidden rounded-none">
                          <Image
                            src={p.image || "/images/products/1228429.jpg"}
                            alt={p.name}
                            width={44}
                            height={44}
                            className="object-contain"
                          />
                        </div>
                        <div>
                          <p className="font-medium text-black line-clamp-1 group-hover/edit:underline underline-offset-2">{p.name}</p>
                          <p className="font-mono text-[11px] text-neutral-500">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-black text-[13px]">{p.category || "Smartwatches"}</p>
                      <p className="text-[11px] text-neutral-500">{p.subCategory || "General"}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-heading font-normal text-black text-[14px]">
                        {formatKzt(p.price)}
                      </span>
                      {p.priceSuffix && (
                        <span className="text-[11px] text-neutral-500 ml-1">
                          {p.priceSuffix}
                        </span>
                      )}
                      {p.variants && p.variants.length > 0 && (
                        <p className="text-[11px] text-neutral-500">{p.variants.length} variants</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {p.badge && p.badge !== "NONE" ? (
                        <GarminBadge badge={p.badge} variant="pill" />
                      ) : (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            p.stock > 20
                              ? "bg-emerald-600"
                              : p.stock > 5
                              ? "bg-amber-600"
                              : "bg-rose-600"
                          }`}
                        />
                        <span className="font-semibold text-black text-[12px]">{p.stock} units</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-[11px] bg-neutral-100 px-2 py-0.5 text-neutral-700 border border-neutral-200 rounded-none">
                        {p.compatibleAccessories?.length || 0} linked
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {postgresStore && p.version !== undefined ? (
                        <div className="relative z-10 inline-flex">
                          <StatusMenu
                            id={p.id}
                            version={p.version}
                            status={p.status}
                            name={p.name}
                            onSaved={() => fetchProducts()}
                            onError={(message) => collection.setError(message)}
                          />
                        </div>
                      ) : (
                        <span
                          className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded-none border ${
                            p.status === "published"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : p.status === "draft"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-neutral-100 text-neutral-600 border-neutral-200"
                          }`}
                        >
                          {p.status}
                        </span>
                      )}
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
        onClose={requestCloseEditor}
        maxWidth="4xl"
        title={editingProduct ? `Edit Model: ${editingProduct.name}` : "Create Product Catalog Entry"}
        subtitle="Manage product taxonomy, pricing, technical specifications, and cross-selling accessories"
      >
        <form onSubmit={handleSubmit} className="space-y-5 font-sans">
          {/* Editor toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-neutral-500">
              {formData.source ? (
                <>
                  Imported from{" "}
                  <a href={formData.source.url} target="_blank" rel="noreferrer" className="text-[#007cc3] underline">
                    garmin.com ({formData.source.partNumber})
                  </a>
                </>
              ) : (
                "Fill the form by hand or import a product from garmin.com."
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="inline-flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold text-black hover:border-black rounded-none"
              >
                <Download className="h-3.5 w-3.5" />
                Import from garmin.com
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold text-black hover:border-black rounded-none"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
            </div>
          </div>

          <LocaleTabs
            value={contentLocale}
            onChange={setContentLocale}
            status={{
              ru: translationStatus(formData, "ru", PRODUCT_SPEC, PRODUCT_REQUIRED_FIELDS),
              kk: translationStatus(formData, "kk", PRODUCT_SPEC, PRODUCT_REQUIRED_FIELDS),
            }}
          />
          <AutoTranslateButton kind="product" record={() => formData as unknown as Record<string, unknown>} onTranslated={(translations) => setFormData((prev) => ({ ...prev, translations: translations as typeof prev.translations }))} />

          {contentLocale !== "en" ? (
            <ProductTranslationPanel
              key={contentLocale}
              locale={contentLocale}
              product={formData}
              translations={formData.translations}
              onChange={(translations) => setFormData((prev) => ({ ...prev, translations }))}
            />
          ) : (
          <>
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 pb-2">
            {[
              { id: "general" as const, label: "1. Hierarchy & Pricing", icon: Tag },
              { id: "media" as const, label: "2. Photos & Description", icon: FileText },
              {
                id: "variants" as const,
                label: `3. Options & Variants${hasVariants ? ` (${formData.variants.length})` : ""}`,
                icon: Layers,
              },
              { id: "specs" as const, label: "4. Tech Specs", icon: Sliders },
              { id: "box" as const, label: "5. In The Box", icon: Box },
              { id: "crossSell" as const, label: "6. Cross-Selling", icon: Share2 },
              { id: "seo" as const, label: "7. Search & Social SEO", icon: Globe },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[11px] font-heading uppercase tracking-wider font-semibold transition-colors border-b-2 rounded-none ${
                    isActive
                      ? "border-black text-black bg-neutral-100"
                      : "border-transparent text-neutral-500 hover:text-black"
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
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. MARQ® Captain (Gen 2)"
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    SKU / Part Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="e.g. 010-02648-11"
                    aria-invalid={productSkuConflict}
                    className={`mt-1 h-9 w-full border bg-white px-3 text-[13px] font-mono font-medium text-black focus:border-black focus:outline-none rounded-none ${
                      productSkuConflict ? "border-rose-500 bg-rose-50" : "border-neutral-300"
                    }`}
                  />
                  {productSkuConflict && (
                    <p className="mt-1 text-[11px] text-rose-700">This SKU is already used by another product.</p>
                  )}
                </div>
              </div>

              {/* Category, Subcategory & Family */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    Product Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                  >
                    {withCurrent(PRIMARY_CATEGORIES, formData.category).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    Sub-Category *
                  </label>
                  <select
                    value={formData.subCategory}
                    onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                  >
                    {withCurrent(availableSubCategories, formData.subCategory).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    Watch Family / Series *
                  </label>
                  <select
                    value={formData.family}
                    onChange={(e) => setFormData({ ...formData, family: e.target.value })}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                  >
                    {withCurrent(WATCH_FAMILIES, formData.family).map((f) => (
                      <option key={f} value={f}>
                        {f} Series
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Badge Visual Section & Live Preview */}
              <div className="border border-neutral-200 bg-neutral-50 p-4 space-y-3 rounded-none">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="g-heading uppercase tracking-wide text-[13px] text-black font-normal flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-[#007cc3]" />
                      <span>Product Ribbon Badge &amp; Marketing Tag</span>
                    </h4>
                    <p className="text-[12px] text-neutral-500 mt-0.5">
                      Select official Garmin flag ribbon badge displayed on catalog cards and product detail header
                    </p>
                  </div>
                  {formData.badge && formData.badge !== "NONE" && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, badge: "NONE" })}
                      className="text-[11px] font-medium text-rose-600 hover:underline"
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
                        className={`relative p-2 text-left border flex flex-col items-center justify-center min-h-[58px] transition-all rounded-none ${
                          isSelected
                            ? "bg-white border-black ring-1 ring-black shadow-xs"
                            : "bg-white border-neutral-200 hover:border-black"
                        }`}
                      >
                        {badgeOption === "NONE" ? (
                          <span className="text-[11px] text-neutral-400 italic font-medium">No Badge</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 w-full">
                            <GarminBadge badge={badgeOption} variant="pill" className="text-[10px] py-0.5 px-2 text-center" />
                          </div>
                        )}
                        <span className="text-[9px] font-mono text-neutral-400 mt-1 uppercase">
                          {isSelected ? "● ACTIVE" : badgeOption === "NONE" ? "Standard" : "Ribbon"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Price Options */}
              {hasVariants && (
                <p className="border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
                  This product has {formData.variants.length} variants. Price, compare-at price and stock come from the
                  default variant ({defaultVariant?.title || "—"}: {formatKzt(defaultVariant?.price)}) — edit them in{" "}
                  <button type="button" onClick={() => setActiveTab("variants")} className="font-semibold underline">
                    Options &amp; Variants
                  </button>
                  .
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="product-price"
                    className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600"
                  >
                    Price (₸ KZT) *
                  </label>
                  <input
                    id="product-price"
                    type="number"
                    step="1"
                    min={0}
                    required={!hasVariants}
                    disabled={hasVariants}
                    value={hasVariants ? (defaultVariant?.price ?? 0) : formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] font-heading text-black focus:border-black focus:outline-none rounded-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="product-compare-at"
                    className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600"
                  >
                    Compare-at / Original Price (₸)
                  </label>
                  <input
                    id="product-compare-at"
                    type="number"
                    step="1"
                    min={0}
                    disabled={hasVariants}
                    value={(hasVariants ? defaultVariant?.originalPrice : formData.originalPrice) ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        originalPrice: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-neutral-500 focus:border-black focus:outline-none rounded-none disabled:bg-neutral-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    Price Suffix
                  </label>
                  <input
                    type="text"
                    value={formData.priceSuffix}
                    onChange={(e) => setFormData({ ...formData, priceSuffix: e.target.value })}
                    placeholder='e.g. "and up"'
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                  />
                </div>
              </div>

              {/* Stock, Size bucket, Level, Status */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <label
                    htmlFor="product-stock"
                    className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600"
                  >
                    Stock Inventory *
                  </label>
                  <input
                    id="product-stock"
                    type="number"
                    min={0}
                    required={!hasVariants && collection.backend !== "postgres"}
                    disabled={hasVariants || collection.backend === "postgres"}
                    title={collection.backend === "postgres" ? "Stock is received and adjusted on the Inventory screen" : undefined}
                    value={hasVariants ? (defaultVariant?.stock ?? 0) : formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none font-semibold rounded-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="product-size-bucket"
                    className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600"
                  >
                    Size bucket (catalog filter)
                  </label>
                  <select
                    id="product-size-bucket"
                    value={formData.caseSize}
                    onChange={(e) => setFormData({ ...formData, caseSize: e.target.value as CaseSize })}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                  >
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                    <option value="Large">Large</option>
                  </select>
                  <p className="mt-1 text-[10px] text-neutral-500">
                    {hasVariants && formData.options.some((o) => /size/i.test(o.name) || /size/i.test(o.key))
                      ? "Set automatically from the default variant’s mm size on save."
                      : "≤42 mm Small · 43–46 mm Medium · ≥47 mm Large"}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    User Level
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as "Entry" | "Advanced" | "Premium" | "Youth" })}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                  >
                    <option value="Entry">Entry Level</option>
                    <option value="Advanced">Advanced Performance</option>
                    <option value="Premium">Luxury / Premium</option>
                    <option value="Youth">Youth</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ProductStatus })}
                    className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-[13px] font-medium text-black focus:border-black focus:outline-none rounded-none"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Photos & Description */}
          {activeTab === "media" && (
            <div className="space-y-4">
              <ProductImagesEditor
                images={formData.images}
                defaultImageId={formData.defaultImageId}
                onChange={handleImagesChange}
              />

              {/* Quick Image Presets */}
              <div className="border border-neutral-200 bg-neutral-50 p-3 rounded-none">
                <p className="text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-500 mb-2">
                  Add a preset watch image:
                </p>
                <div className="flex flex-wrap gap-2">
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
                      disabled={formData.images.some((i) => i.src === preset.src)}
                      onClick={() => {
                        const added: ProductImage = { id: newId("img"), src: preset.src, alt: preset.label, source: "url" };
                        handleImagesChange([...formData.images, added], formData.defaultImageId || added.id);
                      }}
                      className="bg-white border border-neutral-300 px-3 py-1 text-[11px] text-neutral-700 hover:border-black hover:text-black transition-colors rounded-none disabled:opacity-40"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
                  Product Description *
                </label>
                <textarea
                  rows={4}
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Comprehensive description of materials, artisan crafts, AMOLED screen, and athlete coaching metrics..."
                  className="mt-1 w-full border border-neutral-300 bg-white p-3 text-[13px] text-black focus:border-black focus:outline-none rounded-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="product-overview-html"
                    className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600"
                  >
                    Overview tab (HTML, optional)
                  </label>
                  {formData.overviewHtml && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, overviewHtml: "" })}
                      className="text-[11px] font-medium text-rose-600 hover:underline"
                    >
                      Clear overview
                    </button>
                  )}
                </div>
                <textarea
                  id="product-overview-html"
                  rows={4}
                  value={formData.overviewHtml}
                  onChange={(e) => setFormData({ ...formData, overviewHtml: e.target.value })}
                  placeholder="<h2>Headline</h2><p>Text…</p> — scripts, styles and event handlers are removed on save"
                  className="mt-1 w-full border border-neutral-300 bg-white p-3 font-mono text-[12px] text-black focus:border-black focus:outline-none rounded-none"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  {formData.overviewHtml.length.toLocaleString()} characters · sanitized on save
                </p>
              </div>

              {/* Activities Multi-Select */}
              <div>
                <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600 mb-2">
                  Target Activities &amp; Sports
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ACTIVITIES.map((act) => {
                    const isSelected = formData.activities.includes(act);
                    return (
                      <button
                        key={act}
                        type="button"
                        onClick={() => toggleActivity(act)}
                        className={`px-3 py-1 text-[11px] font-heading uppercase tracking-wider font-semibold transition-colors rounded-none ${
                          isSelected
                            ? "bg-black text-white"
                            : "bg-neutral-100 border border-neutral-200 text-neutral-600 hover:text-black"
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

          {/* TAB 3: Options & Variants */}
          {activeTab === "variants" && (
            <div className="space-y-6">
              <section aria-labelledby="options-heading" className="space-y-2">
                <div>
                  <h4 id="options-heading" className="g-heading uppercase tracking-wide text-[13px] text-black font-normal">
                    Options
                  </h4>
                  <p className="text-[12px] text-neutral-500">
                    Any option names and values — e.g. Size: 42 / Biggest, Groupset: Shimano / SLR. Then click “Generate
                    variants”; existing variants keep their SKU, price, stock and photos.
                  </p>
                </div>
                <OptionsEditor
                  options={formData.options}
                  images={formData.images}
                  onChange={(options) => setFormData((prev) => ({ ...prev, options }))}
                />
              </section>
              <section aria-label="Variants" className="border-t border-neutral-200 pt-4">
                <VariantsTable
                  options={formData.options}
                  variants={formData.variants}
                  images={formData.images}
                  base={{ sku: formData.sku, price: formData.price, stock: formData.stock }}
                  conflicts={skuConflicts}
                  onChange={(variants) => setFormData((prev) => ({ ...prev, variants }))}
                />
              </section>
            </div>
          )}

          {/* TAB 4: Tech Specs Key-Value Builder */}
          {activeTab === "specs" && (
            <div className="space-y-4">
              {formData.specGroups.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
                  <span>
                    {formData.specGroups.length} grouped spec sections (
                    {formData.specGroups.reduce((n, g) => n + g.items.length, 0)} rows) were imported. The flat list below
                    is rebuilt from them on save, so edits here are replaced.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Drop the grouped spec sections and keep only the flat list below?")) {
                        setFormData((prev) => ({ ...prev, specs: prev.specGroups.flatMap((g) => g.items), specGroups: [] }));
                      }
                    }}
                    className="font-semibold underline"
                  >
                    Use the flat list instead
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                <p className="text-[13px] text-neutral-500">
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
                  <div key={idx} className="flex items-center gap-2 bg-neutral-50 p-2 border border-neutral-200 rounded-none">
                    <input
                      type="text"
                      value={spec.label}
                      onChange={(e) => handleSpecChange(idx, "label", e.target.value)}
                      placeholder="e.g. Battery Life"
                      className="w-1/3 h-8 border border-neutral-300 bg-white px-2.5 text-[12px] text-black focus:border-black focus:outline-none font-medium rounded-none"
                    />
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => handleSpecChange(idx, "value", e.target.value)}
                      placeholder="e.g. Up to 16 days"
                      className="flex-1 h-8 border border-neutral-300 bg-white px-2.5 text-[12px] text-neutral-800 focus:border-black focus:outline-none rounded-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSpec(idx)}
                      className="text-neutral-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: In The Box */}
          {activeTab === "box" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                <p className="text-[13px] text-neutral-500">
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
                  <div key={idx} className="flex items-center gap-2 bg-neutral-50 p-2 border border-neutral-200 rounded-none">
                    <Box className="h-4 w-4 text-[#007cc3] shrink-0" />
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleInTheBoxChange(idx, e.target.value)}
                      placeholder="e.g. USB-C Charging / Data Cable"
                      className="flex-1 h-8 border border-neutral-300 bg-white px-2.5 text-[12px] text-black focus:border-black focus:outline-none rounded-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveInTheBox(idx)}
                      className="text-neutral-400 hover:text-rose-600 p-1"
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
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                <div>
                  <p className="text-[13px] text-black font-semibold">
                    Select Compatible Cross-Selling Accessories
                  </p>
                  <p className="text-[12px] text-neutral-500">
                    Selected: <span className="text-emerald-700 font-bold">{formData.compatibleAccessories.length} items linked</span>
                  </p>
                </div>
                <input
                  type="text"
                  value={accessorySearch}
                  onChange={(e) => setAccessorySearch(e.target.value)}
                  placeholder="Filter catalog to link..."
                  className="h-8 w-52 border border-neutral-300 bg-white px-2.5 text-[12px] text-black focus:border-black focus:outline-none rounded-none"
                />
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1.5 border border-neutral-200 bg-neutral-50 p-2 rounded-none">
                {crossSellAvailableProducts.map((prod) => {
                  const isSelected = formData.compatibleAccessories.includes(prod.id);
                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center justify-between p-2.5 text-[12px] cursor-pointer transition-colors border rounded-none ${
                        isSelected
                          ? "bg-white border-black text-black shadow-xs"
                          : "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCrossSell(prod.id)}
                          className="h-4 w-4 accent-black rounded-none"
                        />
                        <div className="h-9 w-9 relative bg-neutral-50 border border-neutral-200 p-0.5 shrink-0 overflow-hidden rounded-none">
                          <Image
                            src={prod.image || "/images/products/1228429.jpg"}
                            alt={prod.name}
                            width={36}
                            height={36}
                            className="object-contain"
                          />
                        </div>
                        <div>
                          <p className="font-medium text-black line-clamp-1">{prod.name}</p>
                          <p className="font-mono text-[10px] text-neutral-500">{prod.sku} · {prod.family}</p>
                        </div>
                      </div>
                      <span className="font-heading text-black text-[13px]">
                        {formatKzt(prod.price)}
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
          </>
          )}

          {/* Submit Actions */}
          {saveError && (
            <p role="alert" className="flex items-start gap-2 border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{saveError}</span>
            </p>
          )}
          <div className="flex justify-between items-center pt-4 border-t border-neutral-200">
            <div className="flex items-center gap-3">
              {editingProduct && !postgresStore && (
                <button
                  type="button"
                  onClick={() => void handleLegacyDelete(editingProduct)}
                  title="Delete Product"
                  className="px-1 py-2 text-[12px] font-heading uppercase tracking-wider font-semibold text-rose-700 hover:underline underline-offset-2 rounded-none"
                >
                  Delete product…
                </button>
              )}
              <span className="text-[12px] text-neutral-500">
                Active:{" "}
                <span className="text-black uppercase font-heading font-semibold">
                  {contentLocale === "en" ? activeTab : `${contentLocale} translation`}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={requestCloseEditor}
                className="px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-semibold text-neutral-600 hover:text-black rounded-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 border border-neutral-300 px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-semibold text-black hover:border-black rounded-none"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-black text-white hover:bg-neutral-800 border border-black px-5 py-2 text-[12px] font-medium tracking-[0.06em] uppercase rounded-none transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editingProduct ? "Save Changes" : "Publish to Catalog"}
              </button>
            </div>
          </div>
        </form>
      </AdminModal>

      <GarminImportDialog
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        formHasData={formHasData}
        onApply={applyImportedDraft}
      />

      <ProductPreviewModal
        open={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        product={{
          name: formData.name,
          sku: formData.sku,
          family: formData.family,
          description: formData.description,
          badge: formData.badge,
          price: formData.price,
          originalPrice: formData.originalPrice,
          priceSuffix: formData.priceSuffix,
          stock: formData.stock,
          image: formData.image,
          images: formData.images,
          defaultImageId: formData.defaultImageId,
          options: formData.options,
          variants: formData.variants,
          translations: formData.translations,
        }}
        initialLocale={contentLocale}
      />
    </div>
  );
}
