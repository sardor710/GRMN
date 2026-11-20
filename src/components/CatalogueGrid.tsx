"use client";

import { useState } from "react";
import {useRouter,usePathname,useSearchParams} from "next/navigation";
import { useTranslations } from "next-intl";
import type { Product } from "@/types";
import { activityFilters, levelFilters, caseSizeFilters } from "@/lib/catalog-constants";
import { ProductCard } from "@/components/ProductCard";
import { CompareBar, type CompareBarSearch } from "@/components/CompareBar";
import { CATALOGUE_COMPARE_PARAM, CATALOGUE_COMPARE_SEARCH_PARAM } from "@/lib/compare/compare-items";
import { COMPARE_LIMIT_NOTE_ID, hasProduct, isSelectionFull, toggleProduct } from "@/lib/compare/selection";
import { useCompareSelection } from "@/lib/compare/use-compare-selection";

type SortKey = "featured" | "price-asc" | "price-desc" | "name" | "name-desc";

/**
 * Message keys in the `CatalogueGrid` namespace, in garmin.com's order (SideFilterMenu.spec.md): Featured (our
 * Newest), A to Z, Z to A (task C-d, `name_desc`), then the two price sorts.
 */
const sortLabels: Record<SortKey, string> = {
  featured: "sort.featured",
  name: "sort.name",
  "name-desc": "sort.nameDesc",
  "price-asc": "sort.priceAsc",
  "price-desc": "sort.priceDesc",
};

const collapsedGroups = ["groups.battery", "groups.hardware", "groups.connectivity", "groups.series", "groups.otherDevices"];

/** garmin.com filter caret (12x8): points down when collapsed, up when expanded. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 18.2 11.2" aria-hidden="true" className={`h-2 w-3 shrink-0 fill-black ${open ? "rotate-180" : ""}`}>
      <path d="M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z" />
    </svg>
  );
}

/** One filter group (SideFilterMenu.spec.md): 53px header row, 14/21 700 title, options on a 38px pitch, 1px #D9D9D9 rule. */
function FilterAccordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-garmin-control">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between py-4 text-left text-[14px] font-bold leading-[21px] text-black"
      >
        {title}
        <Caret open={open} />
      </button>
      {open && children && <div>{children}</div>}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="g-checkbox-label mb-4 min-h-[21.8px] cursor-pointer pt-[0.8px] pr-2 has-[:checked]:font-bold">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="g-checkbox"
      />
      {label}
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

export function CatalogueGrid({ products, compareSearch = null }: { products: Product[]; compareSearch?: CompareBarSearch | null }) {
  const t = useTranslations("CatalogueGrid");
  const tk = useTranslations();
  const router=useRouter(),pathname=usePathname(),params=useSearchParams();
  const activities=new Set(params.getAll("activities")),levels=new Set(params.getAll("levels")),sizes=new Set(params.getAll("caseSizes"));
  const sort=(params.get("sort")??"featured") as SortKey;
  function update(name:string,values:string[]){const next=new URLSearchParams(params.toString());next.delete("cursor");next.delete(name);values.forEach(value=>next.append(name,value));router.push(pathname+"?"+next.toString());}
  const setActivities=(values:Set<string>)=>update("activities",[...values]);
  const setLevels=(values:Set<string>)=>update("levels",[...values]);
  const setSizes=(values:Set<string>)=>update("caseSizes",[...values]);
  const setSort=(value:SortKey)=>update("sort",[value]);
  const toggle=(set:Set<string>,value:string,setter:(v:Set<string>)=>void)=>{const next=new Set(set);if(next.has(value))next.delete(value);else next.add(value);setter(next);};
  const filtered=products;
  const clearAll=()=>{const next=new URLSearchParams(params.toString());["activities","levels","caseSizes","cursor"].forEach(name=>next.delete(name));router.push(pathname+"?"+next.toString());};
  const activeCount = activities.size + levels.size + sizes.size;
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
  const sortOptions = (Object.keys(sortLabels) as SortKey[]).map((k) => (
    <option key={k} value={k}>
      {t(sortLabels[k])}
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
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="g-select"
            >
              {sortOptions}
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
          <FilterAccordion title={t("activity")} defaultOpen>
            {activityFilters.map((a) => (
              <Check
                key={a.value}
                label={tk(a.labelKey)}
                checked={activities.has(a.value)}
                onChange={() => toggle(activities, a.value, setActivities)}
              />
            ))}
          </FilterAccordion>
          <FilterAccordion title={t("level")}>
            {levelFilters.map((l) => (
              <Check
                key={l.value}
                label={tk(l.labelKey)}
                checked={levels.has(l.value)}
                onChange={() => toggle(levels, l.value, setLevels)}
              />
            ))}
          </FilterAccordion>
          <FilterAccordion title={t("caseSize")}>
            {caseSizeFilters.map((c) => (
              <Check
                key={c.value}
                label={tk(c.labelKey)}
                checked={sizes.has(c.value)}
                onChange={() => toggle(sizes, c.value, setSizes)}
              />
            ))}
          </FilterAccordion>
          {collapsedGroups.map((g) => (
            <FilterAccordion key={g} title={t(g)} />
          ))}
        </div>
      </aside>
      <div className="mx-4 mt-4 lg:hidden">{compareToggle}</div>

      {/* Grid */}
      <div className="min-w-0 flex-1">
        <div className="hidden h-[58px] items-center justify-end px-4 lg:flex">
          <label htmlFor="sort" className="mr-[14.4px] text-[14.4px] font-bold leading-[21.6px] text-black">
            {t("sortBy")}
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="g-select my-[4.8px] w-[270px] leading-[18.4px]"
          >
            {sortOptions}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-[16px] leading-[24px] text-black">{t("empty")}</p>
        ) : (
          /* ProductCard.spec.md grid: 1 column <480, 2 at calc(50% - .5rem), 3 at calc(33.33% - 1.35em) from 1200; 16px gutters */
          <div className="flex flex-wrap justify-between gap-y-4 px-4 pt-4 min-[1200px]:justify-start min-[1200px]:gap-y-0 min-[1200px]:px-0 min-[1200px]:pt-0">
            {filtered.map((p) => (
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
