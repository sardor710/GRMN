"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import type { SkuRow } from "@/contracts/admin-catalog";
import type { ProductImage } from "@/lib/cms/types";
import { Button, StatusSelect } from "@/components/admin/ui";
import { controlRadius } from "@/components/admin/ui/shape";
import { cn } from "@/lib/utils";

// SKU quick edit (plan M3.4): price, compare-at, stock (sent with the loaded baseline), status and photos
// → PATCH /api/admin/catalog/variants/:id. The product's photos come from the editor payload, loaded only
// when the drawer opens. Everything else: "Open full editor" (focused on this variant).
const VARIANT_STATUSES = ["active", "draft", "archived"] as const;
const field = `h-10 w-full border border-[#d9d9d9] bg-white px-3 text-[14px] tabular-nums text-black hover:border-[#737373] focus:border-black focus:outline-none ${controlRadius}`;

type Loaded = { images: ProductImage[]; imageIds: string[]; version: number; stockBaseline: number };

export function QuickEditDrawer({ row, onClose, onSaved, onOpenEditor }: {
  row: SkuRow;
  onClose: () => void;
  onSaved: (variant: SkuRow) => void;
  onOpenEditor: (row: SkuRow) => void;
}) {
  const titleId = useId();
  const [price, setPrice] = useState(row.price === null ? "" : String(row.price));
  const [compareAt, setCompareAt] = useState(row.compareAt === null ? "" : String(row.compareAt));
  const [stock, setStock] = useState(String(row.stock.onHand));
  const [status, setStatus] = useState(row.status);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [imageIds, setImageIds] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; reload: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/catalog/products/${encodeURIComponent(row.productId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Photos could not be loaded (HTTP ${response.status}).`);
        const body = (await response.json()) as { product?: { images?: ProductImage[]; version?: number; variants?: { id: string; imageIds?: string[]; stockBaseline?: number }[]; stockBaseline?: number } };
        const product = body.product ?? {};
        const variant = product.variants?.find((item) => item.id === row.variantId);
        if (!active) return;
        setLoaded({ images: product.images ?? [], imageIds: variant?.imageIds ?? [], version: product.version ?? row.productVersion, stockBaseline: variant?.stockBaseline ?? product.stockBaseline ?? row.stock.onHand });
        setImageIds(variant?.imageIds ?? []);
      })
      .catch((reason: unknown) => { if (active) setLoadError(reason instanceof Error ? reason.message : "Photos could not be loaded."); });
    return () => { active = false; };
  }, [row.productId, row.variantId, row.productVersion, row.stock.onHand, reloadKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const baseline = loaded?.stockBaseline ?? row.stock.onHand;
  const changes = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    const nextPrice = price.trim() === "" ? null : Number(price);
    if (nextPrice !== null && nextPrice !== row.price) body.price = nextPrice;
    const nextCompare = compareAt.trim() === "" ? null : Number(compareAt);
    if (nextCompare !== row.compareAt) body.originalPrice = nextCompare;
    const nextStock = Math.max(0, Math.trunc(Number(stock) || 0));
    if (nextStock !== row.stock.onHand) { body.stock = nextStock; body.stockBaseline = baseline; }
    if (status !== row.status) body.status = status;
    if (imageIds && loaded && JSON.stringify(imageIds) !== JSON.stringify(loaded.imageIds)) body.imageIds = imageIds;
    return body;
  };
  const pending = changes();
  const dirty = Object.keys(pending).length > 0;
  const invalidPrice = price.trim() !== "" && (!Number.isFinite(Number(price)) || Number(price) < 0);

  const save = async () => {
    if (!dirty || invalidPrice) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/catalog/variants/${encodeURIComponent(row.variantId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: loaded?.version ?? row.productVersion, ...pending }),
      });
      const body = (await response.json().catch(() => null)) as { variant?: SkuRow; error?: { code?: string; message?: string } } | null;
      if (response.ok && body?.variant) { onSaved(body.variant); return; }
      const code = body?.error?.code;
      if (response.status === 409 && code === "STOCK_CONFLICT") setError({ text: "Stock changed since this drawer opened (an order or a restock). Reload to see the current stock.", reload: true });
      else if (response.status === 409) setError({ text: "This product was saved by someone else. Reload, then make the change again.", reload: true });
      else setError({ text: body?.error?.message ? `Not saved: ${body.error.message}` : `Not saved (HTTP ${response.status}).`, reload: false });
    } catch {
      setError({ text: "Network error: nothing was saved.", reload: false });
    } finally {
      setSaving(false);
    }
  };

  const toggleImage = (id: string) => setImageIds((previous) => {
    const list = previous ?? [];
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex h-full w-full max-w-[440px] flex-col border-l border-[#d9d9d9] bg-white font-sans text-black shadow-[-8px_0_24px_rgba(0,0,0,0.12)]">
        <header className="flex items-start gap-3 border-b border-[#e5e5e5] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[12px] text-[#666]">{row.sku}</p>
            <h2 id={titleId} className="g-heading truncate text-[22px] uppercase leading-tight">{row.productName}</h2>
            {row.options.length > 0 && <p className="mt-0.5 truncate text-[13px] text-[#333]">{row.options.map((option) => `${option.option}: ${option.value}`).join(" · ")}</p>}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close quick edit"><X className="h-5 w-5" /></Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold">Price, ₸</span>
              <input type="number" inputMode="decimal" min={0} value={price} onChange={(event) => setPrice(event.target.value)} aria-invalid={invalidPrice || undefined} className={cn(field, invalidPrice && "border-[#c20f2f]")} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold">Compare-at, ₸</span>
              <input type="number" inputMode="decimal" min={0} value={compareAt} onChange={(event) => setCompareAt(event.target.value)} placeholder="—" className={field} />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold">Stock on hand</span>
              <input type="number" inputMode="numeric" min={0} value={stock} onChange={(event) => setStock(event.target.value)} className={cn(field, "max-w-[160px]")} />
            </label>
            <p className="mt-1 text-[12px] text-[#666]">
              Loaded: {baseline} on hand · {row.stock.reserved} reserved · {row.stock.available} available. Saving records a stock movement; if stock changed meanwhile you are asked to reload.
            </p>
          </div>
          <label className="block max-w-[220px]">
            <span className="mb-1 block text-[12px] font-bold">Status</span>
            <StatusSelect value={status} options={VARIANT_STATUSES} onChange={setStatus} aria-label="Variant status" />
          </label>
          <fieldset>
            <legend className="mb-1 text-[12px] font-bold">Photos for this variant</legend>
            <p className="mb-2 text-[12px] text-[#666]">Tick the product photos to show for this SKU; the first ticked is its main photo. None ticked = the product gallery.</p>
            {loadError ? (
              <p className="text-[13px] text-[#c20f2f]">{loadError}</p>
            ) : !loaded ? (
              <div className="grid grid-cols-4 gap-2" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-square animate-pulse bg-[#eee]" />)}</div>
            ) : loaded.images.length === 0 ? (
              <p className="text-[13px] text-[#666]">The product has no photos yet.</p>
            ) : (
              <ul className="grid grid-cols-4 gap-2">
                {loaded.images.map((image) => {
                  const order = (imageIds ?? []).indexOf(image.id);
                  return (
                    <li key={image.id}>
                      <button
                        type="button"
                        aria-pressed={order >= 0}
                        aria-label={`${order >= 0 ? "Remove" : "Use"} photo ${image.alt || image.id}`}
                        onClick={() => toggleImage(image.id)}
                        className={cn("relative block aspect-square w-full border bg-white p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black", order >= 0 ? "border-2 border-black" : "border-[#d9d9d9] hover:border-black")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails from uploads or garmin.com */}
                        <img src={image.src} alt="" loading="lazy" className="h-full w-full object-contain" />
                        {order >= 0 && <span className="absolute left-0 top-0 grid h-5 min-w-5 place-items-center bg-black px-1 text-[11px] text-white">{order + 1}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        </div>

        <footer className="space-y-2 border-t border-[#e5e5e5] px-5 py-3">
          {error && (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-[#a30d28]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error.text}{error.reload && <> <button type="button" className="font-bold underline" onClick={() => { setError(null); setLoaded(null); setReloadKey((value) => value + 1); }}>Reload</button></>}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button variant="link" className="mr-auto h-auto px-0" onClick={() => onOpenEditor(row)}>
              Open full editor <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || invalidPrice}>Save</Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
