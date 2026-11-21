"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { GarminChevron } from "@/components/admin/ui";
import { controlRadius } from "@/components/admin/ui/shape";
import { cn } from "@/lib/utils";
import { TAXONOMY_SECTIONS, buildTaxonomyTree, categoryPath, taxonomyIndex } from "@/lib/admin/taxonomy-tree";
import { TaxonomyTree, expandedForKeys } from "./TaxonomyTree";
import { useTaxonomy } from "./useTaxonomy";

// List filter: pick one category (its descendants are included by the API) from a searchable tree.
// Looks like the Garmin select; opens a popover with the three taxonomy sections.
export function CategoryFilter({ value, onChange, className }: { value: string; onChange: (key: string) => void; className?: string }) {
  const { nodes, error, loading, retry } = useTaxonomy();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const index = useMemo(() => taxonomyIndex(nodes ?? []), [nodes]);
  const tree = useMemo(() => buildTaxonomyTree(nodes ?? []), [nodes]);
  const expanded = useMemo(() => expandedForKeys(nodes ?? [], value ? [value] : []), [nodes, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const label = value ? index.get(value)?.name ?? value : "All categories";
  const pick = (key: string) => { onChange(key); setOpen(false); setQuery(""); };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
        title={value ? categoryPath(index, value) : undefined}
        className={cn(
          "relative flex h-10 w-full items-center border bg-white pl-3 pr-10 text-left text-[13px] text-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
          open ? "border-black" : "border-[#d9d9d9] hover:border-[#737373]",
          controlRadius,
        )}
      >
        <span className="truncate"><span className="sr-only">Category: </span>{label}</span>
        <GarminChevron className="pointer-events-none absolute right-3.5 h-3 w-3" />
      </button>
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear category filter" className="absolute right-8 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-[#666] hover:text-black">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {open && (
        <div id={panelId} role="dialog" aria-label="Choose a category" className="absolute left-0 top-full z-40 mt-1 w-[min(92vw,380px)] border border-black bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <div className="relative border-b border-[#e5e5e5] p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#808080]" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search categories"
              aria-label="Search categories"
              className="h-9 w-full border border-[#d9d9d9] pl-8 pr-2 text-[13px] focus:border-black focus:outline-none"
            />
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            <button type="button" onClick={() => pick("")} className={cn("block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f5f5f5]", !value && "font-bold")}>
              All categories
            </button>
            {error ? (
              <p className="px-3 py-2 text-[13px] text-[#c20f2f]">{error} <button type="button" className="underline" onClick={retry}>Retry</button></p>
            ) : loading ? (
              <p className="px-3 py-2 text-[13px] text-[#666]">Loading categories…</p>
            ) : (
              TAXONOMY_SECTIONS.map((section) => (
                <div key={section.kind} className="border-t border-[#f0f0f0]">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#666]">{section.title}</p>
                  <TaxonomyTree mode="single" roots={tree[section.kind]} query={query} value={value} onSelect={pick} initiallyExpanded={expanded} />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
