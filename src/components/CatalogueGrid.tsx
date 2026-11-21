"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Product } from "@/types";
import type { CatalogSortKey } from "@/contracts/catalog-browse";
import { ProductCard } from "@/components/ProductCard";
import { ChevronRightIcon } from "@/components/icons";

/** A facet of the left rail; `count` is omitted where the source cannot count (legacy JSON storefront). */
export interface CatalogueFacet {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number; checked: boolean }[];
}

/** URL parameters owned by the rail; any other parameter (sort, search) is kept when a facet changes. */
const FACET_KEYS = ["series", "activities", "levels", "caseSizes", "prices", "availability"];
const RESET_KEYS = ["page", "cursor", "all"];

/** A collapsible facet; while collapsed only its checked options (`collapsed`) stay visible, as on garmin.com. */
function FilterAccordion({ id, title, defaultOpen, collapsed, children }: { id: string; title: string; defaultOpen: boolean; collapsed: React.ReactNode[]; children: React.ReactNode[] }) {
  const [open, setOpen] = useState(defaultOpen);
  const visible = open ? children : collapsed;
  return (
    <div className="border-b border-neutral-200 py-4">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-[15px] font-medium text-black">{title}</span>
        <ChevronRightIcon className={`h-4 w-4 text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {visible.length > 0 && <div id={id} role="group" aria-label={title} className="mt-3 space-y-2.5">{visible}</div>}
    </div>
  );
}

function Check({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-[14px] ${checked ? "font-semibold text-black" : "text-neutral-700"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 shrink-0 rounded-none accent-black" />
      <span>{label}</span>
      {count !== undefined && <span className="font-normal text-neutral-500">({count})</span>}
    </label>
  );
}

export function CatalogueGrid({
  products, facets, sort, sortOptions, total, hasPreset = false,
}: {
  products: Product[];
  facets: CatalogueFacet[];
  sort: CatalogSortKey;
  sortOptions: readonly { value: CatalogSortKey; label: string }[];
  total?: number;
  /** The page pre-checks facets from a garmin.com URL preset: an emptied rail must stay explicit. */
  hasPreset?: boolean;
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();

  function navigate(next: URLSearchParams) {
    const text = next.toString();
    router.push(text ? `${pathname}?${text}` : pathname);
  }
  // The rail's checked state comes from the server (it includes presets), so every change rewrites all facets.
  function toggle(facetKey: string, value: string) {
    const next = new URLSearchParams(params.toString());
    for (const key of [...FACET_KEYS, ...RESET_KEYS]) next.delete(key);
    for (const facet of facets) {
      const values = new Set(facet.options.filter(o => o.checked).map(o => o.value));
      if (facet.key === facetKey) { if (values.has(value)) values.delete(value); else values.add(value); }
      for (const v of values) next.append(facet.key, v);
    }
    if (hasPreset && !FACET_KEYS.some(key => next.has(key))) next.set("all", "1");
    navigate(next);
  }
  function setSort(value: CatalogSortKey) {
    const next = new URLSearchParams(params.toString());
    next.delete("page"); next.delete("cursor");
    if (value === "featured") next.delete("sort"); else next.set("sort", value);
    navigate(next);
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-4 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-[240px]" aria-label="Filters">
        <a href="/compare" className="g-btn g-btn--solid w-full">Compare</a>
        {facets.length > 0 && (
          <div className="mt-4">
            {facets.map((facet, index) => {
              const checks = facet.options.map(option => (
                <Check key={option.value} label={option.label} count={option.count} checked={option.checked} onChange={() => toggle(facet.key, option.value)} />
              ));
              return (
                <FilterAccordion key={facet.key} id={`facet-${facet.key}`} title={facet.label} defaultOpen={index < 2 || facet.options.some(o => o.checked)}
                  collapsed={checks.filter((_, i) => facet.options[i].checked)}>
                  {checks}
                </FilterAccordion>
              );
            })}
          </div>
        )}
      </aside>

      <div className="flex-1">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-neutral-600" aria-live="polite">{total !== undefined ? `${total} ${total === 1 ? "result" : "results"}` : ""}</p>
          <div className="flex items-center gap-3">
            <label htmlFor="sort" className="text-[14px] text-neutral-700">Sort By</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as CatalogSortKey)}
              className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-[14px] text-black outline-none focus-visible:border-black">
              {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {products.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">No products match your filters.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
