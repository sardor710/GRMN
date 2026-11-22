"use client";

// The variants table of the document editor (/admin/products/content): per-variant Own / Same as product
// content and the unpriced-publish errors. The structured catalog editor uses VariantsTable (VariantsStep).

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, Images, RefreshCw, Star } from "lucide-react";
import type { ProductImage, ProductOption, ProductVariant, VariantStatus } from "@/lib/cms/types";
import { generateVariants } from "@/lib/cms/product-variants";
import type { ProductContentDTO, VariantContent } from "@/lib/catalog/variant-content";
import { formatKzt, formatUsd, labelClass, primaryButtonClass, secondaryButtonClass, smallInputClass } from "./shared";
import { VariantContentEditor, ownedBlockLabels } from "./VariantContentEditor";

interface VariantsTableProps {
  options: ProductOption[];
  variants: ProductVariant[];
  images: ProductImage[];
  base: { sku: string; price: number; stock: number };
  /** Upper-cased SKUs the server rejected with 409. */
  conflicts: string[];
  /** Ids of non-archived variants priced at 0 that block publishing (final review I1). */
  unpriced?: string[];
  onChange: (variants: ProductVariant[]) => void;
  /**
   * The product's Specs/Overview/In the box. When given (PostgreSQL only), each variant gets an
   * Own / Same as product switch per block. Omitted in legacy JSON mode, which cannot store overrides.
   */
  productContent?: ProductContentDTO;
  /** A variant switched blocks back to Same as product: its translated copies of those keys should go too. */
  onContentRemoved?: (variantId: string, keys: (keyof VariantContent)[]) => void;
}

const STATUSES: VariantStatus[] = ["active", "draft", "archived"];

const numOrUndefined = (raw: string): number | undefined => (raw.trim() === "" ? undefined : Number(raw));

/**
 * True when the variants no longer match the current option/value set: a variant points at a removed
 * option/value, misses an option, or a value is used by no variant. Imported products may legitimately
 * cover only some combinations, so a partial matrix alone is not "out of date".
 */
function variantsOutOfDate(options: ProductOption[], variants: ProductVariant[]): boolean {
  const usable = options.filter((o) => o.values.length);
  if (!usable.length) return variants.length > 0;
  if (!variants.length) return true;
  const valid = new Map(usable.map((o) => [o.id, new Set(o.values.map((v) => v.id))]));
  const broken = variants.some(
    (v) =>
      usable.some((o) => !v.selections[o.id]) ||
      Object.entries(v.selections).some(([o, val]) => !valid.get(o)?.has(val)),
  );
  if (broken) return true;
  const used = new Set(variants.flatMap((v) => Object.values(v.selections)));
  return usable.some((o) => o.values.some((val) => !used.has(val.id)));
}

export function LegacyVariantsTable({ options, variants, images, base, conflicts, unpriced = [], onChange, productContent, onContentRemoved }: VariantsTableProps) {
  const [notice, setNotice] = useState<{ tone: "error" | "warning" | "info"; text: string } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState({ price: "", originalPrice: "", stock: "", status: "" });
  const [openImagesFor, setOpenImagesFor] = useState<string | null>(null);
  const [openContentFor, setOpenContentFor] = useState<string | null>(null);
  // Per-variant content only means something when shoppers can pick between two or more variants, but an
  // override saved earlier (e.g. before a variant was removed) stays visible so it can be reset; an open
  // panel stays open after that reset until it is closed.
  const contentColumn =
    Boolean(productContent) &&
    (variants.length > 1 || variants.some((v) => v.content !== undefined || v.id === openContentFor));
  const columnCount = contentColumn ? 9 : 8;
  const contentVariant = contentColumn ? variants.find((v) => v.id === openContentFor) : undefined;

  const conflictSet = useMemo(() => new Set(conflicts.map((c) => c.toUpperCase())), [conflicts]);
  const duplicateSkus = useMemo(() => {
    const seen = new Map<string, number>();
    for (const v of variants) {
      const k = v.sku.trim().toUpperCase();
      if (k) seen.set(k, (seen.get(k) || 0) + 1);
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [variants]);

  const imageById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);
  const valueLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) for (const v of o.values) m.set(v.id, v.label);
    return m;
  }, [options]);

  const stale = variantsOutOfDate(options, variants);
  const filterable = options.filter((o) => o.values.length > 1);
  const shown = variants.filter((v) => Object.entries(filters).every(([o, val]) => !val || v.selections[o] === val));

  const patch = (id: string, change: Partial<ProductVariant>) =>
    onChange(variants.map((v) => (v.id === id ? { ...v, ...change } : v)));

  const setDefault = (id: string) => onChange(variants.map((v) => ({ ...v, isDefault: v.id === id })));

  const handleGenerate = () => {
    setNotice(null);
    const usable = options.filter((o) => o.values.length);
    if (options.some((o) => !o.name.trim())) {
      setNotice({ tone: "error", text: "Give every option a name before generating variants." });
      return;
    }
    if (!usable.length) {
      if (variants.length && !window.confirm(`Remove all ${variants.length} variants and make this a simple product?`)) return;
      onChange([]);
      setNotice({ tone: "info", text: "No option values — this is now a simple, single-SKU product." });
      return;
    }
    try {
      const result = generateVariants(options, variants, base);
      if (result.warning && !window.confirm(`${result.warning}\n\nContinue?`)) return;
      const draftNew = variants.length > 0 && result.added > 0;
      const lines = [
        result.added > 0 &&
          `${result.added} new combination${result.added === 1 ? "" : "s"} will be created${draftNew ? " as DRAFT (not for sale until you activate them)" : ""}.`,
        result.merged > 0 &&
          `${result.merged} variant${result.merged === 1 ? "" : "s"} will be merged into the remaining combinations (the default / in-stock one is kept).`,
        result.removed - result.merged > 0 &&
          `${result.removed - result.merged} existing variant${result.removed - result.merged === 1 ? "" : "s"} no longer match the options and will be removed (with their SKU, price, stock and photos).`,
      ].filter(Boolean);
      if ((result.removed > 0 || draftNew) && !window.confirm(`${lines.join("\n")}\n\nContinue?`)) {
        return;
      }
      onChange(result.variants);
      setFilters({});
      setNotice({
        tone: result.warning ? "warning" : "info",
        text: `${result.variants.length} variants · ${result.added} new${draftNew ? " (draft)" : ""} · ${result.removed} removed${result.warning ? ` — ${result.warning}` : ""}`,
      });
    } catch (err) {
      if (err instanceof RangeError) {
        setNotice({
          tone: "error",
          text: `Too many combinations: ${err.message}. Remove some option values or split this into several products.`,
        });
      } else {
        setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not generate variants." });
      }
    }
  };

  const applyBulk = () => {
    const ids = new Set(shown.map((v) => v.id));
    const price = numOrUndefined(bulk.price);
    const originalPrice = numOrUndefined(bulk.originalPrice);
    const stock = numOrUndefined(bulk.stock);
    onChange(
      variants.map((v) =>
        ids.has(v.id)
          ? {
              ...v,
              ...(price !== undefined ? { price } : {}),
              ...(originalPrice !== undefined ? { originalPrice: originalPrice || undefined } : {}),
              ...(stock !== undefined ? { stock } : {}),
              ...(bulk.status ? { status: bulk.status as VariantStatus } : {}),
            }
          : v,
      ),
    );
    setBulk({ price: "", originalPrice: "", stock: "", status: "" });
  };

  const toggleImage = (variant: ProductVariant, imageId: string) => {
    const has = variant.imageIds.includes(imageId);
    patch(variant.id, {
      imageIds: has ? variant.imageIds.filter((id) => id !== imageId) : [...variant.imageIds, imageId],
    });
  };

  const makeMainImage = (variant: ProductVariant, imageId: string) =>
    patch(variant.id, { imageIds: [imageId, ...variant.imageIds.filter((id) => id !== imageId)] });

  const bulkEmpty = !bulk.price && !bulk.originalPrice && !bulk.stock && !bulk.status;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className={labelClass}>Variants ({variants.length})</span>
          {stale && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-black">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Options changed — click “Generate variants” to update the list.
            </p>
          )}
        </div>
        <button type="button" onClick={handleGenerate} className={primaryButtonClass}>
          <RefreshCw className="h-3.5 w-3.5" />
          Generate variants
        </button>
      </div>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`border px-3 py-2 text-xs rounded-none ${
            notice.tone === "error"
              ? "border-garmin-error bg-white text-garmin-error"
              : notice.tone === "warning"
                ? "border-garmin-badge-gold bg-garmin-badge-gold/20 text-black"
                : "border-garmin-control bg-muted text-black"
          }`}
        >
          {notice.text}
        </p>
      )}

      {variants.length > 0 && (
        <>
          {/* Filters + bulk edit */}
          <div className="flex flex-wrap items-end gap-2 border border-border bg-neutral-50 p-2">
            {filterable.map((o) => (
              <select
                key={o.id}
                value={filters[o.id] || ""}
                onChange={(e) => setFilters((f) => ({ ...f, [o.id]: e.target.value }))}
                aria-label={`Filter by ${o.name}`}
                className={`${smallInputClass} w-auto max-w-[160px]`}
              >
                <option value="">All {o.name}</option>
                {o.values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            ))}
            <span className="mx-1 hidden h-7 border-l border-border sm:block" aria-hidden="true" />
            <input
              type="number"
              inputMode="numeric"
              value={bulk.price}
              onChange={(e) => setBulk((b) => ({ ...b, price: e.target.value }))}
              placeholder="Price ₸"
              aria-label="Bulk price"
              className={`${smallInputClass} w-28`}
            />
            <input
              type="number"
              inputMode="numeric"
              value={bulk.originalPrice}
              onChange={(e) => setBulk((b) => ({ ...b, originalPrice: e.target.value }))}
              placeholder="Compare-at ₸"
              aria-label="Bulk compare-at price (0 clears)"
              title="0 clears the compare-at price"
              className={`${smallInputClass} w-28`}
            />
            <input
              type="number"
              inputMode="numeric"
              value={bulk.stock}
              onChange={(e) => setBulk((b) => ({ ...b, stock: e.target.value }))}
              placeholder="Stock"
              aria-label="Bulk stock"
              className={`${smallInputClass} w-20`}
            />
            <select
              value={bulk.status}
              onChange={(e) => setBulk((b) => ({ ...b, status: e.target.value }))}
              aria-label="Bulk status"
              className={`${smallInputClass} w-auto`}
            >
              <option value="">Status…</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" onClick={applyBulk} disabled={bulkEmpty} className={secondaryButtonClass}>
              Apply to {shown.length === variants.length ? `all ${variants.length}` : `${shown.length} shown`}
            </button>
          </div>

          <div className="max-h-[460px] overflow-auto border border-border">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-neutral-50">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-semibold" scope="col">
                    Default
                  </th>
                  <th className="px-2 py-2 font-semibold" scope="col">
                    Variant
                  </th>
                  <th className="px-2 py-2 font-semibold" scope="col">
                    SKU
                  </th>
                  <th className="px-2 py-2 font-semibold" scope="col">
                    Price ₸
                  </th>
                  <th className="px-2 py-2 font-semibold" scope="col">
                    Compare-at ₸
                  </th>
                  <th className="px-2 py-2 font-semibold" scope="col">
                    Stock
                  </th>
                  <th className="px-2 py-2 font-semibold" scope="col">
                    Status
                  </th>
                  {contentColumn && (
                    <th className="px-2 py-2 font-semibold" scope="col">
                      Content
                    </th>
                  )}
                  <th className="px-2 py-2 font-semibold" scope="col">
                    Photos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {shown.map((v) => {
                  const skuKey = v.sku.trim().toUpperCase();
                  const skuError = !skuKey
                    ? "SKU is required"
                    : conflictSet.has(skuKey)
                      ? "SKU already used by another product"
                      : duplicateSkus.has(skuKey)
                        ? "Duplicate SKU in this product"
                        : "";
                  const chips = options
                    .map((o) => valueLabel.get(v.selections[o.id] || ""))
                    .filter((l): l is string => Boolean(l));
                  const thumb = imageById.get(v.imageIds[0] || "");
                  const imagesOpen = openImagesFor === v.id;
                  const contentOpen = contentColumn && openContentFor === v.id;
                  const owned = ownedBlockLabels(v.content);
                  // Cleared as soon as the row's price is above 0 or it is archived.
                  const priceError = unpriced.includes(v.id) && v.status !== "archived" && !(Number(v.price) > 0);
                  return (
                    <Fragment key={v.id}>
                      <tr className={`align-top ${v.status === "archived" ? "bg-neutral-50 text-muted-foreground" : ""}`}>
                        <td className="px-2 py-1.5">
                          <input
                            type="radio"
                            name="default-variant"
                            checked={v.isDefault}
                            onChange={() => setDefault(v.id)}
                            aria-label={`Make ${v.title} the default variant`}
                            className="mt-1.5 h-4 w-4 accent-black"
                          />
                        </td>
                        <td className="max-w-[240px] px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {chips.map((c, i) => (
                              <span key={i} className="border border-border bg-white px-1.5 py-0.5 text-xs text-neutral-700">
                                {c}
                              </span>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={v.title}
                            onChange={(e) => patch(v.id, { title: e.target.value })}
                            aria-label="Variant title"
                            className="mt-1 h-6 w-full border border-transparent bg-transparent px-1 text-xs text-neutral-600 hover:border-neutral-200 focus:border-black focus:bg-white focus:outline-none"
                          />
                        </td>
                        <td className="w-44 px-2 py-1.5">
                          <input
                            type="text"
                            value={v.sku}
                            onChange={(e) => patch(v.id, { sku: e.target.value })}
                            aria-label={`SKU for ${v.title}`}
                            aria-invalid={Boolean(skuError)}
                            className={`${smallInputClass} font-mono ${skuError ? "border-garmin-error bg-white" : ""}`}
                          />
                          {skuError && <p className="mt-0.5 text-xs text-garmin-error">{skuError}</p>}
                        </td>
                        <td className="w-32 px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={v.price ?? ""}
                            onChange={(e) => patch(v.id, { price: Number(e.target.value) })}
                            aria-label={`Price for ${v.title}`}
                            aria-invalid={priceError}
                            aria-describedby={priceError ? `variant-price-error-${v.id}` : undefined}
                            className={`${smallInputClass} ${priceError ? "border-garmin-error bg-white" : ""}`}
                          />
                          {priceError && (
                            <p id={`variant-price-error-${v.id}`} className="mt-0.5 text-xs text-garmin-error">
                              Set a price above 0 before publishing.
                            </p>
                          )}
                          {v.sourcePrice && (
                            <p className="mt-0.5 text-xs text-muted-foreground" title={`Garmin price at ${v.sourcePrice.rateKztPerUsd} ₸/USD`}>
                              Garmin {formatUsd(v.sourcePrice.sale ?? v.sourcePrice.list)}
                              {v.sourcePrice.sale !== undefined && ` (list ${formatUsd(v.sourcePrice.list)})`}
                            </p>
                          )}
                        </td>
                        <td className="w-32 px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={v.originalPrice ?? ""}
                            onChange={(e) => patch(v.id, { originalPrice: numOrUndefined(e.target.value) })}
                            placeholder="—"
                            aria-label={`Compare-at price for ${v.title}`}
                            className={smallInputClass}
                          />
                        </td>
                        <td className="w-20 px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={v.stock}
                            onChange={(e) => patch(v.id, { stock: Number(e.target.value) })}
                            aria-label={`Stock for ${v.title}`}
                            className={smallInputClass}
                          />
                        </td>
                        <td className="w-24 px-2 py-1.5">
                          <select
                            value={v.status}
                            onChange={(e) => patch(v.id, { status: e.target.value as VariantStatus })}
                            aria-label={`Status for ${v.title}`}
                            className={smallInputClass}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        {contentColumn && (
                          <td className="w-36 px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => setOpenContentFor(contentOpen ? null : v.id)}
                              aria-expanded={contentOpen}
                              aria-label={`Content for ${v.title}`}
                              className={`flex min-h-7 items-center border px-1.5 py-0.5 text-left text-xs ${
                                contentOpen ? "border-black bg-neutral-100" : "border-border bg-white hover:border-black"
                              }`}
                            >
                              {owned.length ? `Own: ${owned.join(", ")}` : "Same as product"}
                            </button>
                          </td>
                        )}
                        <td className="w-24 px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => setOpenImagesFor(imagesOpen ? null : v.id)}
                            aria-expanded={imagesOpen}
                            className={`flex h-7 items-center gap-1.5 border px-1.5 text-xs ${
                              imagesOpen ? "border-black bg-neutral-100" : "border-border bg-white hover:border-black"
                            }`}
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                              <img src={thumb.src} alt="" className="h-5 w-5 object-contain" />
                            ) : (
                              <Images className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            )}
                            {v.imageIds.length}
                          </button>
                        </td>
                      </tr>
                      {imagesOpen && (
                        <tr className="bg-neutral-50">
                          <td colSpan={columnCount} className="px-3 py-2">
                            {images.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Add product photos first, then pick them for this variant.</p>
                            ) : (
                              <>
                                <p className="mb-1.5 text-xs text-muted-foreground">
                                  Click photos to use them for <strong>{v.title}</strong>. The starred photo is this variant’s main
                                  photo. With no photos picked the product gallery is shown.
                                </p>
                                <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                                  {[
                                    ...v.imageIds.map((id) => imageById.get(id)).filter((i): i is ProductImage => Boolean(i)),
                                    ...images.filter((i) => !v.imageIds.includes(i.id)),
                                  ].map((img) => {
                                    const pos = v.imageIds.indexOf(img.id);
                                    const picked = pos >= 0;
                                    return (
                                      <li key={img.id} className="relative">
                                        <button
                                          type="button"
                                          onClick={() => toggleImage(v, img.id)}
                                          aria-pressed={picked}
                                          aria-label={`${picked ? "Remove" : "Use"} photo ${img.alt || img.id}`}
                                          className={`block h-14 w-14 border bg-white ${
                                            picked ? "border-black ring-1 ring-black" : "border-border opacity-60 hover:opacity-100"
                                          }`}
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                                          <img src={img.src} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" />
                                        </button>
                                        {picked && (
                                          <button
                                            type="button"
                                            onClick={() => makeMainImage(v, img.id)}
                                            aria-label="Make main photo for this variant"
                                            className="absolute -right-1 -top-1 bg-white p-0.5"
                                          >
                                            <Star
                                              className={`h-3 w-3 ${pos === 0 ? "fill-garmin-badge-gold text-black" : "text-neutral-400"}`}
                                            />
                                          </button>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </>
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
          {contentVariant && productContent && (
            <section
              aria-labelledby="variant-content-heading"
              className="space-y-3 border border-border bg-neutral-50 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 id="variant-content-heading" className="font-sans text-sm font-bold text-black">
                    Content for {contentVariant.title}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Own replaces the product&apos;s block for this variant only. Same as product follows the product tabs.
                  </p>
                </div>
                <button type="button" onClick={() => setOpenContentFor(null)} className={secondaryButtonClass}>
                  Close
                </button>
              </div>
              <VariantContentEditor
                key={contentVariant.id}
                variant={contentVariant}
                product={productContent}
                onChange={(content, removed) => {
                  patch(contentVariant.id, { content });
                  if (removed?.length) onContentRemoved?.(contentVariant.id, removed);
                }}
              />
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Default variant price {formatKzt(variants.find((v) => v.isDefault)?.price)} is mirrored to the product price and
            stock on save. Archived variants are hidden from shoppers.
          </p>
          {productContent && !contentColumn && variants.length === 1 && (
            <p className="text-xs text-muted-foreground">
              With one variant, Specs, Overview and In the box come from the product tabs. Per-variant content needs two or
              more variants.
            </p>
          )}
        </>
      )}
    </div>
  );
}
