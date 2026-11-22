"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  ProductImage,
  ProductOption,
  ProductTranslatable,
  ProductVariant,
  SpecGroup,
  Translations,
} from "@/lib/cms/types";
import type { Locale } from "@/i18n/config";
import { localizeProduct } from "@/i18n/translate-record";
import { availableValueIds, resolveVariant } from "@/lib/cms/product-variants";
import { GarminBadge } from "@/components/GarminBadge";
import { OverviewContent } from "@/components/product/OverviewContent";
import { previewSafeHtml } from "@/lib/admin/preview-html";
import { EditorDialog } from "./EditorDialog";
import { formatKzt, galleryFor, secondaryButtonClass } from "./shared";

export interface PreviewProduct {
  name: string;
  sku: string;
  family: string;
  description: string;
  badge?: string;
  price: number;
  originalPrice?: number;
  priceSuffix?: string;
  stock: number;
  image: string;
  images: ProductImage[];
  defaultImageId: string;
  options: ProductOption[];
  variants: ProductVariant[];
  translations?: Translations<ProductTranslatable>;
  /** Unsaved overview HTML (cleaned for preview; the server sanitizes on save). */
  overviewHtml?: string;
  specGroups?: SpecGroup[];
  inTheBox?: { label: string; image?: string }[];
}

interface ProductPreviewModalProps {
  open: boolean;
  onClose: () => void;
  product: PreviewProduct;
  /** Language the preview opens in (the editor's current content tab). */
  initialLocale?: Locale;
}

const PREVIEW_LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "ru", label: "RU" },
  { id: "kk", label: "KK" },
];

// TODO(M5): switch to ProductTop + buildDetailFromCms once the storefront helper exists, so the preview
// is rendered by the exact storefront components instead of this faithful re-creation.
export function ProductPreviewModal({ open, onClose, product, initialLocale = "en" }: ProductPreviewModalProps) {
  return (
    <EditorDialog
      open={open}
      onClose={onClose}
      wide
      title="Preview — product page"
      subtitle="Unsaved changes, shown as on the product page."
      footer={
        <button type="button" onClick={onClose} className={secondaryButtonClass}>
          Back to editor
        </button>
      }
    >
      {/* Remount on every open so the default variant is re-selected from the latest form state. */}
      {open && <LocalizedPreview product={product} initialLocale={initialLocale} />}
    </EditorDialog>
  );
}

/** Language selector; the body renders the storefront-localized product (overlay applied, English fallback). */
function LocalizedPreview({ product, initialLocale }: { product: PreviewProduct; initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  // In the box items are { label, image } here (the catalog editor's shape), not the document's strings, so
  // they stay in English in the preview; every other translatable field takes the RU/KK overlay.
  const localized = useMemo((): PreviewProduct => {
    const { inTheBox, ...rest } = product;
    return { ...localizeProduct(rest, locale), inTheBox };
  }, [product, locale]);
  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="Preview language" className="inline-flex border border-border">
        {PREVIEW_LOCALES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={locale === l.id}
            onClick={() => setLocale(l.id)}
            className={`px-3 py-1.5 text-xs font-semibold ${
              locale === l.id ? "bg-black text-white" : "bg-white text-neutral-600 hover:text-black"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <PreviewBody product={localized} />
      <PreviewTabs product={localized} />
    </div>
  );
}

// Overview, Specs and In the box from unsaved state, laid out like the storefront product tabs
// (src/components/ProductTabs.tsx is reused read-only through its overview stylesheet).
const PREVIEW_TABS = ["Overview", "Specs", "In the Box"] as const;
function PreviewTabs({ product }: { product: PreviewProduct }) {
  const [tab, setTab] = useState<(typeof PREVIEW_TABS)[number]>("Overview");
  const overview = useMemo(() => previewSafeHtml(product.overviewHtml ?? ""), [product.overviewHtml]);
  const groups = (product.specGroups ?? []).filter((group) => group.items.some((item) => item.label || item.value));
  const box = (product.inTheBox ?? []).filter((item) => item.label.trim());
  return (
    <section className="mt-10 overflow-x-clip border-t border-neutral-200">
      <div className="flex gap-8 overflow-x-auto border-b border-neutral-200 bg-[#f2f2f2] px-4" role="tablist" aria-label="Product page tabs">
        {PREVIEW_TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`relative whitespace-nowrap py-4 text-[14px] font-medium uppercase tracking-[0.06em] ${tab === name ? "text-black" : "text-neutral-500 hover:text-black"}`}
          >
            {name}
            {tab === name && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black" />}
          </button>
        ))}
      </div>
      <div className="mx-auto max-w-[1080px] py-8" role="tabpanel">
        {tab === "Overview" &&
          (overview ? (
            <OverviewContent html={overview} />
          ) : (
            <p className="text-[14px] text-neutral-500">No overview yet.</p>
          ))}
        {tab === "Specs" &&
          (groups.length ? (
            <div className="space-y-8">
              {groups.map((group, index) => (
                <div key={index}>
                  {group.title && <h3 className="g-heading mb-3 text-[24px] uppercase text-black">{group.title}</h3>}
                  <table className="w-full text-left text-[14px]">
                    <tbody>
                      {group.items.filter((item) => item.label || item.value).map((item, row) => (
                        <tr key={row} className="border-b border-neutral-200">
                          <th scope="row" className="w-1/2 py-3 pr-4 font-medium text-black">{item.label}</th>
                          <td className="py-3 text-neutral-700">{item.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-neutral-500">No specs yet.</p>
          ))}
        {tab === "In the Box" &&
          (box.length ? (
            box.some((item) => item.image) ? (
              <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                {box.map((item, index) => (
                  <li key={index} className="text-center">
                    <div className="flex aspect-square items-center justify-center bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element -- preview of unsaved upload/import paths */}
                      {item.image ? <img src={item.image} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-neutral-400">No photo</span>}
                    </div>
                    <p className="mt-2 text-[14px] text-black">{item.label}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="list-disc space-y-2 pl-5 text-[14px] text-black">
                {box.map((item, index) => <li key={index}>{item.label}</li>)}
              </ul>
            )
          ) : (
            <p className="text-[14px] text-neutral-500">Nothing listed in the box.</p>
          ))}
      </div>
    </section>
  );
}

function initialSelections(product: PreviewProduct): Record<string, string> {
  const def = product.variants.find((v) => v.isDefault) || product.variants[0];
  if (def) return { ...def.selections };
  return Object.fromEntries(product.options.filter((o) => o.values[0]).map((o) => [o.id, o.values[0].id]));
}

function PreviewBody({ product }: { product: PreviewProduct }) {
  const [selections, setSelections] = useState<Record<string, string>>(() => initialSelections(product));
  const [activeIndex, setActiveIndex] = useState(0);

  const hasVariants = product.variants.length > 0;
  const variant = hasVariants ? resolveVariant(product.variants, selections) : undefined;

  const gallery = useMemo(() => {
    const list = galleryFor(product.images, product.defaultImageId, variant);
    if (list.length) return list;
    return product.image ? [{ id: "legacy", src: product.image, alt: product.name, source: "url" as const }] : [];
  }, [product.images, product.defaultImageId, product.image, product.name, variant]);

  const current = gallery[Math.min(activeIndex, gallery.length - 1)];
  const price = variant ? variant.price : product.price;
  const compareAt = variant ? variant.originalPrice : product.originalPrice;
  const stock = variant ? variant.stock : product.stock;
  const sku = variant ? variant.sku : product.sku;

  const choose = (optionId: string, valueId: string) => {
    const next = { ...selections, [optionId]: valueId };
    let match = resolveVariant(product.variants, next);
    if (!match) {
      // Like garmin.com: jump to the closest active variant that has the clicked value.
      const candidates = product.variants.filter((v) => v.status === "active" && v.selections[optionId] === valueId);
      const score = (v: ProductVariant) => Object.entries(next).filter(([o, val]) => v.selections[o] === val).length;
      match = candidates.sort((a, b) => score(b) - score(a))[0];
    }
    setSelections(match ? { ...match.selections } : next);
    setActiveIndex(0);
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
      {/* Gallery */}
      <div className="flex gap-4">
        {gallery.length > 1 && (
          <ul className="flex max-h-[520px] w-16 shrink-0 flex-col gap-2 overflow-y-auto">
            {gallery.map((img, i) => (
              <li key={img.id}>
                <button
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === activeIndex}
                  className={`block h-16 w-16 border bg-white ${i === activeIndex ? "border-black" : "border-neutral-200"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- preview of unsaved upload/import paths */}
                  <img src={img.src} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relative flex-1">
          <div className="relative flex aspect-square w-full items-center justify-center bg-white">
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of unsaved upload/import paths
              <img src={current.src} alt={current.alt || product.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[13px] text-muted-foreground">No photo</span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
              <button
                type="button"
                onClick={() => setActiveIndex((i) => (i - 1 + gallery.length) % gallery.length)}
                aria-label="Previous photo"
                className="grid h-9 w-9 place-items-center bg-white/80 hover:bg-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((i) => (i + 1) % gallery.length)}
                aria-label="Next photo"
                className="grid h-9 w-9 place-items-center bg-white/80 hover:bg-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div>
        {product.badge && product.badge !== "NONE" && (
          <div className="mb-2">
            <GarminBadge badge={product.badge} variant="pill" />
          </div>
        )}
        <h1 className="g-heading text-[32px] leading-tight text-black">{product.name || "Untitled product"}</h1>
        {variant && <p className="mt-2 text-[16px] text-neutral-700">{variant.title}</p>}
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {product.family} · Part number: <span className="tabular-nums">{sku || "—"}</span>
        </p>

        <p className="mt-4 text-xl font-bold leading-6 tabular-nums text-black">
          {formatKzt(price)}
          {compareAt !== undefined && price !== null && compareAt > price && (
            <span className="ml-3 text-sm font-normal text-muted-foreground line-through">{formatKzt(compareAt)}</span>
          )}
          {product.priceSuffix && <span className="ml-2 text-sm font-normal text-muted-foreground">{product.priceSuffix}</span>}
        </p>

        {product.options.map((option) => {
          const available = hasVariants ? availableValueIds(product.variants, selections, option.id) : null;
          const selectedId = selections[option.id];
          const selectedLabel = option.values.find((v) => v.id === selectedId)?.label;
          return (
            <div key={option.id} className="mt-6">
              <p className="text-sm font-medium text-black">
                {option.name}
                {selectedLabel && <span className="font-normal text-neutral-600">: {selectedLabel}</span>}
              </p>
              {option.display === "dropdown" ? (
                <select
                  value={selectedId || ""}
                  onChange={(e) => choose(option.id, e.target.value)}
                  aria-label={option.name}
                  className="mt-2 h-10 min-w-[220px] border border-border bg-white px-3 text-sm focus:border-black focus:outline-none"
                >
                  {option.values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                      {available && !available.has(v.id) ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={option.name}>
                  {option.values.map((v) => {
                    const isSelected = v.id === selectedId;
                    const isAvailable = !available || available.has(v.id);
                    if (option.display === "swatch") {
                      return (
                        <button
                          key={v.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={`${v.label}${isAvailable ? "" : " (unavailable)"}`}
                          title={v.label}
                          onClick={() => choose(option.id, v.id)}
                          className={`relative h-10 w-10 overflow-hidden rounded-garmin-pill border-2 p-0.5 ${
                            isSelected ? "border-black" : "border-transparent hover:border-neutral-400"
                          } ${isAvailable ? "" : "opacity-40"}`}
                        >
                          {v.swatchImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- swatch preview
                            <img src={v.swatchImage} alt="" className="h-full w-full rounded-garmin-pill object-cover" />
                          ) : (
                            <svg viewBox="0 0 1 1" className="h-full w-full rounded-garmin-pill" aria-hidden="true">
                              <rect width="1" height="1" fill={v.swatchColor || "#d4d4d4"} />
                            </svg>
                          )}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => choose(option.id, v.id)}
                        className={`border px-4 py-2 text-[13px] transition-colors ${
                          isSelected
                            ? "border-black bg-black text-white"
                            : "border-border bg-white text-black hover:border-black"
                        } ${isAvailable ? "" : "text-muted-foreground line-through"}`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {hasVariants && !variant && (
          <p className="mt-4 text-[13px] text-garmin-error">This combination is not available.</p>
        )}

        <p className="mt-6 text-sm text-neutral-700">
          {stock > 0 ? "Available to ship in 1–3 business days." : "Currently out of stock."}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" disabled={stock <= 0} className="g-btn bg-[#5bc2e7] text-black disabled:opacity-50">
            Add to Cart
          </button>
        </div>
        {product.description && (
          <p className="mt-6 line-clamp-4 text-sm leading-relaxed text-neutral-700">{product.description}</p>
        )}
      </div>
    </div>
  );
}
