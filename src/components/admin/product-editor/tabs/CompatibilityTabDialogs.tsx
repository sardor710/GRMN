"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, Lightbulb, Search } from "lucide-react";
import type { PickerRow, TaxonomyNode } from "@/contracts/admin-catalog";
import { Button, Select, StatusBadge } from "@/components/admin/ui";
import { Thumb } from "@/components/admin/catalog/Thumb";
import { useDebouncedValue } from "@/components/admin/catalog/useDebouncedValue";
import { cn } from "@/lib/utils";
import { EditorDialog } from "../EditorDialog";
import { inputClass } from "../shared";
import {
  buildDeviceLink, compatibilityFromPayload, describeDeviceLink, deviceSummaryFromPayload, groupsUnder, suggestForWidth,
  type DeviceLinkModel, type DeviceSummary, type MergeOutcome,
} from "../compatibility-state";

// Dialogs of the Accessories & compatibility tab (plan M6.3): a category → group → product browser with
// search, the accessory-side "Add devices" flow (device → option values → link), "Copy from another
// accessory" and the device-side "Add accessories" flow with "add whole group".

type PickerPage = { items: PickerRow[]; nextCursor: string | null };

export async function fetchPicker(params: Record<string, string | null | undefined>): Promise<PickerPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const response = await fetch(`/api/admin/catalog/picker?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "Your admin session expired. Sign in again." : `Products could not be loaded (HTTP ${response.status}).`);
  const body = (await response.json()) as Partial<PickerPage>;
  return { items: Array.isArray(body.items) ? body.items : [], nextCursor: body.nextCursor ?? null };
}

/** Every product in a category (and its sub-categories), for "add whole group". */
export async function fetchAllInCategory(category: string, exclude: string | null): Promise<PickerRow[]> {
  const rows: PickerRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const result: PickerPage = await fetchPicker({ category, exclude, limit: "100", cursor });
    rows.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

export async function fetchProduct(key: string): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/admin/catalog/products/${encodeURIComponent(key)}`, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as { product?: Record<string, unknown> } | null;
  if (!response.ok || !body?.product) throw new Error(response.status === 404 ? "That product no longer exists." : `The product could not be loaded (HTTP ${response.status}).`);
  return body.product;
}

type ListState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: PickerRow[]; nextCursor: string | null; loadingMore: boolean };

/**
 * Browse category → sub-category/group → products, or search. `renderAction` draws each product's control;
 * `groupAction` adds a control for the category being viewed (e.g. "Add all in QuickFit 22 mm").
 */
function ProductBrowser({ roots, taxonomy, rootLabel, exclude, initialPath = [], renderAction, renderNote, groupAction, searchPlaceholder }: {
  roots: TaxonomyNode[];
  taxonomy: TaxonomyNode[];
  rootLabel: string;
  exclude: string | null;
  initialPath?: string[];
  renderAction: (row: PickerRow) => ReactNode;
  renderNote?: (row: PickerRow) => ReactNode;
  groupAction?: (node: TaxonomyNode) => ReactNode;
  searchPlaceholder: string;
}) {
  const [path, setPath] = useState<string[]>(initialPath);
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 250);
  const searchRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => new Map(taxonomy.map((node) => [node.key, node])), [taxonomy]);
  const current = path.length ? index.get(path[path.length - 1]) ?? null : null;
  const children = current ? groupsUnder(taxonomy, current.key) : roots;
  const category = current?.key ?? null;
  const queryKey = category || search ? JSON.stringify([category, search, exclude]) : "";
  // Results are stored with the query they answer; a newer query shows as loading until it lands.
  const [result, setResult] = useState<{ key: string; state: ListState }>({ key: "", state: { status: "idle" } });
  const list: ListState = !queryKey ? { status: "idle" } : result.key === queryKey ? result.state : { status: "loading" };
  const setList = (state: ListState) => setResult({ key: queryKey, state });

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    if (!queryKey) return;
    let active = true;
    fetchPicker({ search, category, exclude, limit: "30" })
      .then((page) => { if (active) setResult({ key: queryKey, state: { status: "ready", ...page, loadingMore: false } }); })
      .catch((error: unknown) => { if (active) setResult({ key: queryKey, state: { status: "error", message: error instanceof Error ? error.message : "Products could not be loaded." } }); });
    return () => { active = false; };
  }, [queryKey, category, search, exclude]);

  const loadMore = async () => {
    if (list.status !== "ready" || !list.nextCursor) return;
    setList({ ...list, loadingMore: true });
    try {
      const page = await fetchPicker({ search, category, exclude, limit: "30", cursor: list.nextCursor });
      setList({ status: "ready", items: [...list.items, ...page.items], nextCursor: page.nextCursor, loadingMore: false });
    } catch (error) {
      setList({ status: "error", message: error instanceof Error ? error.message : "Products could not be loaded." });
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#808080]" aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={current ? `Search in ${current.name}` : searchPlaceholder} aria-label={current ? `Search in ${current.name}` : searchPlaceholder} className={cn(inputClass, "pl-9")} />
      </div>
      <nav aria-label="Category path" className="flex flex-wrap items-center gap-1 text-[13px]">
        <button type="button" onClick={() => setPath([])} className={cn("hover:underline focus-visible:outline-2 focus-visible:outline-black", !path.length ? "font-semibold text-black" : "text-[#106fad]")}>{rootLabel}</button>
        {path.map((key, i) => (
          <span key={key} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[#8c8c8c]" aria-hidden="true" />
            <button type="button" onClick={() => setPath(path.slice(0, i + 1))} className={cn("hover:underline focus-visible:outline-2 focus-visible:outline-black", i === path.length - 1 ? "font-semibold text-black" : "text-[#106fad]")}>{index.get(key)?.name ?? key}</button>
          </span>
        ))}
      </nav>
      {current && groupAction && <div className="flex flex-wrap items-center gap-2">{groupAction(current)}</div>}
      {!search && children.length > 0 && (
        <ul className="grid border-l border-t border-[#d9d9d9] bg-white sm:grid-cols-2" aria-label={current ? `Inside ${current.name}` : rootLabel}>
          {children.map((node) => (
            <li key={node.key} className="border-b border-r border-[#d9d9d9]">
              <button type="button" onClick={() => setPath([...path, node.key])} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black">
                <span className="truncate">{node.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#8c8c8c]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.status !== "idle" && (
        <div aria-busy={list.status === "loading"}>
          <h4 className="mb-1.5 text-[12px] font-bold text-black">{search ? `Products matching “${search}”${current ? ` in ${current.name}` : ""}` : `Products in ${current?.name}`}</h4>
          <div className="border border-[#d9d9d9] bg-white">
            {list.status === "loading" ? (
              <ul aria-label="Loading products">{Array.from({ length: 4 }, (_, i) => <li key={i} className="flex items-center gap-3 border-b border-[#f0f0f0] px-3 py-2.5 last:border-b-0"><span className="h-9 w-9 animate-pulse bg-[#eee]" /><span className="h-3 w-1/2 animate-pulse bg-[#eee]" /></li>)}</ul>
            ) : list.status === "error" ? (
              <p role="alert" className="p-4 text-[13px] text-[#c20f2f]">{list.message}</p>
            ) : list.items.length === 0 ? (
              <p className="p-4 text-[13px] text-[#666]">{search ? "Nothing matches. Try another word or a category." : "No other products here yet. Go one level up in the path above to see more."}</p>
            ) : (
              <ul className="divide-y divide-[#f0f0f0]">
                {list.items.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <Thumb src={row.thumbnail} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-black">{row.name}</span>
                        {row.status !== "published" && <StatusBadge status={row.status} />}
                      </span>
                      <span className="block truncate text-[12px] text-[#666]">{[row.primaryCategory?.name, row.variantCount > 1 ? `${row.variantCount} variants` : null].filter(Boolean).join(" · ") || "No category"}</span>
                      {renderNote?.(row)}
                    </span>
                    {renderAction(row)}
                  </li>
                ))}
              </ul>
            )}
            {list.status === "ready" && list.nextCursor && (
              <div className="border-t border-[#f0f0f0] p-2 text-center"><Button size="sm" variant="outline" loading={list.loadingMore} onClick={loadMore}>Load more</Button></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Feedback({ text }: { text: string | null }) {
  return (
    <p aria-live="polite" className="min-h-5 text-[13px] text-[#4d5900]">
      {text && <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" aria-hidden="true" />{text}</span>}
    </p>
  );
}

/** Watch series first, then the catalog tree (accessory categories are not devices). */
export function deviceRoots(taxonomy: TaxonomyNode[]): TaxonomyNode[] {
  const series = taxonomy.filter((node) => node.kind === "group" && !node.parentKey && node.key === "watch-series");
  return [...series, ...taxonomy.filter((node) => node.kind === "catalog" && !node.parentKey)];
}

const OUTCOME_TEXT: Record<MergeOutcome, string> = {
  added: "Added",
  merged: "Added to the existing link",
  replaced: "Now fits all variants (replaces the finer link)",
  alreadyCovered: "Already fits all variants — nothing to add",
  unchanged: "Already linked — nothing to add",
};

/** Accessory side: pick a device, then its option values (none = all variants) and optional SKU exceptions. */
export function AddDevicesDialog({ open, onClose, taxonomy, selfKey, linkedKeys, accessorySkus, bandWidth, onAdd }: {
  open: boolean;
  onClose: () => void;
  taxonomy: TaxonomyNode[];
  selfKey: string | null;
  linkedKeys: ReadonlySet<string>;
  accessorySkus: string[];
  bandWidth: 20 | 22 | 26 | null;
  onAdd: (link: DeviceLinkModel) => MergeOutcome;
}) {
  const [device, setDevice] = useState<{ key: string; state: { status: "loading" } | { status: "error"; message: string } | { status: "ready"; summary: DeviceSummary } } | null>(null);
  const [values, setValues] = useState<ReadonlySet<string>>(new Set());
  const [skus, setSkus] = useState<ReadonlySet<string>>(new Set());
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [accessorySku, setAccessorySku] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const id = useId();

  const choose = (row: PickerRow) => {
    setDevice({ key: row.id, state: { status: "loading" } });
    setValues(new Set()); setSkus(new Set()); setExceptionsOpen(false); setFeedback(null);
    fetchProduct(row.id)
      .then((payload) => setDevice((previous) => (previous?.key === row.id ? { key: row.id, state: { status: "ready", summary: deviceSummaryFromPayload(payload) } } : previous)))
      .catch((error: unknown) => setDevice((previous) => (previous?.key === row.id ? { key: row.id, state: { status: "error", message: error instanceof Error ? error.message : "The device could not be loaded." } } : previous)));
  };
  const close = () => { setDevice(null); setFeedback(null); onClose(); };
  const summary = device?.state.status === "ready" ? device.state.summary : null;
  const link = summary ? buildDeviceLink(summary, { valueIds: [...values], variantSkus: [...skus], accessoryVariantSku: accessorySku || null }) : null;
  const suggestion = summary && bandWidth ? suggestForWidth(bandWidth, summary) : null;
  const toggle = (set: ReadonlySet<string>, value: string) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };

  const add = () => {
    if (!link) return;
    const outcome = onAdd(link);
    setFeedback(`${OUTCOME_TEXT[outcome]}: ${describeDeviceLink(link).map((line) => line.text).join("; ")}`);
    setDevice(null);
  };

  return (
    <EditorDialog
      open={open}
      onClose={close}
      wide
      title="Add compatible devices"
      subtitle={summary ? "Step 2 of 2 · which variants does it fit?" : "Step 1 of 2 · choose a device"}
      footer={
        <>
          <Button variant="outline" onClick={close}>Done</Button>
          {device && <Button variant="primary" onClick={add} disabled={!link}>Add link</Button>}
        </>
      }
    >
      <Feedback text={feedback} />
      {!device ? (
        <ProductBrowser
          roots={deviceRoots(taxonomy)}
          taxonomy={taxonomy}
          rootLabel="All devices"
          exclude={selfKey}
          searchPlaceholder="Search devices by name or SKU"
          renderNote={(row) => (linkedKeys.has(row.id) ? <span className="block text-[12px] text-[#4d5900]">Already linked — choose it again to add sizes</span> : null)}
          renderAction={(row) => <Button size="sm" variant="outline" onClick={() => choose(row)} aria-label={`Choose ${row.name}`}>Choose</Button>}
        />
      ) : device.state.status === "loading" ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading device"><div className="h-12 w-2/3 animate-pulse bg-[#eee]" /><div className="h-24 animate-pulse bg-[#f2f2f2]" /></div>
      ) : device.state.status === "error" ? (
        <div role="alert" className="space-y-3">
          <p className="text-[13px] text-[#c20f2f]">{device.state.message}</p>
          <Button size="sm" variant="outline" onClick={() => setDevice(null)}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to devices</Button>
        </div>
      ) : summary && link ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="ghost" onClick={() => setDevice(null)} className="-ml-1"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Other device</Button>
            <Thumb src={summary.thumbnail} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-black">{summary.name}</p>
              <p className="text-[12px] text-[#666]">{summary.variantCount} variant{summary.variantCount === 1 ? "" : "s"}</p>
            </div>
          </div>

          {suggestion && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-l-4 border-[#d9d9d9] border-l-[#6dcff6] bg-white px-4 py-3 text-[13px]">
              <span className="flex min-w-[200px] flex-1 items-center gap-2"><Lightbulb className="h-4 w-4 shrink-0 text-[#0f8fc4]" aria-hidden="true" />{suggestion.text} (garmin.com band guide).</span>
              <Button size="sm" variant="outline" onClick={() => { setValues(new Set(suggestion.whole ? [] : suggestion.valueIds)); setSkus(new Set()); }}>
                {suggestion.whole ? "Use all variants" : `Use ${suggestion.labels.join(" / ")}`}
              </Button>
            </div>
          )}

          {summary.options.length === 0 ? (
            <p className="text-[13px] text-[#333]">This device has no options, so the link covers it whole.</p>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-[#333]">Pick the values it fits. <strong className="font-semibold text-black">Pick none to fit every variant.</strong> Each value is one link and also covers variants added later with that value.</p>
              {summary.options.map((option) => (
                <fieldset key={option.id}>
                  <legend className="mb-1.5 text-[12px] font-bold text-black">{option.name}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {option.values.map((value) => {
                      const on = values.has(value.id);
                      return (
                        <button
                          key={value.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setValues((previous) => toggle(previous, value.id))}
                          className={cn("inline-flex h-9 items-center gap-2 border px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black", on ? "border-black bg-black text-white" : "border-[#d9d9d9] bg-white text-black hover:border-black")}
                        >
                          {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          {value.label}
                          <span className={cn("tabular-nums text-[12px]", on ? "text-white/75" : "text-[#8c8c8c]")}>{value.variantCount}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {summary.variants.length > 1 && (
            <div className="border border-[#d9d9d9] bg-white">
              <button type="button" aria-expanded={exceptionsOpen} aria-controls={`${id}-exceptions`} onClick={() => setExceptionsOpen((value) => !value)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black">
                <span>Exceptions: specific variants {skus.size ? <span className="font-normal text-[#666]">· {skus.size} picked</span> : null}</span>
                <ChevronRight className={cn("h-4 w-4 transition-transform", exceptionsOpen && "rotate-90")} aria-hidden="true" />
              </button>
              {exceptionsOpen && (
                <div id={`${id}-exceptions`} className="border-t border-[#f0f0f0] px-3 py-2">
                  <p className="mb-1.5 text-[12px] text-[#666]">Only for rare cases a value cannot describe. Each SKU is its own link.</p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {summary.variants.map((variant) => (
                      <li key={variant.sku}>
                        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                          <input type="checkbox" checked={skus.has(variant.sku)} onChange={() => setSkus((previous) => toggle(previous, variant.sku))} className="h-4 w-4 accent-black" />
                          <span className="font-mono text-[12px]">{variant.sku}</span>
                          <span className="truncate text-[#666]">{variant.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {accessorySkus.length > 1 && (
            <div className="max-w-sm">
              <label htmlFor={`${id}-own`} className="mb-1 block text-[12px] font-bold text-black">Which of this accessory&apos;s SKUs?</label>
              <Select id={`${id}-own`} value={accessorySku} onChange={(event) => setAccessorySku(event.target.value)}>
                <option value="">All SKUs of this accessory</option>
                {accessorySkus.map((sku) => <option key={sku} value={sku}>Only {sku}</option>)}
              </Select>
            </div>
          )}

          <div className="border-t border-[#e5e5e5] pt-3">
            <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-[#595959]">Shoppers will read</p>
            <ul className="space-y-0.5 text-[14px] text-black">
              {describeDeviceLink(link).map((line) => <li key={JSON.stringify(line.line)}>{line.text}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
    </EditorDialog>
  );
}

/** Copies another accessory's device links (e.g. a new colour of the same band). */
export function CopyDevicesDialog({ open, onClose, taxonomy, selfKey, initialPath, onCopy }: {
  open: boolean;
  onClose: () => void;
  taxonomy: TaxonomyNode[];
  selfKey: string | null;
  initialPath: string[];
  onCopy: (devices: DeviceLinkModel[], sourceName: string) => string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = async (row: PickerRow) => {
    setBusy(row.id); setError(null); setFeedback(null);
    try {
      const devices = compatibilityFromPayload(await fetchProduct(row.id)).devices;
      if (!devices.length) setError(`${row.name} has no compatible devices to copy.`);
      else setFeedback(onCopy(devices, row.name));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The accessory could not be loaded.");
    } finally { setBusy(null); }
  };
  return (
    <EditorDialog open={open} onClose={() => { setFeedback(null); setError(null); onClose(); }} wide title="Copy devices from another accessory" subtitle="Imports its device links into this accessory; links already here are kept." footer={<Button variant="outline" onClick={onClose}>Done</Button>}>
      <Feedback text={feedback} />
      {error && <p role="alert" className="mb-2 text-[13px] text-[#c20f2f]">{error}</p>}
      <ProductBrowser
        roots={taxonomy.filter((node) => node.kind === "accessory" && !node.parentKey)}
        taxonomy={taxonomy}
        rootLabel="All accessories"
        exclude={selfKey}
        initialPath={initialPath}
        searchPlaceholder="Search accessories by name or SKU"
        renderAction={(row) => <Button size="sm" variant="outline" loading={busy === row.id} disabled={busy !== null && busy !== row.id} onClick={() => void copy(row)} aria-label={`Copy device links from ${row.name}`}>Copy links</Button>}
      />
    </EditorDialog>
  );
}

/** Device side: tick accessories (whole-device links) by category → group, or add a whole group at once. */
export function AddAccessoriesDialog({ open, onClose, taxonomy, selfKey, isLinked, fineScope, onToggle, onAddGroup }: {
  open: boolean;
  onClose: () => void;
  taxonomy: TaxonomyNode[];
  selfKey: string | null;
  isLinked: (key: string) => boolean;
  /** "51 mm only" when the accessory already fits part of this device through an accessory-side link. */
  fineScope: (key: string) => string | null;
  onToggle: (row: PickerRow) => void;
  onAddGroup: (rows: PickerRow[]) => number;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addGroup = async (node: TaxonomyNode) => {
    setBusy(true); setError(null); setFeedback(null);
    try {
      const rows = await fetchAllInCategory(node.key, selfKey);
      const added = onAddGroup(rows);
      setFeedback(rows.length
        ? `${node.name}: ${added} added${added < rows.length ? `, ${rows.length - added} already linked` : ""}. They fit every variant of this device.`
        : `${node.name} has no products yet.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The group could not be loaded.");
    } finally { setBusy(false); }
  };
  return (
    <EditorDialog open={open} onClose={() => { setFeedback(null); setError(null); onClose(); }} wide title="Add accessories" subtitle="Ticked accessories fit every variant of this device." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <Feedback text={feedback} />
      {error && <p role="alert" className="mb-2 text-[13px] text-[#c20f2f]">{error}</p>}
      <ProductBrowser
        roots={taxonomy.filter((node) => node.kind === "accessory" && !node.parentKey)}
        taxonomy={taxonomy}
        rootLabel="Accessory categories"
        exclude={selfKey}
        searchPlaceholder="Search accessories by name or SKU"
        groupAction={(node) => (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void addGroup(node)}>Add every product in {node.name}</Button>
        )}
        renderNote={(row) => {
          const scope = fineScope(row.id);
          return scope && !isLinked(row.id) ? <span className="block text-[12px] text-[#8a6100]">Fits {scope} (set on the accessory). Ticking makes it fit all variants.</span> : null;
        }}
        renderAction={(row) => (
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12px]">
            <input type="checkbox" checked={isLinked(row.id)} onChange={() => onToggle(row)} className="h-4 w-4 accent-black" aria-label={`${row.name} fits this device`} />
            <span className="hidden sm:inline">Fits</span>
          </label>
        )}
      />
    </EditorDialog>
  );
}
