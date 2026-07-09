"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/types";
import { activityFilters, levelFilters, caseSizeFilters } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { ChevronRightIcon } from "@/components/icons";

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

const sortLabels: Record<SortKey, string> = {
  featured: "Featured Products",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  name: "Name: A to Z",
};

const collapsedGroups = [
  "Battery Life in Smartwatch Mode",
  "Hardware",
  "Connectivity",
  "Series",
  "Other Devices",
];

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
  const [activities, setActivities] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Set<string>>(new Set());
  const [sizes, setSizes] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("featured");

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  };

  const filtered = useMemo(() => {
    let out = products.filter((p) => {
      if (activities.size && !p.activities.some((a) => activities.has(a))) return false;
      if (levels.size && !levels.has(p.level)) return false;
      if (sizes.size && !sizes.has(p.caseSize)) return false;
      return true;
    });
    out = [...out];
    if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
    else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [products, activities, levels, sizes, sort]);

  const clearAll = () => {
    setActivities(new Set());
    setLevels(new Set());
    setSizes(new Set());
  };
  const activeCount = activities.size + levels.size + sizes.size;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-4 lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full shrink-0 lg:w-[240px]">
        <button className="g-btn g-btn--solid w-full">Compare</button>
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="mt-3 text-[13px] text-[#007cc3] underline"
          >
            Clear all filters ({activeCount})
          </button>
        )}
        <div className="mt-4">
          <FilterAccordion title="Activity" defaultOpen>
            {activityFilters.map((a) => (
              <Check
                key={a}
                label={a}
                checked={activities.has(a)}
                onChange={() => toggle(activities, a, setActivities)}
              />
            ))}
          </FilterAccordion>
          <FilterAccordion title="Level">
            {levelFilters.map((l) => (
              <Check
                key={l}
                label={l}
                checked={levels.has(l)}
                onChange={() => toggle(levels, l, setLevels)}
              />
            ))}
          </FilterAccordion>
          <FilterAccordion title="Case Size">
            {caseSizeFilters.map((c) => (
              <Check
                key={c.value}
                label={c.label}
                checked={sizes.has(c.value)}
                onChange={() => toggle(sizes, c.value, setSizes)}
              />
            ))}
          </FilterAccordion>
          {collapsedGroups.map((g) => (
            <FilterAccordion key={g} title={g} />
          ))}
        </div>
      </aside>

      {/* Grid */}
      <div className="flex-1">
        <div className="mb-6 flex items-center justify-end gap-3">
          <label htmlFor="sort" className="text-[14px] text-neutral-700">
            Sort By
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 border border-neutral-300 bg-white px-3 text-[14px] text-black outline-none"
          >
            {(Object.keys(sortLabels) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {sortLabels[k]}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">No products match your filters.</p>
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
