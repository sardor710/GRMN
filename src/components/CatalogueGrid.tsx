"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Product } from "@/types";
import { activityFilters, caseSizeFilters, levelFilters, filterLabelKey } from "@/lib/catalog-constants";
import type { CatalogSortKey } from "@/contracts/catalog-browse";
import { ProductCard } from "@/components/ProductCard";
import { CompareBar, type CompareBarSearch } from "@/components/CompareBar";
import { CATALOGUE_COMPARE_PARAM, CATALOGUE_COMPARE_SEARCH_PARAM } from "@/lib/compare/compare-items";
import { COMPARE_LIMIT_NOTE_ID, hasProduct, isSelectionFull, toggleProduct } from "@/lib/compare/selection";
import { useCompareSelection } from "@/lib/compare/use-compare-selection";

/** A facet of the left rail; `count` is omitted where the source cannot count (legacy JSON storefront). */
export interface CatalogueFacet {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number; checked: boolean }[];
}

/** URL parameters owned by the rail; any other parameter (sort, search, compare) is kept when a facet changes. */
const FACET_KEYS = ["series", "activities", "levels", "caseSizes", "prices", "availability"];
const RESET_KEYS = ["page", "cursor", "all"];

/**
 * Message keys in the `CatalogueGrid` namespace for the server's sort keys, in garmin.com's order
 * (SideFilterMenu.spec.md): Featured (our Newest), A to Z, Z to A, then the two price sorts.
 */
const SORT_LABELS: Record<CatalogSortKey, string> = {
  featured: "sort.featured",
  "name-asc": "sort.name",
  "name-desc": "sort.nameDesc",
  "price-asc": "sort.priceAsc",
  "price-desc": "sort.priceDesc",
};

/** Facet titles (`CatalogueGrid.*`); a facet without one shows the server's label. */
const FACET_TITLES: Record<string, string> = {
  activities: "activity",
  levels: "level",
  caseSizes: "caseSize",
  series: "groups.series",
  prices: "facets.price",
  availability: "facets.availability",
};

/** Price bucket values (src/lib/catalog-facets.ts PRICE_BUCKETS) and their `CatalogueGrid.prices.*` messages. */
const PRICE_LABELS: Record<string, string> = {
  "0-100000": "prices.under100k",
  "100000-250000": "prices.from100k",
  "250000-500000": "prices.from250k",
  "500000-750000": "prices.from500k",
  "750000-": "prices.over750k",
};

/** garmin.com filter caret (12x8): points down when collapsed, up when expanded. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 18.2 11.2" aria-hidden="true" className={`h-2 w-3 shrink-0 fill-black ${open ? "rotate-180" : ""}`}>
      <path d="M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z" />
    </svg>
  );
}

/**
 * One filter group (SideFilterMenu.spec.md): 53px header row, 14/21 700 title, options on a 38px pitch, 1px #D9D9D9
 * rule. While collapsed only its checked options (`collapsed`) stay visible, as on garmin.com.
 */
function FilterAccordion({ id, title, defaultOpen, collapsed, children }: { id: string; title: string; defaultOpen: boolean; collapsed: React.ReactNode[]; children: React.ReactNode[] }) {
  const [open, setOpen] = useState(defaultOpen);
  const visible = open ? children : collapsed;
  return (
    <div className="border-b border-garmin-control">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between py-4 text-left text-[14px] font-bold leading-[21px] text-black"
      >
        {title}
        <Caret open={open} />
      </button>
      {visible.length > 0 && <div id={id} role="group" aria-label={title}>{visible}</div>}
    </div>
  );
}

function Check({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="g-checkbox-label mb-4 min-h-[21.8px] cursor-pointer pt-[0.8px] pr-2 has-[:checked]:font-bold">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="g-checkbox"
      />
      {label}
      {count !== undefined && <span className="ml-1 font-normal text-garmin-text-muted">({count})</span>}
    </label>
  );
}

/** The rail's toggle in compare mode carries garmin.com's 20px close mark after the label. */
function CloseMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="ml-4 size-5 shrink-0 stroke-current" fill="none" strokeWidth={2}>
      <path d="M4 4l12 12M16 4L4 16" />
    </svg>
  );
}

/** Sorts offered when the page passes none, in garmin.com's order. */
const DEFAULT_SORT_OPTIONS = (Object.keys(SORT_LABELS) as CatalogSortKey[]).map((value) => ({ value, label: value }));

export function CatalogueGrid({
  products, facets = [], sort = "featured", sortOptions = DEFAULT_SORT_OPTIONS, total, hasPreset = false, compareSearch = null,
}: {
  products: Product[];
  facets?: CatalogueFacet[];
  sort?: CatalogSortKey;
  sortOptions?: readonly { value: CatalogSortKey; label: string }[];
  total?: number;
  /** The page pre-checks facets from a garmin.com URL preset: an emptied rail must stay explicit. */
  hasPreset?: boolean;
  compareSearch?: CompareBarSearch | null;
}) {
  const t = useTranslations("CatalogueGrid");
  const tk = useTranslations();
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
      const values = new Set(facet.options.filter((o) => o.checked).map((o) => o.value));
      if (facet.key === facetKey) { if (values.has(value)) values.delete(value); else values.add(value); }
      for (const v of values) next.append(facet.key, v);
    }
    if (hasPreset && !FACET_KEYS.some((key) => next.has(key))) next.set("all", "1");
    navigate(next);
  }
  function clearAll() {
    const next = new URLSearchParams(params.toString());
    for (const key of [...FACET_KEYS, ...RESET_KEYS]) next.delete(key);
    if (hasPreset) next.set("all", "1");
    navigate(next);
  }
  function setSort(value: CatalogSortKey) {
    const next = new URLSearchParams(params.toString());
    next.delete("page"); next.delete("cursor");
    if (value === "featured") next.delete("sort"); else next.set("sort", value);
    navigate(next);
  }
  const activeCount = facets.reduce((sum, facet) => sum + facet.options.filter((o) => o.checked).length, 0);
  const facetTitle = (facet: CatalogueFacet) => (FACET_TITLES[facet.key] ? t(FACET_TITLES[facet.key]) : facet.label);
  // Option values are English data (src/lib/catalog-facets.ts); known ones are shown in the page language.
  const optionLabel = (facet: CatalogueFacet, option: CatalogueFacet["options"][number]) => {
    const byLabel = (list: typeof activityFilters) => filterLabelKey(list, option.label) ?? filterLabelKey(list, option.value)
      ?? list.find((f) => f.value.toLowerCase() === option.value.toLowerCase())?.labelKey;
    const key =
      facet.key === "activities" ? byLabel(activityFilters)
      : facet.key === "levels" ? byLabel(levelFilters)
      : facet.key === "caseSizes" ? (option.value === "Youth" ? filterLabelKey(levelFilters, "Youth") : byLabel(caseSizeFilters))
      : facet.key === "prices" && PRICE_LABELS[option.value] ? `CatalogueGrid.${PRICE_LABELS[option.value]}`
      : facet.key === "availability" ? "CatalogueGrid.facets.inStock"
      : undefined;
    return key ? tk(key) : option.label;
  };
  // Task C-c: Garmin's compare mode lives in the URL (`compare=1`); the chosen products live in localStorage.
  const compareMode = params.get(CATALOGUE_COMPARE_PARAM) === "1";
  const { items: compareItems, update: updateCompare } = useCompareSelection();
  const barShown = compareMode || compareItems.length > 0;
  // Card toggles let the bar's live status speak (never on page load).
  const [cardActed, setCardActed] = useState(false);
  const compareFull = isSelectionFull(compareItems);
  const toggleCompareMode = () => {
    const next = new URLSearchParams(params.toString());
    if (compareMode) {
      next.delete(CATALOGUE_COMPARE_PARAM);
      next.delete(CATALOGUE_COMPARE_SEARCH_PARAM);
    } else next.set(CATALOGUE_COMPARE_PARAM, "1");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const compareToggle = (
    <button
      type="button"
      aria-pressed={compareMode}
      onClick={toggleCompareMode}
      className={`g-btn g-btn--lg ${compareMode ? "g-btn--secondary" : "g-btn--black"}`}
    >
      {t("compare")}
      {compareMode && <CloseMark />}
    </button>
  );
  // Below 1024px garmin.com folds the filters and the sort into one "Filter and Sort" bar.
  const [mobileOpen, setMobileOpen] = useState(false);
  const sortSelectOptions = sortOptions.map((o) => (
    <option key={o.value} value={o.value}>
      {SORT_LABELS[o.value] ? t(SORT_LABELS[o.value]) : o.label}
    </option>
  ));

  return (
    <div className="flex flex-col">
    <CompareBar items={compareItems} onChange={updateCompare} products={products} search={compareSearch} compareMode={compareMode} announce={cardActed} />
    <div className="flex flex-col lg:flex-row lg:items-start">
      {/* Side filter rail (SideFilterMenu.spec.md): 315px, sticky full height, 1px #D9D9D9 right border; it sticks
          under the 87px compare bar while that is shown (garmin.com moves it down the same way). */}
      <aside
        data-filter-rail
        aria-label={t("filters")}
        className={`flex w-full shrink-0 flex-col border-b border-garmin-control text-[14px] leading-[21px] text-black lg:sticky lg:w-[315px] lg:border-r lg:border-b-0 ${barShown ? "lg:top-[87px] lg:h-[calc(100vh-87px)]" : "lg:top-0 lg:h-screen"}`}
      >
        <div className="hidden border-b border-garmin-control lg:block">
          <div className="mt-4 pb-4 pl-4">
            {compareToggle}
          </div>
        </div>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="catalogue-filters"
          onClick={() => setMobileOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-[14px] text-left text-[16px] font-bold uppercase leading-[24px] text-black lg:hidden"
        >
          {t("filterAndSort")}
          <span className="mr-[3.5px]"><Caret open={mobileOpen} /></span>
        </button>
        <div
          id="catalogue-filters"
          className={`${mobileOpen ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 lg:block`}
        >
          <div className="pt-2 lg:hidden">
            <label htmlFor="sort-mobile" className="block p-[.25em] text-[14px] font-bold">
              {t("sortBy")}
            </label>
            <select
              id="sort-mobile"
              value={sort}
              onChange={(e) => setSort(e.target.value as CatalogSortKey)}
              className="g-select"
            >
              {sortSelectOptions}
            </select>
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="g-btn g-btn--text-link py-2 text-[14px]"
            >
              {t("clearAll", { count: activeCount })}
            </button>
          )}
          {facets.map((facet, index) => {
            const checks = facet.options.map((option) => (
              <Check key={option.value} label={optionLabel(facet, option)} count={option.count} checked={option.checked} onChange={() => toggle(facet.key, option.value)} />
            ));
            return (
              <FilterAccordion key={facet.key} id={`facet-${facet.key}`} title={facetTitle(facet)} defaultOpen={index < 2 || facet.options.some((o) => o.checked)}
                collapsed={checks.filter((_, i) => facet.options[i].checked)}>
                {checks}
              </FilterAccordion>
            );
          })}
        </div>
      </aside>
      <div className="mx-4 mt-4 lg:hidden">{compareToggle}</div>

      {/* Grid */}
      <div className="min-w-0 flex-1">
        <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 px-4">
          <p className="text-[14px] leading-[21px] text-black" aria-live="polite">{total !== undefined ? t("results", { count: total }) : ""}</p>
          <div className="hidden items-center lg:flex">
            <label htmlFor="sort" className="mr-[14.4px] text-[14.4px] font-bold leading-[21.6px] text-black">
              {t("sortBy")}
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as CatalogSortKey)}
              className="g-select my-[4.8px] w-[270px] leading-[18.4px]"
            >
              {sortSelectOptions}
            </select>
          </div>
        </div>

        {products.length === 0 ? (
          <p className="py-16 text-center text-[16px] leading-[24px] text-black">{t("empty")}</p>
        ) : (
          /* ProductCard.spec.md grid: 1 column <480, 2 at calc(50% - .5rem), 3 at calc(33.33% - 1.35em) from 1200; 16px gutters */
          <div className="flex flex-wrap justify-between gap-y-4 px-4 pt-4 min-[1200px]:justify-start min-[1200px]:gap-y-0 min-[1200px]:px-0 min-[1200px]:pt-0">
            {products.map((p) => (
              <div key={p.id} className="w-full min-[480px]:w-[calc(50%-.5rem)] min-[1200px]:mt-4 min-[1200px]:ml-4 min-[1200px]:w-[calc(33.3333%-1.35em)]">
                <ProductCard
                  product={p}
                  compare={
                    compareMode
                      ? {
                          selected: hasProduct(compareItems, p.id),
                          blocked: compareFull && !hasProduct(compareItems, p.id),
                          onToggle: () => { setCardActed(true); updateCompare((items) => toggleProduct(items, { productId: p.id, name: p.name, image: p.image })); },
                          describedBy: COMPARE_LIMIT_NOTE_ID,
                        }
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
