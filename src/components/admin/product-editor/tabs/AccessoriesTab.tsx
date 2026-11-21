"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import type { PickerRow } from "@/contracts/admin-catalog";
import { Button, StatusBadge } from "@/components/admin/ui";
import { useDebouncedValue } from "@/components/admin/catalog/useDebouncedValue";
import { cn } from "@/lib/utils";
import { Section } from "../Field";
import { formatKzt, inputClass } from "../shared";
import type { ProductEditorState } from "../useProductEditorState";

// "You may also like" / related products (relations.related). The picker loads lazily from
// GET /api/admin/catalog/picker only when this tab is open. Compatibility (accessory ↔ device) comes in M6.
type PickerState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: PickerRow[]; nextCursor: string | null; loadingMore: boolean };

const priceRange = (row: PickerRow) =>
  row.price.min === null ? "—" : row.price.max !== null && row.price.max !== row.price.min ? `${formatKzt(row.price.min)} – ${formatKzt(row.price.max)}` : formatKzt(row.price.min);

export function AccessoriesTab({ editor }: { editor: ProductEditorState }) {
  const { form, update, productKey } = editor;
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 250);
  const [state, setState] = useState<PickerState>({ status: "loading" });
  // Names of products seen in the picker, so the selected list can show them (relations store keys only).
  const [names, setNames] = useState<ReadonlyMap<string, PickerRow>>(new Map());
  const remember = (rows: PickerRow[]) => setNames((previous) => { const next = new Map(previous); for (const row of rows) next.set(row.id, row); return next; });

  const fetchPage = async (cursor?: string): Promise<{ items: PickerRow[]; nextCursor: string | null }> => {
    const params = new URLSearchParams({ limit: "20" });
    if (search) params.set("search", search);
    if (productKey) params.set("exclude", productKey);
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/admin/catalog/picker?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Products could not be loaded (HTTP ${response.status}).`);
    const body = (await response.json()) as { items?: PickerRow[]; nextCursor?: string | null };
    const items = Array.isArray(body.items) ? body.items : [];
    remember(items);
    return { items, nextCursor: body.nextCursor ?? null };
  };

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetchPage()
      .then((page) => { if (active) setState({ status: "ready", ...page, loadingMore: false }); })
      .catch((error: unknown) => { if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Products could not be loaded." }); });
    return () => { active = false; };
    // fetchPage only reads `search` and `productKey`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, productKey]);

  const loadMore = async () => {
    if (state.status !== "ready" || !state.nextCursor) return;
    setState({ ...state, loadingMore: true });
    try {
      const page = await fetchPage(state.nextCursor);
      setState({ status: "ready", items: [...state.items, ...page.items], nextCursor: page.nextCursor, loadingMore: false });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Products could not be loaded." });
    }
  };

  const toggle = (row: PickerRow) => {
    update((previous) => ({ ...previous, related: previous.related.includes(row.id) ? previous.related.filter((id) => id !== row.id) : [...previous.related, row.id] }));
  };

  return (
    <Section
      id="accessories"
      title="Related products"
      description="Shown as “You may also like” on the product page, in this order. Accessory compatibility (bands that fit a watch size) is set up separately."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <h4 className="mb-2 text-[12px] font-bold text-black">Selected · {form.related.length}</h4>
          {form.related.length === 0 ? (
            <p className="border border-dashed border-[#bfbfbf] bg-white px-4 py-6 text-[13px] text-[#666]">None yet. Tick products on the right.</p>
          ) : (
            <ol className="divide-y divide-[#f0f0f0] border border-[#d9d9d9] bg-white">
              {form.related.map((id, index) => {
                const row = names.get(id);
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <span className="w-5 shrink-0 text-right tabular-nums text-[#8c8c8c]">{index + 1}</span>
                    <Thumb src={row?.thumbnail ?? null} />
                    <span className="min-w-0 flex-1 truncate">{row?.name ?? <span className="font-mono text-[12px]">{id}</span>}</span>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${row?.name ?? id}`} onClick={() => update((previous) => ({ ...previous, related: previous.related.filter((item) => item !== id) }))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#808080]" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, SKU or family" aria-label="Search products to relate" className={cn(inputClass, "pl-9")} />
          </div>
          <div className="max-h-[460px] overflow-y-auto border border-[#d9d9d9] bg-white" aria-busy={state.status === "loading"}>
            {state.status === "loading" ? (
              <ul aria-label="Loading products">{Array.from({ length: 6 }, (_, i) => <li key={i} className="flex items-center gap-3 border-b border-[#f0f0f0] px-3 py-2.5"><span className="h-9 w-9 animate-pulse bg-[#eee]" /><span className="h-3 w-1/2 animate-pulse bg-[#eee]" /></li>)}</ul>
            ) : state.status === "error" ? (
              <p role="alert" className="p-4 text-[13px] text-[#c20f2f]">{state.message}</p>
            ) : state.items.length === 0 ? (
              <p className="p-4 text-[13px] text-[#666]">{search ? `No product matches “${search}”.` : "No other products yet."}</p>
            ) : (
              <ul className="divide-y divide-[#f0f0f0]">
                {state.items.map((row) => {
                  const checked = form.related.includes(row.id);
                  return (
                    <li key={row.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-[#f7f7f7]", checked && "bg-[#f7f7f7]")}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(row)} className="h-4 w-4 shrink-0 rounded-none accent-black" />
                        <Thumb src={row.thumbnail} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-black">{row.name}</span>
                          <span className="block truncate text-[12px] text-[#666]">{[row.family, row.primaryCategory?.name].filter(Boolean).join(" · ") || "—"}</span>
                        </span>
                        <span className="hidden shrink-0 text-right tabular-nums sm:block">{priceRange(row)}</span>
                        {row.status !== "published" && <StatusBadge status={row.status} />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {state.status === "ready" && state.nextCursor && (
              <div className="border-t border-[#f0f0f0] p-2 text-center">
                <Button size="sm" variant="outline" loading={state.loadingMore} onClick={loadMore}>Load more</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden border border-[#e5e5e5] bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails from uploads or garmin.com */}
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span className="h-3 w-3 bg-[#eee]" />}
    </span>
  );
}
