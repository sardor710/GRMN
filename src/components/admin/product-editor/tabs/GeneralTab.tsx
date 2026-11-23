"use client";

import { useMemo } from "react";
import type { CMSProduct, ProductBadgeOption, ProductStatus } from "@/lib/cms/types";
import { Button, Select, StatusSelect } from "@/components/admin/ui";
import { useTaxonomy } from "@/components/admin/catalog/useTaxonomy";
import { cn } from "@/lib/utils";
import { CategoryPicker } from "../CategoryPicker";
import { withSeries } from "../editor-state";
import { productPath } from "@/lib/catalog/product-url";
import { Field, Section } from "../Field";
import { formatKzt, inputClass } from "../shared";
import type { EditorTab, ProductEditorState } from "../useProductEditorState";

const BADGES: ProductBadgeOption[] = ["NONE", "NEW", "SALE", "BEST SELLER", "LIMITED EDITION", "CARBON EDITION", "GARMIN SIGNATURE", "EXCLUSIVE", "POPULAR", "CUSTOMIZABLE"];
const ACTIVITIES = ["Running", "Cycling", "Swimming", "Triathlon", "Hiking", "Golfing", "Diving", "Boating", "Aviation", "Skiing", "Tactical training", "Wellness"];
export const PRODUCT_STATUSES: ProductStatus[] = ["draft", "published", "archived"];

const numberOrNull = (raw: string): number | null => (raw.trim() === "" ? null : Number(raw));
/** Storefront host for the address hint (NEXT_PUBLIC_SITE_URL is inlined at build time). */
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://garmin.tigr.uz").replace(/^https?:\/\//, "").replace(/\/+$/, "");

export function GeneralTab({ editor, skuConflicts, onOpenTab }: { editor: ProductEditorState; skuConflicts: string[]; onOpenTab: (tab: EditorTab) => void }) {
  const { form, update, base } = editor;
  const { nodes } = useTaxonomy();
  // Owner 2026-11-22: series come from Admin ▸ Categories ▸ Series, in that order.
  const series = useMemo(() => (nodes ?? []).filter((node) => node.parentKey === "watch-series").sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [nodes]);
  const seriesKeys = useMemo(() => series.map((node) => node.key), [series]);
  const currentSeries = form.categories.find((category) => seriesKeys.includes(category.key))?.key ?? "";
  const hasVariants = form.variants.length > 0;
  const skuConflict = skuConflicts.includes(form.sku.trim().toUpperCase());
  const reserved = typeof base.stockReserved === "number" ? base.stockReserved : 0;
  const prices = form.variants.map((variant) => variant.price).filter((price): price is number => price !== null && Number.isFinite(price));
  const stockSum = form.variants.filter((variant) => variant.status !== "archived").reduce((total, variant) => total + (variant.stock || 0), 0);

  return (
    <div className="space-y-8">
      <Section id="general-basics" title="Product">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" htmlFor="product-name" required className="md:col-span-2">
            <input id="product-name" value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="e.g. fēnix 8 – 47 mm, AMOLED" className={inputClass} />
          </Field>
          <Field label="Product code" htmlFor="product-code" hint={form.productCode.trim() ? `Page address: ${SITE_HOST}${productPath(form.productCode.trim())} — each variant is ${SITE_HOST}${productPath(form.productCode.trim())}/<SKU>.` : "Digits only. Leave empty on a new product to get one automatically (imported products keep their garmin.com number)."}>
            <input id="product-code" inputMode="numeric" value={form.productCode} onChange={(event) => update({ productCode: event.target.value.replace(/\s+/g, "") })} placeholder="e.g. 1953727" className={inputClass} />
          </Field>
          <Field label="Series" htmlFor="product-series" hint="Used by the Series filter on category pages. Manage the list in Categories ▸ Series.">
            <Select id="product-series" value={currentSeries} onChange={(event) => update({ categories: withSeries(form.categories, event.target.value || null, seriesKeys) })}>
              <option value="">No series</option>
              {series.map((node) => <option key={node.key} value={node.key}>{node.name}</option>)}
            </Select>
          </Field>
          <Field label="Model name" htmlFor="product-family" hint="Shown under the product title, e.g. fēnix 8 or Forerunner 970.">
            <input id="product-family" value={form.family} onChange={(event) => update({ family: event.target.value })} placeholder="e.g. fēnix 8" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status" htmlFor="product-status" hint={form.status === "published" ? "Visible in the store." : form.status === "draft" ? "Hidden until published." : "Hidden and kept for history."}>
              <StatusSelect id="product-status" value={form.status} options={PRODUCT_STATUSES} onChange={(value) => update({ status: value as ProductStatus })} />
            </Field>
            <Field label="Badge" htmlFor="product-badge">
              <Select id="product-badge" value={form.badge || "NONE"} onChange={(event) => update({ badge: event.target.value })}>
                {(BADGES.includes(form.badge as ProductBadgeOption) ? BADGES : [form.badge as ProductBadgeOption, ...BADGES]).map((badge) => (
                  <option key={badge} value={badge}>{badge === "NONE" ? "No badge" : badge}</option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-black md:col-span-2">
            <input type="checkbox" checked={form.isFeatured} onChange={(event) => update({ isFeatured: event.target.checked })} className="h-4 w-4 rounded-none accent-black" />
            Featured product (homepage collections can pick it)
          </label>
        </div>
      </Section>

      <Section id="general-price" title="Price and stock" description={hasVariants ? undefined : "Prices are in tenge (₸). Stock is the on-hand quantity at the main location; saving writes a stock movement."}>
        {hasVariants ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-[#d9d9d9] bg-[#f7f7f7] px-4 py-3 text-[13px]">
            <p>
              <strong>{form.variants.length} variants</strong> · {prices.length ? `${formatKzt(Math.min(...prices))}${Math.min(...prices) !== Math.max(...prices) ? ` – ${formatKzt(Math.max(...prices))}` : ""}` : "no prices yet"} · {stockSum} in stock. SKU, price and stock are set per variant.
            </p>
            <Button size="sm" variant="secondary" onClick={() => onOpenTab("variants")}>Edit variants</Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="SKU / part number" htmlFor="product-sku" required error={skuConflict ? "Another product already uses this SKU." : undefined}>
              <input id="product-sku" value={form.sku} onChange={(event) => update({ sku: event.target.value })} placeholder="010-02905-11" aria-invalid={skuConflict || undefined} className={cn(inputClass, "font-mono", skuConflict && "border-[#c20f2f]")} />
            </Field>
            <Field label="Price, ₸" htmlFor="product-price" required>
              <input id="product-price" type="number" inputMode="decimal" min={0} step="1" value={form.price ?? ""} onChange={(event) => update({ price: numberOrNull(event.target.value) })} className={cn(inputClass, "tabular-nums")} />
            </Field>
            <Field label="Compare-at price, ₸" htmlFor="product-compare" hint="Shown struck through when higher than the price.">
              <input id="product-compare" type="number" inputMode="decimal" min={0} step="1" value={form.originalPrice ?? ""} onChange={(event) => update({ originalPrice: numberOrNull(event.target.value) })} className={cn(inputClass, "tabular-nums")} />
            </Field>
            <Field label="Stock on hand" htmlFor="product-stock" hint={reserved > 0 ? `${reserved} reserved by open orders · ${Math.max(0, form.stock - reserved)} available` : editor.isNew ? "Opening stock for the main location." : undefined}>
              <input id="product-stock" type="number" inputMode="numeric" min={0} step="1" value={form.stock} onChange={(event) => update({ stock: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} className={cn(inputClass, "tabular-nums")} />
            </Field>
            <Field label="Price suffix" htmlFor="product-suffix" hint='Optional, e.g. "and up".'>
              <input id="product-suffix" value={form.priceSuffix} onChange={(event) => update({ priceSuffix: event.target.value })} className={inputClass} />
            </Field>
          </div>
        )}
        {hasVariants && (
          <div className="mt-4 max-w-xs">
            <Field label="Price suffix" htmlFor="product-suffix" hint='Optional, e.g. "and up".'>
              <input id="product-suffix" value={form.priceSuffix} onChange={(event) => update({ priceSuffix: event.target.value })} className={inputClass} />
            </Field>
          </div>
        )}
      </Section>

      <Section id="general-categories" title="Categories" description="The product appears on every ticked category page and its parents. The primary category drives breadcrumbs.">
        <CategoryPicker value={form.categories} onChange={(categories) => update({ categories })} />
      </Section>

      <Section id="general-description" title="Description">
        <Field label="Short description" htmlFor="product-description" hint="Shown under the price and used as the default search description.">
          <textarea id="product-description" rows={4} value={form.description} onChange={(event) => update({ description: event.target.value })} className={cn(inputClass, "h-auto py-2 leading-relaxed")} />
        </Field>
      </Section>

      <Section id="general-filters" title="Catalog filters" description="Optional facets used by catalog filters.">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-[12px] font-bold text-black">Activities</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...ACTIVITIES, ...form.activities])].map((activity) => {
                const on = form.activities.includes(activity);
                return (
                  <button
                    key={activity}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update({ activities: on ? form.activities.filter((item) => item !== activity) : [...form.activities, activity] })}
                    className={cn("h-8 border-2 px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black", on ? "border-black bg-black text-white" : "border-[#ccc] bg-white text-black hover:border-black")}
                  >
                    {activity}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Field label="Size bucket" htmlFor="product-size" hint="≤42 mm Small · 43–46 mm Medium · ≥47 mm Large">
              <Select id="product-size" value={form.caseSize} onChange={(event) => update({ caseSize: event.target.value as CMSProduct["caseSize"] })}>
                <option value="Small">Small</option>
                <option value="Medium">Medium</option>
                <option value="Large">Large</option>
              </Select>
            </Field>
            <Field label="Level" htmlFor="product-level">
              <Select id="product-level" value={form.level} onChange={(event) => update({ level: event.target.value as CMSProduct["level"] })}>
                <option value="Entry">Entry</option>
                <option value="Advanced">Advanced</option>
                <option value="Premium">Premium</option>
                <option value="Youth">Youth</option>
              </Select>
            </Field>
          </div>
        </div>
      </Section>
    </div>
  );
}
