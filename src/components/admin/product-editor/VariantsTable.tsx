"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Images, Star, Trash2, X } from "lucide-react";
import type { ProductImage, ProductOption, ProductVariant, VariantStatus } from "@/lib/cms/types";
import { Button, Select, StatusSelect } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import {
  BLOCKER_LABELS, applyBulk, filterVariants, parseAmount, patchVariant, pruneOrphanedValues, removeVariants, selectByRule, setDefaultVariant, skuIssues, variantChips, variantReadiness,
  type SelectionRule,
} from "./variants-state";
import { formatUsd, smallInputClass } from "./shared";

// Step 2/3 of the Variants tab (plan M6.2): a responsive variant list (a CSS grid row at ≥1024 px, a card
// below; never a forced-width table), "ready to sell" per row, the default-variant star, a "more" panel
// (compare-at, Garmin price, title, photos) and a black bulk bar that appears only while rows are selected.
export type VariantsUpdater = (previous: ProductVariant[]) => ProductVariant[];

interface VariantsTableProps {
  options: ProductOption[];
  variants: ProductVariant[];
  images: ProductImage[];
  /** Upper-cased SKUs the server rejected with 409. */
  conflicts: string[];
  /** Scroll to and highlight this SKU (from the SKU drawer). */
  focusSku?: string | null;
  onChange: (updater: VariantsUpdater) => void;
  /** Receives the options without values that deleted variants were the last to use. */
  onOptions?: (options: ProductOption[]) => void;
}

const STATUSES: VariantStatus[] = ["active", "draft", "archived"];
const STATUS_LABELS: Record<string, string> = { active: "Active", draft: "Draft", archived: "Archived" };
const PAGE = 100;
const ROW_GRID = "lg:grid-cols-[20px_44px_minmax(0,1.45fr)_minmax(0,1.15fr)_minmax(92px,0.75fr)_72px_minmax(116px,0.8fr)_72px]";

export function VariantsTable({ options, variants, images, conflicts, focusSku, onChange, onOptions }: VariantsTableProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [notReadyOnly, setNotReadyOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => skuIssues(variants, conflicts), [variants, conflicts]);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const shown = useMemo(() => filterVariants(variants, filters, notReadyOnly), [variants, filters, notReadyOnly]);
  const visible = showAll ? shown : shown.slice(0, PAGE);
  const liveIds = useMemo(() => new Set(variants.map((variant) => variant.id)), [variants]);
  const selectedIds = useMemo(() => new Set([...selected].filter((id) => liveIds.has(id))), [selected, liveIds]);
  const shownSelected = shown.filter((variant) => selectedIds.has(variant.id)).length;
  const filterable = options.filter((option) => option.values.length > 1);
  const filtered = shown.length !== variants.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = shownSelected > 0 && shownSelected < shown.length;
  }, [shownSelected, shown.length]);

  // "Open full editor" from the SKU drawer: show that row, scroll to its SKU field and highlight it.
  useEffect(() => {
    if (!focusSku) return;
    const target = variants.find((variant) => variant.sku.trim().toUpperCase() === focusSku.trim().toUpperCase());
    if (!target) return;
    setFilters({});
    setNotReadyOnly(false);
    if (variants.indexOf(target) >= PAGE) setShowAll(true);
    setHighlight(target.id);
    const frame = requestAnimationFrame(() => {
      const input = listRef.current?.querySelector<HTMLInputElement>(`[data-variant-id="${CSS.escape(target.id)}"] input[data-field="sku"]`);
      input?.scrollIntoView({ block: "center" });
      input?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
    // only when a new SKU is requested
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSku]);

  const patch = useCallback((id: string, change: Partial<ProductVariant>) => onChange((previous) => patchVariant(previous, id, change)), [onChange]);
  const makeDefault = useCallback((id: string) => onChange((previous) => setDefaultVariant(previous, id)), [onChange]);
  // Owner 2026-11-23: delete variants the store does not sell. They leave the list now and are deleted on Save
  // (archived instead when an order references them). A product keeps at least one variant.
  const removeIds = useCallback((ids: ReadonlySet<string>, label: string) => {
    if (ids.size >= variants.length) { window.alert("A product needs at least one variant. To remove everything, delete the product in Admin ▸ Products."); return; }
    if (!window.confirm(`Delete ${label}? It is removed when you save the product. A variant that already has orders is archived instead.`)) return;
    const next = removeVariants(variants, ids);
    if (next === variants) return;
    onChange(() => next);
    const pruned = pruneOrphanedValues(options, variants, next);
    if (pruned !== options) onOptions?.(pruned);
    setSelected((previous) => new Set([...previous].filter((id) => !ids.has(id))));
  }, [onChange, onOptions, options, variants]);
  const removeOne = useCallback((id: string, name: string) => removeIds(new Set([id]), `variant ${name}`), [removeIds]);
  const toggleSelected = useCallback((id: string) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const toggleExpanded = useCallback((id: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const toggleAllShown = () => setSelected((previous) => {
    const next = new Set(previous);
    if (shownSelected === shown.length) for (const variant of shown) next.delete(variant.id);
    else for (const variant of shown) next.add(variant.id);
    return next;
  });

  const applyRule = (raw: string) => {
    if (!raw) return;
    let rule: SelectionRule;
    if (raw === "all" || raw === "none" || raw === "notReady" || raw === "outOfStock") rule = { kind: raw };
    else { const [optionId, valueId] = raw.split("::"); rule = { kind: "value", optionId, valueId }; }
    setSelected(selectByRule(variants, rule));
  };

  if (!variants.length) return null;

  return (
    <div>
      {/* Toolbar: select-all, select by rule, filters */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-b-0 border-[#d9d9d9] bg-white px-3 py-2.5">
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
          <input ref={selectAllRef} type="checkbox" checked={shown.length > 0 && shownSelected === shown.length} onChange={toggleAllShown} className="h-4 w-4 shrink-0 accent-black" />
          <span>{filtered ? "Select shown" : "Select all"}</span>
        </label>
        <Select size="sm" value="" onChange={(event) => applyRule(event.target.value)} aria-label="Select variants by rule" wrapperClassName="w-[150px]">
          <option value="">Select…</option>
          <option value="all">All variants</option>
          <option value="none">None</option>
          <option value="notReady">Not ready to sell</option>
          <option value="outOfStock">Out of stock</option>
          {options.filter((option) => option.values.length).map((option) => (
            <optgroup key={option.id} label={option.name || "Option"}>
              {option.values.map((value) => <option key={value.id} value={`${option.id}::${value.id}`}>All {value.label}</option>)}
            </optgroup>
          ))}
        </Select>
        <span className="hidden h-6 border-l border-[#d9d9d9] sm:block" aria-hidden="true" />
        {filterable.map((option) => (
          <Select key={option.id} size="sm" value={filters[option.id] ?? ""} onChange={(event) => setFilters((previous) => ({ ...previous, [option.id]: event.target.value }))} aria-label={`Show only one ${option.name}`} wrapperClassName="w-[150px]">
            <option value="">All {option.name}</option>
            {option.values.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
          </Select>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={notReadyOnly} onChange={(event) => setNotReadyOnly(event.target.checked)} className="h-4 w-4 shrink-0 accent-black" />
          Not ready only
        </label>
        {(filtered || notReadyOnly) && (
          <span className="ml-auto flex items-center gap-2 text-[12px] text-[#666]">
            Showing {shown.length} of {variants.length}
            <Button size="sm" variant="link" className="h-auto px-0 text-[12px]" onClick={() => { setFilters({}); setNotReadyOnly(false); }}>Show all</Button>
          </span>
        )}
      </div>

      {/* Column labels (desktop only; every input also has its own label) */}
      <div aria-hidden="true" className={cn("hidden gap-x-3 border border-b-0 border-[#d9d9d9] bg-[#f7f7f7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#595959] lg:grid", ROW_GRID)}>
        <span />
        <span>Photo</span>
        <span>Variant</span>
        <span>SKU</span>
        <span>Price ₸</span>
        <span>Stock</span>
        <span>Status</span>
        <span />
      </div>

      {shown.length === 0 ? (
        <p className="border border-[#d9d9d9] bg-white px-4 py-6 text-[13px] text-[#666]">No variant matches these filters.</p>
      ) : (
        <ul ref={listRef} className="divide-y divide-[#ececec] border border-[#d9d9d9] bg-white" aria-label="Variants">
          {visible.map((variant) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              chips={variantChips(options, variant)}
              issue={issues.get(variant.id) ?? ""}
              thumbnail={imageById.get(variant.imageIds[0] ?? "")?.src ?? null}
              images={images}
              selected={selectedIds.has(variant.id)}
              expanded={expanded.has(variant.id)}
              highlighted={highlight === variant.id}
              onToggleSelected={toggleSelected}
              onToggleExpanded={toggleExpanded}
              onPatch={patch}
              onMakeDefault={makeDefault}
              onDelete={removeOne}
            />
          ))}
        </ul>
      )}
      {!showAll && shown.length > PAGE && (
        <div className="border border-t-0 border-[#d9d9d9] bg-white p-2 text-center">
          <Button size="sm" variant="outline" onClick={() => setShowAll(true)}>Show all {shown.length} variants</Button>
        </div>
      )}
      <p className="mt-2 text-[12px] text-[#666]">
        Shoppers land on the <Star className="inline h-3 w-3 fill-black align-[-1px]" aria-hidden="true" /> default variant. Drafts and archived variants are hidden from shoppers. Tick rows to change several at once.
      </p>

      {selectedIds.size > 0 && (
        <BulkBar
          count={selectedIds.size}
          onApply={(patchValue) => onChange((previous) => applyBulk(previous, selectedIds, patchValue))}
          onDelete={() => removeIds(selectedIds, `${selectedIds.size} selected variant${selectedIds.size === 1 ? "" : "s"}`)}
          onClear={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}

const VariantRow = memo(function VariantRow({ variant, chips, issue, thumbnail, images, selected, expanded, highlighted, onToggleSelected, onToggleExpanded, onPatch, onMakeDefault, onDelete }: {
  variant: ProductVariant;
  chips: { optionName: string; label: string }[];
  issue: string;
  thumbnail: string | null;
  images: ProductImage[];
  selected: boolean;
  expanded: boolean;
  highlighted: boolean;
  onToggleSelected: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onPatch: (id: string, change: Partial<ProductVariant>) => void;
  onMakeDefault: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const id = useId();
  const name = chips.map((chip) => chip.label).join(" / ") || variant.title || variant.sku || "variant";
  const { ready, blockers } = variantReadiness(variant);
  const archived = variant.status === "archived";
  const blocker = blockers[0];
  const numberValue = (raw: string) => (raw.trim() === "" ? 0 : Math.max(0, Number(raw)));
  return (
    <li data-variant-id={variant.id} className={cn("transition-colors duration-500", selected && "bg-[#f5f5f5]", highlighted && "bg-[#fff8db]")}>
      <div className={cn("grid grid-cols-[20px_44px_minmax(0,1fr)_72px] items-start gap-x-3 gap-y-3 px-3 py-3 lg:items-center", ROW_GRID)}>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelected(variant.id)} aria-label={`Select ${name}`} className="mt-3 h-4 w-4 accent-black lg:mt-0" />
        <button
          type="button"
          onClick={() => onToggleExpanded(variant.id)}
          aria-label={`Photos of ${name}: ${variant.imageIds.length || "product gallery"}`}
          className="relative grid h-11 w-11 place-items-center border border-[#d9d9d9] bg-white hover:border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail from uploads or garmin.com
            <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" />
          ) : (
            <Images className="h-4 w-4 text-[#8c8c8c]" aria-hidden="true" />
          )}
          {variant.imageIds.length > 0 && <span className="absolute -bottom-1 -right-1 min-w-4 bg-black px-1 text-center text-[10px] leading-4 text-white">{variant.imageIds.length}</span>}
        </button>
        <div className={cn("min-w-0", archived && "opacity-60")}>
          <div className="flex flex-wrap gap-1">
            {chips.length ? chips.map((chip) => (
              <span key={chip.optionName} title={chip.optionName} className="border border-[#d9d9d9] bg-white px-1.5 py-px text-[12px] leading-[18px] text-black">{chip.label}</span>
            )) : <span className="text-[13px]">{variant.title || "—"}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <button
              type="button"
              onClick={() => onMakeDefault(variant.id)}
              aria-pressed={variant.isDefault}
              aria-label={variant.isDefault ? `${name} is the default variant` : `Make ${name} the default variant`}
              className={cn("inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black", variant.isDefault ? "font-semibold text-black" : "text-[#8c8c8c] hover:text-black")}
            >
              <Star className={cn("h-3.5 w-3.5", variant.isDefault && "fill-black")} aria-hidden="true" />
              {variant.isDefault ? "Default" : "Make default"}
            </button>
            <span className={cn("inline-flex items-center gap-1.5", ready ? "text-[#4d5900]" : blocker === "draft" || blocker === "archived" ? "text-[#595959]" : "text-[#a30d28]")}>
              <span aria-hidden="true" data-status-dot className={cn("h-2 w-2 rounded-none", ready ? "bg-[#9aa62a]" : blocker === "draft" || blocker === "archived" ? "border border-[#8c8c8c]" : "bg-[#c20f2f]")} />
              {ready ? "Ready to sell" : BLOCKER_LABELS[blocker]}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end lg:order-last">
          <Button size="icon-sm" variant="ghost" onClick={() => onDelete(variant.id, name)} aria-label={`Delete ${name}`} title="Delete variant" className="text-[#8c8c8c] hover:text-[#c20f2f]">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onToggleExpanded(variant.id)}
            aria-expanded={expanded}
            aria-controls={`${id}-more`}
            aria-label={`${expanded ? "Hide" : "More"} details for ${name}`}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          </Button>
        </div>
        <div className="col-span-full grid grid-cols-3 gap-x-2 gap-y-2 lg:contents">
          <div className="col-span-3 lg:col-span-1">
            <span aria-hidden="true" className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#595959] lg:hidden">SKU</span>
            <input
              type="text"
              data-field="sku"
              value={variant.sku}
              onChange={(event) => onPatch(variant.id, { sku: event.target.value })}
              aria-label={`SKU for ${name}`}
              aria-invalid={Boolean(issue) || undefined}
              aria-describedby={issue ? `${id}-sku` : undefined}
              className={cn(smallInputClass, "font-mono", issue && "border-[#920000] bg-[#fff5f6]")}
            />
            {issue && <p id={`${id}-sku`} className="mt-0.5 text-[12px] text-[#a30d28]">{issue}</p>}
          </div>
          <div>
            <span aria-hidden="true" className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#595959] lg:hidden">Price ₸</span>
            <input type="number" min={0} inputMode="decimal" value={variant.price ?? ""} onChange={(event) => onPatch(variant.id, { price: event.target.value.trim() === "" ? null : numberValue(event.target.value) })} aria-label={`Price in tenge for ${name}`} className={cn(smallInputClass, "tabular-nums")} />
          </div>
          <div>
            <span aria-hidden="true" className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#595959] lg:hidden">Stock</span>
            <input type="number" min={0} inputMode="numeric" value={variant.stock} onChange={(event) => onPatch(variant.id, { stock: Math.trunc(numberValue(event.target.value)) })} aria-label={`Stock for ${name}`} className={cn(smallInputClass, "tabular-nums")} />
          </div>
          <div>
            <span aria-hidden="true" className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#595959] lg:hidden">Status</span>
            <StatusSelect size="sm" value={variant.status} options={STATUSES} labels={STATUS_LABELS} onChange={(value) => onPatch(variant.id, { status: value as VariantStatus })} aria-label={`Status for ${name}`} />
          </div>
        </div>
      </div>
      {expanded && <MorePanel id={`${id}-more`} variant={variant} name={name} images={images} onPatch={onPatch} />}
    </li>
  );
});

function MorePanel({ id, variant, name, images, onPatch }: { id: string; variant: ProductVariant; name: string; images: ProductImage[]; onPatch: (id: string, change: Partial<ProductVariant>) => void }) {
  const fieldId = useId();
  const imageById = new Map(images.map((image) => [image.id, image]));
  const toggleImage = (imageId: string) => onPatch(variant.id, { imageIds: variant.imageIds.includes(imageId) ? variant.imageIds.filter((item) => item !== imageId) : [...variant.imageIds, imageId] });
  const makeMain = (imageId: string) => onPatch(variant.id, { imageIds: [imageId, ...variant.imageIds.filter((item) => item !== imageId)] });
  const ordered = [...variant.imageIds.map((imageId) => imageById.get(imageId)).filter((image): image is ProductImage => Boolean(image)), ...images.filter((image) => !variant.imageIds.includes(image.id))];
  return (
    <div id={id} className="border-t border-dashed border-[#d9d9d9] bg-[#fafafa] px-3 py-3 lg:pl-[88px]">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto]">
        <div>
          <label htmlFor={`${fieldId}-cmp`} className="mb-0.5 block text-[12px] font-bold text-black">Compare-at ₸</label>
          <input
            id={`${fieldId}-cmp`}
            type="number"
            min={0}
            value={variant.originalPrice ?? ""}
            onChange={(event) => onPatch(variant.id, { originalPrice: event.target.value.trim() === "" || Number(event.target.value) <= 0 ? undefined : Number(event.target.value) })}
            placeholder="—"
            className={cn(smallInputClass, "tabular-nums")}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-title`} className="mb-0.5 block text-[12px] font-bold text-black">Variant name <span className="font-normal text-[#666]">(cart, orders)</span></label>
          <input id={`${fieldId}-title`} type="text" value={variant.title} onChange={(event) => onPatch(variant.id, { title: event.target.value })} className={smallInputClass} />
        </div>
        <div className="text-[12px] text-[#595959] sm:col-span-2 lg:col-span-1">
          <span className="mb-0.5 block font-bold text-black">Garmin price</span>
          {variant.sourcePrice ? (
            <span title={`At ${variant.sourcePrice.rateKztPerUsd} ₸/USD`}>
              {formatUsd(variant.sourcePrice.sale ?? variant.sourcePrice.list)}
              {variant.sourcePrice.sale !== undefined && ` (list ${formatUsd(variant.sourcePrice.list)})`}
              {variant.sourcePartNumber ? ` · ${variant.sourcePartNumber}` : ""}
            </span>
          ) : "—"}
        </div>
      </div>
      <div className="mt-3">
        <p className="mb-1.5 text-[12px] text-[#595959]">
          <span className="font-bold text-black">Photos for {name}.</span> Click to use; the starred one is the main photo. None picked = the product gallery.
        </p>
        {images.length === 0 ? (
          <p className="text-[12px] text-[#666]">Add product photos on the Photos tab first.</p>
        ) : (
          <ul className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto p-0.5">
            {ordered.map((image) => {
              const position = variant.imageIds.indexOf(image.id);
              const picked = position >= 0;
              return (
                <li key={image.id} className="relative">
                  <button
                    type="button"
                    onClick={() => toggleImage(image.id)}
                    aria-pressed={picked}
                    aria-label={`${picked ? "Stop using" : "Use"} photo ${image.alt || image.id}`}
                    className={cn("block h-14 w-14 border bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black", picked ? "border-black ring-1 ring-black" : "border-[#d9d9d9] opacity-60 hover:opacity-100")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                    <img src={image.src} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" />
                  </button>
                  {picked && (
                    <button type="button" onClick={() => makeMain(image.id)} aria-label="Make this the main photo of the variant" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center border border-[#d9d9d9] bg-white focus-visible:outline-2 focus-visible:outline-black">
                      <Star className={cn("h-3 w-3", position === 0 ? "fill-[#f0b800] text-[#b38900]" : "text-[#8c8c8c]")} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Step 3: appears only with a selection; sticky above the save bar. Blank fields are left unchanged. */
function BulkBar({ count, onApply, onDelete, onClear }: { count: number; onDelete: () => void; onApply: (patch: { price?: number; originalPrice?: number | null; stock?: number; status?: VariantStatus }) => void; onClear: () => void }) {
  const [fields, setFields] = useState({ price: "", originalPrice: "", stock: "", status: "" });
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const id = useId();
  const empty = !fields.price && !fields.originalPrice && !fields.stock && !fields.status;
  const apply = () => {
    const price = parseAmount(fields.price), originalPrice = parseAmount(fields.originalPrice), stock = parseAmount(fields.stock);
    if ([price, originalPrice, stock].some((value) => value !== undefined && Number.isNaN(value))) { setMessage({ tone: "error", text: "Use numbers of 0 or more." }); return; }
    onApply({
      ...(price !== undefined ? { price } : {}),
      ...(originalPrice !== undefined ? { originalPrice: originalPrice || null } : {}),
      ...(stock !== undefined ? { stock } : {}),
      ...(fields.status ? { status: fields.status as VariantStatus } : {}),
    });
    setFields({ price: "", originalPrice: "", stock: "", status: "" });
    setMessage({ tone: "ok", text: `Applied to ${count} variant${count === 1 ? "" : "s"}.` });
  };
  const field = "h-8 w-full border border-white/40 bg-white px-2 text-[13px] text-black tabular-nums placeholder:text-[#8c8c8c] focus:border-white focus:outline-2 focus:outline-offset-1 focus:outline-white";
  return (
    <div role="region" aria-label="Edit selected variants" className="sticky bottom-0 z-20 -mx-4 mt-4 border-t-4 border-[#f0b800] bg-black px-4 py-3 text-white sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="mr-1 flex min-w-[110px] flex-col">
          <span className="text-[16px] font-semibold tabular-nums leading-tight">{count} selected</span>
          <span className="text-[11px] text-white/70">Blank fields stay as they are</span>
        </div>
        <label className="w-[calc(50%-6px)] sm:w-28" htmlFor={`${id}-price`}>
          <span className="mb-0.5 block text-[11px] uppercase tracking-[0.06em] text-white/80">Price ₸</span>
          <input id={`${id}-price`} inputMode="decimal" value={fields.price} onChange={(event) => setFields((previous) => ({ ...previous, price: event.target.value }))} className={field} />
        </label>
        <label className="w-[calc(50%-6px)] sm:w-28" htmlFor={`${id}-cmp`}>
          <span className="mb-0.5 block text-[11px] uppercase tracking-[0.06em] text-white/80">Compare-at ₸</span>
          <input id={`${id}-cmp`} inputMode="decimal" value={fields.originalPrice} onChange={(event) => setFields((previous) => ({ ...previous, originalPrice: event.target.value }))} placeholder="0 clears" className={field} />
        </label>
        <label className="w-[calc(50%-6px)] sm:w-20" htmlFor={`${id}-stock`}>
          <span className="mb-0.5 block text-[11px] uppercase tracking-[0.06em] text-white/80">Stock</span>
          <input id={`${id}-stock`} inputMode="numeric" value={fields.stock} onChange={(event) => setFields((previous) => ({ ...previous, stock: event.target.value }))} className={field} />
        </label>
        <div className="w-[calc(50%-6px)] sm:w-36">
          <label htmlFor={`${id}-status`} className="mb-0.5 block text-[11px] uppercase tracking-[0.06em] text-white/80">Status</label>
          <Select id={`${id}-status`} size="sm" value={fields.status} onChange={(event) => setFields((previous) => ({ ...previous, status: event.target.value }))} className="focus-visible:outline-white">
            <option value="">Unchanged</option>
            {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={apply} disabled={empty} className="border-white focus-visible:outline-white">Apply to {count}</Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-white focus-visible:outline-white">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete {count}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} className="text-white focus-visible:outline-white">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </Button>
        </div>
        <p aria-live="polite" className={cn("basis-full text-[12px] sm:basis-auto", message?.tone === "error" ? "text-[#ff9aa9]" : "text-[#e3ea9b]")}>{message?.text}</p>
      </div>
    </div>
  );
}
