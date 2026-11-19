"use client";

import { useState } from "react";
import { Languages } from "lucide-react";

type Kind = "product" | "blog" | "banner" | "homepage";

/**
 * Owner 2026-11-19: Russian and Kazakh are machine-translated by default (OpenRouter). Fills only the
 * empty RU/KZ fields of the current form; staff review the tabs and then save as usual.
 */
export function AutoTranslateButton({ kind, record, onTranslated }: {
  kind: Kind;
  record: () => Record<string, unknown>;
  onTranslated: (translations: Record<string, unknown>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async () => {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/admin/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, record: record() }) });
      const data = (await res.json().catch(() => null)) as { translations?: Record<string, unknown>; filled?: number; error?: { message?: string } } | null;
      if (!res.ok || !data?.translations) throw new Error(data?.error?.message || "Automatic translation is unavailable right now.");
      onTranslated(data.translations);
      setMessage(data.filled ? `Filled ${data.filled} empty RU/KZ fields — review the RU and KZ tabs, then save.` : "Nothing to translate: every RU/KZ field is already filled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Automatic translation failed.");
    } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={run} disabled={busy}
        className="inline-flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-heading font-semibold uppercase tracking-wider text-black hover:border-black disabled:opacity-50 rounded-none">
        <Languages className="h-3.5 w-3.5" />
        {busy ? "Translating…" : "Auto-translate RU & KZ"}
      </button>
      {message && <span role="status" className="text-[12px] text-neutral-600">{message}</span>}
    </div>
  );
}
