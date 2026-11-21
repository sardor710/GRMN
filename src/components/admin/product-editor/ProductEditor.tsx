"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, X } from "lucide-react";
import type { CMSProduct } from "@/lib/cms/types";
import { Button, StatusBadge } from "@/components/admin/ui";
import { loadTaxonomy } from "@/components/admin/catalog/useTaxonomy";
import { cn } from "@/lib/utils";
import { defaultImageSrc, validateForm } from "./editor-state";
import { GarminImportDialog } from "./GarminImportDialog";
import { ProductPreviewModal } from "./ProductPreviewModal";
import { useProductEditorState, type EditorTab } from "./useProductEditorState";
import { compatibilityCount, fineAccessoryLinks } from "./compatibility-state";
import { CompatibilityTab } from "./tabs/CompatibilityTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { InTheBoxTab } from "./tabs/InTheBoxTab";
import { MediaTab } from "./tabs/MediaTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { SeoTab } from "./tabs/SeoTab";
import { SpecsTab } from "./tabs/SpecsTab";
import { VariantsTab } from "./tabs/VariantsTab";

export interface ProductEditorProps {
  /** Public key of the product to edit; null creates a new product. */
  productKey: string | null;
  /** Open on this tab (e.g. "variants" from the SKU drawer). */
  initialTab?: EditorTab;
  /** Scroll to and highlight this variant SKU in the Variants tab. */
  focusSku?: string | null;
  onClose: () => void;
  /** Called after every successful save with the saved payload. */
  onSaved?: (product: Record<string, unknown>) => void;
  /** Opens another product's editor on a tab (e.g. "Edit on accessory" from the compatibility tab). */
  onOpenProduct?: (productKey: string, tab: EditorTab) => void;
}

// The product editor (plan M3.2): a full-viewport sheet with a sticky header (name, status, unsaved
// indicator, Preview, Import) and a sticky save bar. Tabs are separate files under ./tabs.
export function ProductEditor({ productKey, initialTab = "general", focusSku = null, onClose, onSaved, onOpenProduct }: ProductEditorProps) {
  const editor = useProductEditorState(productKey);
  const { form, load, dirty, saving, saveError } = editor;
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const titleId = useId();

  const requestClose = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this product?")) return;
    onClose();
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Escape closes the sheet (stacked dialogs capture Escape first, so they close on their own).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (dirty && !window.confirm("Discard your unsaved changes to this product?")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, onClose]);

  const skuConflicts = useMemo(() => (saveError?.kind === "sku" ? saveError.conflicts.map((sku) => sku.toUpperCase()) : []), [saveError]);

  const save = async () => {
    setNotice(null);
    const invalid = validateForm(form);
    if (invalid) {
      setNotice({ tone: "error", text: invalid.message });
      setTab(invalid.tab);
      return;
    }
    const saved = await editor.save();
    if (saved) onSaved?.(saved);
  };

  // After a SKU conflict, jump to where the clashing SKU is edited.
  useEffect(() => {
    if (!skuConflicts.length) return;
    setTab(form.variants.some((variant) => skuConflicts.includes(variant.sku.trim().toUpperCase())) ? "variants" : "general");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new conflict arrives
  }, [skuConflicts]);

  const applyImport = async (draft: Partial<CMSProduct>) => {
    const taxonomy = await loadTaxonomy().catch(() => null);
    editor.importDraft(draft, taxonomy);
    setTab(draft.variants?.length ? "variants" : "general");
    setNotice({ tone: "info", text: "Imported from garmin.com as a draft. Check prices, stock and categories, then save." });
  };

  const rows = form.specGroups.reduce((total, group) => total + group.items.length, 0);
  const tabs: { id: EditorTab; label: string; count?: number }[] = [
    { id: "general", label: "General" },
    { id: "media", label: "Photos", count: form.images.length },
    { id: "variants", label: "Variants", count: form.variants.length },
    { id: "specs", label: "Specs", count: rows },
    { id: "overview", label: "Overview" },
    { id: "box", label: "In the box", count: form.inTheBox.length },
    { id: "accessories", label: "Accessories & compatibility", count: compatibilityCount(form.compatibility, fineAccessoryLinks(editor.base)) + form.related.length },
    { id: "seo", label: "SEO" },
  ];

  const title = form.name.trim() || (editor.isNew ? "New product" : "Untitled product");
  const message = notice ?? (saveError ? { tone: "error" as const, text: saveError.message } : null);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex flex-col bg-[#f7f7f7] font-sans text-black">
      {/* Sticky header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[#d9d9d9] bg-white px-3 py-2.5 sm:px-5">
        <Button size="icon" variant="ghost" onClick={requestClose} aria-label="Close editor" className="-ml-1">
          <X className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.06em] text-[#666]">{editor.isNew ? "Create product" : "Edit product"}</p>
          <div className="flex min-w-0 items-center gap-2">
            <h2 id={titleId} className="g-heading truncate text-[22px] uppercase leading-tight tracking-[0.02em] sm:text-[26px]">{title}</h2>
            {load.status === "ready" && <StatusBadge status={form.status} className="hidden sm:inline-flex" />}
            {dirty && (
              <span className="hidden items-center gap-1.5 whitespace-nowrap text-[12px] text-[#8a6100] md:inline-flex" role="status">
                <span className="h-2 w-2 rounded-full bg-[#f0b800]" aria-hidden="true" /> Unsaved changes
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={load.status !== "ready"} aria-label="Import from garmin.com">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Import from garmin.com</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)} disabled={load.status !== "ready"} aria-label="Preview">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Preview</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Tabs: a scrollable strip on small screens, a left rail on large ones */}
        <nav aria-label="Editor sections" className="shrink-0 border-b border-[#d9d9d9] bg-white lg:w-56 lg:border-b-0 lg:border-r">
          <ul className="flex overflow-x-auto lg:flex-col lg:overflow-visible lg:py-3" role="tablist">
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 whitespace-nowrap px-4 py-3 text-left lg:whitespace-normal text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black lg:py-2.5",
                      "border-b-4 lg:border-b-0 lg:border-l-4",
                      active ? "border-black bg-[#f7f7f7] text-black" : "border-transparent text-[#666] hover:text-black",
                    )}
                  >
                    {item.label}
                    {item.count ? <span className="text-[12px] font-normal tabular-nums text-[#8c8c8c]">{item.count}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto" id="product-editor-main">
          <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            {load.status === "loading" ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading product">
                <div className="h-7 w-48 animate-pulse bg-[#e5e5e5]" />
                <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 animate-pulse bg-[#ececec]" />)}</div>
                <div className="h-64 animate-pulse bg-[#ececec]" />
              </div>
            ) : load.status === "error" ? (
              <div role="alert" className="mx-auto max-w-lg border border-[#c20f2f] bg-white p-6">
                <p className="flex items-center gap-2 font-bold text-[#c20f2f]"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> {load.message}</p>
                <div className="mt-4 flex gap-2">
                  <Button variant="primary" size="sm" onClick={editor.reload}>Try again</Button>
                  <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                </div>
              </div>
            ) : (
              <>
                {tab === "general" && <GeneralTab editor={editor} skuConflicts={skuConflicts} onOpenTab={setTab} />}
                {tab === "media" && <MediaTab editor={editor} />}
                {tab === "variants" && <VariantsTab editor={editor} skuConflicts={skuConflicts} focusSku={focusSku} />}
                {tab === "specs" && <SpecsTab editor={editor} />}
                {tab === "overview" && <OverviewTab editor={editor} onPreview={() => setPreviewOpen(true)} />}
                {tab === "box" && <InTheBoxTab editor={editor} />}
                {tab === "accessories" && (
                  <CompatibilityTab
                    editor={editor}
                    onOpenProduct={onOpenProduct ? (key) => {
                      if (dirty && !window.confirm("Open the accessory? Your unsaved changes to this product will be lost.")) return;
                      onOpenProduct(key, "accessories");
                    } : undefined}
                  />
                )}
                {tab === "seo" && <SeoTab editor={editor} />}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Sticky save bar */}
      <footer className="shrink-0 border-t border-[#d9d9d9] bg-white px-3 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 text-[13px]" aria-live="polite">
            {message ? (
              <p role={message.tone === "error" ? "alert" : undefined} className={cn("flex items-start gap-2", message.tone === "error" ? "text-[#a30d28]" : "text-[#333]")}>
                {message.tone === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6b7a00]" aria-hidden="true" />}
                <span>{message.text}</span>
                {!notice && saveError?.reloadable && (
                  <Button size="sm" variant="link" className="h-auto px-0" onClick={() => { if (!dirty || window.confirm("Reload the product? Your unsaved changes will be lost.")) editor.reload(); }}>
                    Reload product
                  </Button>
                )}
              </p>
            ) : dirty ? (
              <p className="flex items-center gap-2 text-[#8a6100]"><span className="h-2 w-2 rounded-full bg-[#f0b800]" aria-hidden="true" /> Unsaved changes</p>
            ) : editor.savedAt ? (
              <p className="flex items-center gap-2 text-[#4d5900]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Saved{editor.version ? ` · version ${editor.version}` : ""}</p>
            ) : (
              <p className="text-[#666]">{editor.isNew ? "Not saved yet." : "No changes."}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={requestClose}>{dirty ? "Cancel" : "Close"}</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={load.status !== "ready" || (!dirty && !editor.isNew)}>
              {saving ? "Saving" : editor.isNew ? "Create product" : "Save changes"}
            </Button>
          </div>
        </div>
      </footer>

      <GarminImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        formHasData={Boolean(form.name.trim() || form.description.trim() || form.images.length || form.variants.length)}
        onApply={(draft) => { void applyImport(draft); }}
      />
      <ProductPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        product={{
          name: form.name,
          sku: form.sku,
          family: form.family,
          description: form.description,
          badge: form.badge,
          price: form.price ?? 0,
          originalPrice: form.originalPrice ?? undefined,
          priceSuffix: form.priceSuffix,
          stock: form.stock,
          image: defaultImageSrc(form.images, form.defaultImageId) || form.image,
          images: form.images,
          defaultImageId: form.defaultImageId,
          options: form.options,
          variants: form.variants,
          overviewHtml: form.overviewHtml,
          specGroups: form.specGroups,
          inTheBox: form.inTheBox,
        }}
      />
    </div>
  );
}
