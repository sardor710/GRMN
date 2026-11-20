"use client";

import { useState } from "react";
import {useRouter,usePathname,useSearchParams} from "next/navigation";
import { useTranslations } from "next-intl";
import type { Product } from "@/types";
import { activityFilters, levelFilters, caseSizeFilters } from "@/lib/catalog-constants";
import { ProductCard } from "@/components/ProductCard";
import { ChevronRightIcon } from "@/components/icons";
import { useLocalizeHref } from "@/i18n/useLocalizeHref";

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

/** Message keys in the `CatalogueGrid` namespace. */
const sortLabels: Record<SortKey, string> = {
  featured: "sort.featured",
  "price-asc": "sort.priceAsc",
  "price-desc": "sort.priceDesc",
  name: "sort.name",
};

const collapsedGroups = ["groups.battery", "groups.hardware", "groups.connectivity", "groups.series", "groups.otherDevices"];

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
    <div className="border-b border-neutral-200 py-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[15px] font-medium text-black">{title}</span>
        <ChevronRightIcon
          className={`h-4 w-4 text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && children && <div className="mt-3 space-y-2.5">{children}</div>}
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
    <label className="flex cursor-pointer items-center gap-2 text-[14px] text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-black"
      />
      {label}
    </label>
  );
}

export function CatalogueGrid({ products }: { products: Product[] }) {
  const t = useTranslations("CatalogueGrid");
  const tk = useTranslations();
  const localize = useLocalizeHref();
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

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-4 lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full shrink-0 lg:w-[240px]">
        <a href={localize("/compare")} className="g-btn g-btn--black w-full">{t("compare")}</a>
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="mt-3 text-[13px] text-[#007cc3] underline"
          >
            {t("clearAll", { count: activeCount })}
          </button>
        )}
        <div className="mt-4">
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

      {/* Grid */}
      <div className="flex-1">
        <div className="mb-6 flex items-center justify-end gap-3">
          <label htmlFor="sort" className="text-[14px] text-neutral-700">
            {t("sortBy")}
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 border border-neutral-300 bg-white px-3 text-[14px] text-black outline-none"
          >
            {(Object.keys(sortLabels) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {t(sortLabels[k])}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
