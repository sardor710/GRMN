"use client";

import { useMemo, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { TaxonomyTree, expandedForKeys } from "@/components/admin/catalog/TaxonomyTree";
import { useTaxonomy } from "@/components/admin/catalog/useTaxonomy";
import { Button } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import {
  TAXONOMY_SECTIONS,
  buildTaxonomyTree,
  categoryPath,
  setPrimaryCategory,
  taxonomyIndex,
  toggleCategory,
  type CategoryRef,
} from "@/lib/admin/taxonomy-tree";
import { inputClass } from "./shared";

// Categories (plan M3.3): a searchable tree with checkboxes, exactly one primary (star), selected chips on
// top; catalog, accessory and group kinds in separate panels. Saved to product_categories.
export function CategoryPicker({ value, onChange }: { value: CategoryRef[]; onChange: (next: CategoryRef[]) => void }) {
  const { nodes, error, loading, retry } = useTaxonomy();
  const [query, setQuery] = useState("");
  const index = useMemo(() => taxonomyIndex(nodes ?? []), [nodes]);
  const tree = useMemo(() => buildTaxonomyTree(nodes ?? []), [nodes]);
  const selected = useMemo(() => new Map(value.map((item) => [item.key, item.primary])), [value]);
  const startExpanded = useMemo(() => expandedForKeys(nodes ?? [], value.map((item) => item.key)), [nodes, value]);
  const kindOf = (key: string) => index.get(key)?.kind;

  return (
    <div className="space-y-3">
      <div className="min-h-[40px] border border-[#d9d9d9] bg-white p-2" aria-live="polite">
        {value.length === 0 ? (
          <p className="px-1 py-1 text-[13px] text-[#666]">No category yet. Tick every category page the product should appear on; the starred one drives breadcrumbs.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected categories">
            {value.map((item) => (
              <li
                key={item.key}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 border py-0.5 pl-2 pr-0.5 text-[12px]",
                  item.primary ? "border-black bg-black text-white" : "border-[#d9d9d9] bg-[#f5f5f5] text-black",
                )}
              >
                {item.primary && <Star className="h-3 w-3 shrink-0 fill-[#f0b800] text-[#f0b800]" aria-label="Primary" />}
                <span className="truncate" title={categoryPath(index, item.key)}>
                  {categoryPath(index, item.key)}
                  {kindOf(item.key) === "group" && <span className={item.primary ? "text-white/70" : "text-[#666]"}> · group</span>}
                </span>
                {!item.primary && (
                  <button
                    type="button"
                    onClick={() => onChange(setPrimaryCategory(value, item.key))}
                    className="px-1 text-[11px] text-[#106fad] hover:underline"
                    aria-label={`Make ${index.get(item.key)?.name ?? item.key} primary`}
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChange(toggleCategory(value, item.key))}
                  className={cn("grid h-6 w-6 place-items-center", item.primary ? "hover:bg-white/15" : "hover:bg-[#e5e5e5]")}
                  aria-label={`Remove ${index.get(item.key)?.name ?? item.key}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#808080]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search categories (e.g. running, QuickFit 22)"
          aria-label="Search categories"
          className={cn(inputClass, "h-10 pl-9")}
        />
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 border border-[#c20f2f] bg-[#fdf2f4] px-3 py-2 text-[13px] text-[#8a0b21]">
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>
        </div>
      ) : loading ? (
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]" aria-busy="true" aria-label="Loading categories">
          {[0, 1].map((i) => (
            <div key={i} className="h-64 animate-pulse border border-[#e5e5e5] bg-[#f5f5f5]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          {(["catalog", "side"] as const).map((column) => (
            <div key={column} className="space-y-3">
              {TAXONOMY_SECTIONS.filter((section) => (column === "catalog" ? section.kind === "catalog" : section.kind !== "catalog")).map((section) => {
                const count = value.filter((item) => kindOf(item.key) === section.kind).length;
                return (
                  <section key={section.kind} aria-label={section.title} className="border border-[#d9d9d9] bg-white">
                    <h4 className="flex items-center justify-between border-b border-[#e5e5e5] px-3 py-2 text-[12px] font-bold uppercase tracking-[0.04em] text-black">
                      {section.title}
                      {count > 0 && <span className="font-normal normal-case tracking-normal text-[#666]">{count} selected</span>}
                    </h4>
                    <div className={cn("overflow-y-auto", section.kind === "catalog" ? "max-h-[420px]" : "max-h-[200px]")}>
                      <TaxonomyTree
                        mode="multi"
                        roots={tree[section.kind]}
                        query={query}
                        initiallyExpanded={startExpanded}
                        selected={selected}
                        onToggle={(key) => onChange(toggleCategory(value, key))}
                        onPrimary={(key) => onChange(setPrimaryCategory(value, key))}
                      />
                    </div>
                  </section>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
