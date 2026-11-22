"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Package, Plus, Search, Trash2, X } from "lucide-react";
import type { CatalogStockState, ProductListRow, SkuRow } from "@/contracts/admin-catalog";
import { useCatalogList } from "@/hooks/useCatalogList";
import { AdminDeleteError, archiveAdminRecord, deleteCatalogVariant, deleteProductPermanently } from "@/lib/admin-collection";
import { Button, Select, StatusBadge, buttonClass } from "@/components/admin/ui";
import { controlRadius } from "@/components/admin/ui/shape";
import { CategoryFilter } from "@/components/admin/catalog/CategoryFilter";
import { QuickEditDrawer } from "@/components/admin/catalog/QuickEditDrawer";
import { Thumb } from "@/components/admin/catalog/Thumb";
import { useDebouncedValue } from "@/components/admin/catalog/useDebouncedValue";
import { usePersistentChoice } from "@/components/admin/catalog/usePersistentChoice";
import { ProductEditor, formatKzt, type EditorTab } from "@/components/admin/product-editor";
import { cn } from "@/lib/utils";

// Products admin (plan M3.4): Grouped (one row per product, variants on demand) or All SKUs (one row per
// variant) over the slim, keyset-paged admin catalog API; filters; SKU quick-edit drawer; full editor sheet.
type View = "products" | "skus";
type StatusFilter = "" | "published" | "draft" | "archived" | "all";
const LOW_STOCK = 5;
const PAGE_SIZE = 50;

const stockState = (available: number): CatalogStockState => (available <= 0 ? "out" : available <= LOW_STOCK ? "low" : "in");
const priceText = (min: number | null, max: number | null) => (min === null ? "—" : max !== null && max !== min ? `${formatKzt(min)} – ${formatKzt(max)}` : formatKzt(min));
const dateText = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

type EditorTarget = { key: string | null; tab?: EditorTab; focusSku?: string };

export default function CatalogScreen() {
  const [view, setView] = usePersistentChoice<View>("garmin-admin.products.view", ["products", "skus"], "products");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const [status, setStatus] = useState<StatusFilter>("");
  const [category, setCategory] = useState("");
  const [family, setFamily] = useState("");
  const [stock, setStock] = useState<"" | CatalogStockState>("");
  const filters = useMemo(
    () => ({ limit: PAGE_SIZE, search: debouncedSearch || undefined, status: status || undefined, category: category || undefined, family: family || undefined, stock: stock || undefined }),
    [debouncedSearch, status, category, family, stock],
  );
  // Only the visible view fetches; the other starts when it is switched to.
  const grouped = useCatalogList("products", filters, { enabled: view === "products" });
  const skus = useCatalogList("skus", filters, { enabled: view === "skus" });
  const list = view === "products" ? grouped : skus;

  // There is no families endpoint: the family filter offers every family seen in loaded product rows.
  const [families, setFamilies] = useState<string[]>([]);
  const unseen = [...new Set(grouped.items.map((row) => row.family).filter((name): name is string => Boolean(name) && !families.includes(name as string)))];
  if (unseen.length) setFamilies([...families, ...unseen].sort((a, b) => a.localeCompare(b)));
  const familyOptions = family && !families.includes(family) ? [family, ...families] : families;

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [drawer, setDrawer] = useState<SkuRow | null>(null);
  const [expanded, setExpanded] = useState<Record<string, { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: SkuRow[] }>>({});
  const [actionError, setActionError] = useState("");

  const filtersActive = Boolean(debouncedSearch || status || category || family || stock);
  const clearFilters = () => { setSearch(""); setStatus(""); setCategory(""); setFamily(""); setStock(""); };

  const reloadAll = () => { setExpanded({}); grouped.reload(); skus.reload(); };

  const loadVariants = async (productId: string) => {
    try {
      const response = await fetch(`/api/admin/catalog/products/${encodeURIComponent(productId)}/variants`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Variants could not be loaded (HTTP ${response.status}).`);
      const body = (await response.json()) as { variants?: SkuRow[] };
      setExpanded((previous) => ({ ...previous, [productId]: { status: "ready", rows: body.variants ?? [] } }));
    } catch (error) {
      setExpanded((previous) => ({ ...previous, [productId]: { status: "error", message: error instanceof Error ? error.message : "Variants could not be loaded." } }));
    }
  };
  const toggleExpand = async (row: ProductListRow) => {
    if (expanded[row.id]) {
      setExpanded((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== row.id)));
      return;
    }
    setExpanded((previous) => ({ ...previous, [row.id]: { status: "loading" } }));
    await loadVariants(row.id);
  };
  // After a SKU changes or goes, its product stays expanded and every sibling row gets the new product version.
  const refreshProductRows = async (productId: string) => {
    grouped.reload();
    skus.reload();
    if (expanded[productId]) await loadVariants(productId);
  };

  const archiveRow = async (row: ProductListRow) => {
    setActionError("");
    try { await archiveAdminRecord(fetch, "products", { id: row.id, version: row.version }); reloadAll(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Archive failed."); }
  };
  const archive = async (row: ProductListRow) => {
    if (!window.confirm(`Archive “${row.name}”? It disappears from the store; you can find it again with the Archived status filter.`)) return;
    await archiveRow(row);
  };

  // Owner 2026-11-22 (admin bin): permanent delete of a never-ordered product or SKU. A stale list reloads; a product
  // the server refuses (orders or checkout history) can be archived instead.
  const staleDelete = (error: unknown) => {
    if (!(error instanceof AdminDeleteError) || error.code !== "VERSION_CONFLICT") return false;
    setActionError("This product changed in another window. The list has been reloaded; try again.");
    reloadAll();
    return true;
  };
  const deleteProduct = async (row: ProductListRow) => {
    if (!window.confirm(`Delete “${row.name}” permanently? All its variants, prices, photos, translations and stock are removed. This cannot be undone.`)) return;
    setActionError("");
    try { await deleteProductPermanently(fetch, { id: row.id, version: row.version }); reloadAll(); }
    catch (error) {
      if (staleDelete(error)) return;
      if (error instanceof AdminDeleteError && error.code === "CONFLICT" && error.message.includes("archive it instead") && row.status !== "archived") {
        if (window.confirm(`${error.message}\n\nArchive “${row.name}” instead?`)) await archiveRow(row);
        return;
      }
      setActionError(error instanceof Error ? error.message : "Delete failed.");
    }
  };
  const deleteSku = async (row: SkuRow) => {
    if (!window.confirm(`Delete SKU ${row.sku} permanently? Its price, photo links and stock are removed. This cannot be undone.`)) return;
    setActionError("");
    try { await deleteCatalogVariant(fetch, { variantId: row.variantId, productVersion: row.productVersion }); await refreshProductRows(row.productId); }
    catch (error) { if (!staleDelete(error)) setActionError(error instanceof Error ? error.message : "Delete failed."); }
  };

  const onDrawerSaved = (variant: SkuRow) => {
    setDrawer(null);
    void refreshProductRows(variant.productId);
  };

  const countLabel = list.loading ? "Loading…" : view === "products" ? `${list.total.toLocaleString("en-US")} ${list.total === 1 ? "product" : "products"}` : `${list.total.toLocaleString("en-US")} ${list.total === 1 ? "SKU" : "SKUs"}`;

  return (
    <div className="space-y-5 font-sans text-black">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="g-heading text-[32px] uppercase leading-none tracking-[0.02em]">Products</h1>
          <p className="mt-1.5 text-[14px] text-[#666]" aria-live="polite">{countLabel}{filtersActive && !list.loading ? " match the filters" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="List view" className="inline-flex">
            {(["products", "skus"] as const).map((option, index) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  "h-10 border px-4 text-[13px] font-medium uppercase tracking-[0.04em] transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
                  controlRadius,
                  index > 0 && "-ml-px",
                  view === option ? "z-[1] border-black bg-black text-white" : "border-[#d9d9d9] bg-white text-black hover:border-black",
                )}
              >
                {option === "products" ? "Grouped" : "All SKUs"}
              </button>
            ))}
          </div>
          {/* RU/KZ translations, auto-translate and per-variant content still live in the document editor. */}
          <Link href="/admin/products/content" className={buttonClass({ variant: "outline" })}>Translations</Link>
          <Button variant="primary" onClick={() => setEditor({ key: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add product
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.6fr)_repeat(4,minmax(140px,1fr))_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#808080]" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={view === "products" ? "Search name, SKU or family" : "Search SKU, variant or product"}
            aria-label="Search products"
            className={cn("h-10 w-full border border-[#d9d9d9] bg-white pl-9 pr-3 text-[13px] placeholder:text-[#8c8c8c] hover:border-[#737373] focus:border-black focus:outline-none", controlRadius)}
          />
        </div>
        <Select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
          <option value="">Not archived</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </Select>
        <CategoryFilter value={category} onChange={setCategory} />
        <Select aria-label="Family" value={family} onChange={(event) => setFamily(event.target.value)}>
          <option value="">All families</option>
          {familyOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
        <Select aria-label="Stock" value={stock} onChange={(event) => setStock(event.target.value as "" | CatalogStockState)}>
          <option value="">Any stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock (1–{LOW_STOCK})</option>
          <option value="out">Out of stock</option>
        </Select>
        {filtersActive ? (
          <Button variant="ghost" onClick={clearFilters} className="justify-self-start"><X className="h-3.5 w-3.5" aria-hidden="true" /> Clear</Button>
        ) : <span className="hidden lg:block" />}
      </div>

      {actionError && <p role="alert" className="border border-[#c20f2f] bg-[#fdf2f4] px-3 py-2 text-[13px] text-[#8a0b21]">{actionError}</p>}

      <div className="overflow-hidden border border-[#d9d9d9] bg-white">
        {list.error ? (
          <div role="alert" className="flex flex-col items-start gap-3 px-5 py-10 sm:items-center sm:text-center">
            <p className="flex items-center gap-2 font-bold text-[#a30d28]"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> {list.error}</p>
            <Button variant="secondary" size="sm" onClick={list.reload}>Try again</Button>
          </div>
        ) : !list.loading && list.items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-5 py-14 sm:items-center sm:text-center">
            <Package className="h-8 w-8 text-[#bfbfbf]" aria-hidden="true" />
            <p className="text-[15px] font-medium">{filtersActive ? "Nothing matches these filters." : "No products yet."}</p>
            {filtersActive ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> : <Button variant="primary" size="sm" onClick={() => setEditor({ key: null })}>Add the first product</Button>}
          </div>
        ) : view === "products" ? (
          <GroupedTable
            rows={grouped.items}
            loading={grouped.loading}
            expanded={expanded}
            onToggle={toggleExpand}
            onEdit={(row) => setEditor({ key: row.id })}
            onArchive={archive}
            onDelete={deleteProduct}
            onSku={setDrawer}
            onDeleteSku={deleteSku}
          />
        ) : (
          <SkuTable rows={skus.items} loading={skus.loading} onSku={setDrawer} onDeleteSku={deleteSku} />
        )}
      </div>

      {(list.hasPrevious || list.hasNext) && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-[13px]">
          <Button variant="outline" size="sm" disabled={list.loading || !list.hasPrevious} onClick={list.previous}>Previous</Button>
          <span className="text-[#666]">Page {list.pageNumber}{list.total ? ` of ${Math.max(1, Math.ceil(list.total / PAGE_SIZE))}` : ""}</span>
          <Button variant="outline" size="sm" disabled={list.loading || !list.hasNext} onClick={list.next}>Next</Button>
        </nav>
      )}

      {drawer && (
        <QuickEditDrawer
          key={drawer.variantId}
          row={drawer}
          onClose={() => setDrawer(null)}
          onSaved={onDrawerSaved}
          onOpenEditor={(row) => { setDrawer(null); setEditor({ key: row.productId, tab: "variants", focusSku: row.sku }); }}
        />
      )}
      {editor && (
        <ProductEditor
          key={editor.key ?? "new"}
          productKey={editor.key}
          initialTab={editor.tab}
          focusSku={editor.focusSku}
          onClose={() => setEditor(null)}
          onSaved={reloadAll}
          onOpenProduct={(key, tab) => setEditor({ key, tab })}
        />
      )}
    </div>
  );
}

function StockCell({ available, onHand, compact = false }: { available: number; onHand?: number; compact?: boolean }) {
  const state = stockState(available);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="tabular-nums">{available}</span>
      {!compact && onHand !== undefined && onHand !== available && <span className="text-[12px] text-[#8c8c8c]">of {onHand}</span>}
      {state !== "in" && <StatusBadge status={state} />}
    </span>
  );
}

const th = "px-3 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.04em] text-[#333]";
const td = "px-3 py-3 align-middle";

function SkeletonRows({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-t border-[#f0f0f0]">
          <td className={td} colSpan={columns}>
            <div className="flex items-center gap-3"><span className="h-12 w-12 animate-pulse bg-[#efefef]" /><span className="h-3 w-1/3 animate-pulse bg-[#efefef]" /><span className="ml-auto h-3 w-20 animate-pulse bg-[#efefef]" /></div>
          </td>
        </tr>
      ))}
    </>
  );
}

/** Icon-only delete control; it never lets the click reach a clickable row behind it. */
function BinButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" aria-label={label} title={label} className="px-2 text-[#666] hover:text-[#a30d28]"
      onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); onClick(); }}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

function GroupedTable({ rows, loading, expanded, onToggle, onEdit, onArchive, onDelete, onSku, onDeleteSku }: {
  rows: ProductListRow[];
  loading: boolean;
  expanded: Record<string, { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: SkuRow[] }>;
  onToggle: (row: ProductListRow) => void;
  onEdit: (row: ProductListRow) => void;
  onArchive: (row: ProductListRow) => void;
  onDelete: (row: ProductListRow) => void;
  onDeleteSku: (row: SkuRow) => void;
  onSku: (row: SkuRow) => void;
}) {
  return (
    // `relative` keeps the sr-only (absolute) header labels inside the scroll box, so they cannot widen the page.
    <div className="relative overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-[#f7f7f7]">
          <tr>
            <th className={cn(th, "w-10")}><span className="sr-only">Expand</span></th>
            <th className={th}>Product</th>
            <th className={cn(th, "hidden xl:table-cell")}>Category</th>
            <th className={cn(th, "hidden md:table-cell")}>Variants</th>
            <th className={th}>Stock</th>
            <th className={cn(th, "hidden md:table-cell")}>Price</th>
            <th className={cn(th, "hidden sm:table-cell")}>Status</th>
            <th className={cn(th, "hidden lg:table-cell")}>Updated</th>
            <th className={cn(th, "text-right")}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows columns={9} /> : rows.map((row) => {
            const entry = expanded[row.id];
            return (
              <Fragment key={row.id}>
                <tr className="border-t border-[#f0f0f0] hover:bg-[#fafafa]">
                  <td className={cn(td, "pr-0")}>
                    <button
                      type="button"
                      onClick={() => onToggle(row)}
                      aria-expanded={Boolean(entry)}
                      aria-label={`${entry ? "Hide" : "Show"} variants of ${row.name}`}
                      className="grid h-8 w-8 place-items-center text-[#666] hover:text-black focus-visible:outline-2 focus-visible:outline-black"
                    >
                      <ChevronRight className={cn("h-4 w-4 transition-transform", entry && "rotate-90")} aria-hidden="true" />
                    </button>
                  </td>
                  <td className={cn(td, "min-w-[220px]")}>
                    <button type="button" onClick={() => onEdit(row)} className="group flex items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
                      <Thumb src={row.thumbnail} />
                      <span className="min-w-0">
                        <span className="block font-medium text-black group-hover:underline">{row.name}</span>
                        <span className="block text-[12px] text-[#666]">{row.family || "No family"}<span className="sm:hidden"> · {row.status}</span></span>
                      </span>
                    </button>
                  </td>
                  <td className={cn(td, "hidden text-[#333] xl:table-cell")}>{row.primaryCategory?.name ?? <span className="text-[#a6a6a6]">—</span>}</td>
                  <td className={cn(td, "hidden tabular-nums md:table-cell")}>{row.variantCount}</td>
                  <td className={td}><StockCell available={row.stock.available} onHand={row.stock.onHand} /></td>
                  <td className={cn(td, "hidden whitespace-nowrap tabular-nums md:table-cell")}>{priceText(row.price.min, row.price.max)}</td>
                  <td className={cn(td, "hidden sm:table-cell")}><StatusBadge status={row.status} /></td>
                  <td className={cn(td, "hidden whitespace-nowrap text-[#666] lg:table-cell")}>{dateText(row.updatedAt)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right")}>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>Edit</Button>
                    {row.status !== "archived" && <Button size="sm" variant="ghost" className="hidden text-[#a30d28] md:inline-flex" onClick={() => onArchive(row)}>Archive</Button>}
                    <BinButton label={`Delete ${row.name}`} onClick={() => onDelete(row)} />
                  </td>
                </tr>
                {entry && (
                  <tr className="bg-[#fafafa]">
                    <td />
                    <td colSpan={8} className="px-3 pb-3 pt-0">
                      {entry.status === "loading" ? (
                        <p className="py-3 text-[13px] text-[#666]">Loading variants…</p>
                      ) : entry.status === "error" ? (
                        <p role="alert" className="py-3 text-[13px] text-[#a30d28]">{entry.message}</p>
                      ) : entry.rows.length === 0 ? (
                        <p className="py-3 text-[13px] text-[#666]">No active variants.</p>
                      ) : (
                        <ul className="divide-y divide-[#ececec] border border-[#e5e5e5] bg-white">
                          {entry.rows.map((sku) => (
                            <li key={sku.variantId} className="flex items-center">
                              <button type="button" onClick={() => onSku(sku)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left hover:bg-[#f7f7f7] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black">
                                <Thumb src={sku.thumbnail} size="sm" />
                                <span className="w-36 font-mono text-[12px]">{sku.sku}</span>
                                <span className="min-w-0 flex-1 truncate text-[#333]">{sku.options.map((option) => option.value).join(" · ") || sku.title || "Default"}</span>
                                <span className="w-28 text-right tabular-nums">{priceText(sku.price, sku.price)}</span>
                                <span className="w-32"><StockCell available={sku.stock.available} compact /></span>
                                <StatusBadge status={sku.status} />
                              </button>
                              <span className="pr-2"><BinButton label={`Delete SKU ${sku.sku}`} onClick={() => onDeleteSku(sku)} /></span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkuTable({ rows, loading, onSku, onDeleteSku }: { rows: SkuRow[]; loading: boolean; onSku: (row: SkuRow) => void; onDeleteSku: (row: SkuRow) => void }) {
  return (
    // `relative` keeps the sr-only (absolute) header labels inside the scroll box, so they cannot widen the page.
    <div className="relative overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-[#f7f7f7]">
          <tr>
            <th className={th}>SKU</th>
            <th className={cn(th, "hidden md:table-cell")}>Product</th>
            <th className={cn(th, "hidden lg:table-cell")}>Options</th>
            <th className={cn(th, "hidden sm:table-cell")}>Price</th>
            <th className={th}>Stock</th>
            <th className={cn(th, "hidden sm:table-cell")}>Status</th>
            <th className={cn(th, "w-12")}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {loading ? <SkeletonRows columns={7} /> : rows.map((row) => (
            <tr key={row.variantId} className="cursor-pointer border-t border-[#f0f0f0] hover:bg-[#fafafa]" onClick={() => onSku(row)}>
              <td className={cn(td, "min-w-[200px]")}>
                <button type="button" onClick={(event) => { event.stopPropagation(); onSku(row); }} className="group flex items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" aria-label={`Quick edit ${row.sku}`}>
                  <Thumb src={row.thumbnail} />
                  <span className="min-w-0">
                    <span className="block font-mono text-[12px] font-medium text-black group-hover:underline">{row.sku}</span>
                    <span className="block truncate text-[12px] text-[#666] md:hidden">{row.productName}</span>
                    <span className="block truncate text-[12px] text-[#666] lg:hidden">{row.options.map((option) => option.value).join(" · ")}</span>
                  </span>
                </button>
              </td>
              <td className={cn(td, "hidden md:table-cell")}>
                <span className="block font-medium">{row.productName}</span>
                {row.productStatus !== "published" && <span className="text-[12px] text-[#666]">Product: {row.productStatus}</span>}
              </td>
              <td className={cn(td, "hidden text-[#333] lg:table-cell")}>{row.options.map((option) => `${option.option}: ${option.value}`).join(" · ") || <span className="text-[#a6a6a6]">—</span>}</td>
              <td className={cn(td, "hidden whitespace-nowrap tabular-nums sm:table-cell")}>
                {formatKzt(row.price ?? undefined)}
                {row.compareAt !== null && row.price !== null && row.compareAt > row.price && <span className="ml-2 text-[12px] text-[#8c8c8c] line-through">{formatKzt(row.compareAt)}</span>}
              </td>
              <td className={td}><StockCell available={row.stock.available} onHand={row.stock.onHand} /></td>
              <td className={cn(td, "hidden sm:table-cell")}><StatusBadge status={row.status} /></td>
              <td className={cn(td, "text-right")}><BinButton label={`Delete SKU ${row.sku}`} onClick={() => onDeleteSku(row)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
