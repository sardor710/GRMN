"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import { formatKzt, inputClass, labelClass, primaryButtonClass, secondaryButtonClass, type ProductDraft } from "./shared";

interface GarminImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** True when the editor already holds data that applying a draft would overwrite. */
  formHasData: boolean;
  onApply: (draft: ProductDraft) => void;
}

interface ImportResult {
  draft: ProductDraft;
  warnings: string[];
}

const DEFAULT_RATE = 500;

const progressHint = (seconds: number, downloading: boolean) => {
  if (seconds < 6) return "Fetching the product page from garmin.com…";
  if (seconds < 10 || !downloading) return "Reading variants, specs and prices…";
  return "Downloading photos into the store (big families take ~30 s)…";
};

export function GarminImportDialog({ open, onClose, formHasData, onApply }: GarminImportDialogProps) {
  const [url, setUrl] = useState("");
  const [rate, setRate] = useState<string>(String(DEFAULT_RATE));
  const [downloadImages, setDownloadImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Prefill the remembered KZT/USD rate each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { settings?: { importRateKztPerUsd?: number } } | null) => {
        const remembered = data?.settings?.importRateKztPerUsd;
        if (!cancelled && remembered && remembered > 0) setRate(String(remembered));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [busy]);

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const runImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    const rateNum = Number(rate);
    if (!(rateNum > 0)) {
      setError("Enter how many tenge equal 1 USD (a positive number).");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setElapsed(0);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), rateKztPerUsd: rateNum, downloadImages }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ImportResult> & { error?: string };
      if (!res.ok || !data.draft) {
        setError(
          res.status === 401
            ? "Your admin session expired — sign in again."
            : data.error || `Import failed (HTTP ${res.status}).`,
        );
        return;
      }
      setResult({ draft: data.draft, warnings: data.warnings || [] });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") setError("Import cancelled.");
      else setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const apply = () => {
    if (!result) return;
    if (formHasData && !window.confirm("Replace the current form contents with the imported product? Unsaved edits will be lost.")) {
      return;
    }
    onApply(result.draft);
    setResult(null);
    setUrl("");
    onClose();
  };

  const draft = result?.draft;
  const prices = (draft?.variants || []).map((v) => v.price).filter((p): p is number => p !== null && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : draft?.price;
  const maxPrice = prices.length ? Math.max(...prices) : draft?.price;

  return (
    <EditorDialog
      open={open}
      onClose={close}
      title="Import from garmin.com"
      subtitle="Paste a garmin.com product link — you get an editable draft; nothing is saved until you save the product."
      footer={
        <>
          <button type="button" onClick={close} className={secondaryButtonClass}>
            {busy ? "Cancel import" : "Close"}
          </button>
          {result && (
            <button type="button" onClick={apply} className={primaryButtonClass}>
              Apply to form
            </button>
          )}
        </>
      }
    >
      <form onSubmit={runImport} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="garmin-url">
            Product link
          </label>
          <input
            id="garmin-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.garmin.com/en-US/p/1953453"
            disabled={busy}
            className={`mt-1 ${inputClass} font-mono`}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
          <div>
            <label className={labelClass} htmlFor="garmin-rate">
              Tenge per 1 USD
            </label>
            <input
              id="garmin-rate"
              type="number"
              min={1}
              step="0.01"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              disabled={busy}
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-[11px] text-neutral-500">Garmin USD prices × rate → KZT. The rate is remembered.</p>
          </div>
          <label className="flex items-center gap-2 pb-6 text-[13px] text-neutral-800">
            <input
              type="checkbox"
              checked={downloadImages}
              onChange={(e) => setDownloadImages(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 accent-black"
            />
            Download photos into our store
          </label>
        </div>
        <button type="submit" disabled={busy || !url.trim()} className={primaryButtonClass}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {busy ? "Importing…" : result ? "Import again" : "Import"}
        </button>
      </form>

      {busy && (
        <div className="mt-4 border border-sky-200 bg-sky-50 p-3 text-[12px] text-sky-900" role="status" aria-live="polite">
          <div className="flex items-center justify-between">
            <span>{progressHint(elapsed, downloadImages)}</span>
            <span className="tabular-nums">{elapsed}s</span>
          </div>
          <progress className="mt-2 h-1 w-full accent-[#007cc3]" aria-label="Import in progress" />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {draft && (
        <div className="mt-4 space-y-3 border border-neutral-200 p-4">
          <div className="flex items-start gap-3">
            {draft.image && (
              // eslint-disable-next-line @next/next/no-img-element -- imported photo preview
              <img src={draft.image} alt="" className="h-20 w-20 shrink-0 border border-neutral-200 object-contain p-1" />
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-heading uppercase tracking-wider text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Draft ready
              </p>
              <p className="g-heading text-[18px] leading-tight text-black">{draft.name}</p>
              <p className="text-[12px] text-neutral-500">
                {[draft.family, draft.category, draft.subCategory].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-[13px] text-black">
                {minPrice === maxPrice ? formatKzt(minPrice) : `${formatKzt(minPrice)} – ${formatKzt(maxPrice)}`}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
            {[
              ["Variants", draft.variants?.length ?? 0],
              ["Photos", draft.images?.length ?? 0],
              ["Spec groups", draft.specGroups?.length ?? 0],
              ["In the box", draft.inTheBox?.length ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="border border-neutral-200 bg-neutral-50 px-2 py-1.5">
                <dt className="text-[10px] font-heading uppercase tracking-wider text-neutral-500">{label}</dt>
                <dd className="text-[16px] font-medium text-black">{value}</dd>
              </div>
            ))}
          </dl>
          {(draft.options?.length ?? 0) > 0 && (
            <div>
              <p className={labelClass}>Options</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-neutral-700">
                {draft.options?.map((o) => (
                  <li key={o.id}>
                    <strong className="text-black">{o.name}</strong> ({o.values.length}):{" "}
                    {o.values.map((v) => v.label).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <details className="border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-900">
              <summary className="cursor-pointer font-semibold">
                {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </EditorDialog>
  );
}
