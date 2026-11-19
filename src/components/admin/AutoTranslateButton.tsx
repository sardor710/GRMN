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
      // Long content (a garmin.com overview) is translated in rounds of about 40 s; each round
      // continues with the fields still empty.
      let current = record(), total = 0, failures = 0;
      for (let round = 1; round <= 400; round++) {
        const res = await fetch("/api/admin/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, record: current }) });
        const data = (await res.json().catch(() => null)) as { translations?: Record<string, unknown>; filled?: number; remaining?: number; error?: { message?: string } } | null;
        // The free model sometimes stalls on one round: retry a few times before giving up
        // (everything finished so far is already in the form).
        if ((res.status === 503 || res.status === 504 || res.status === 502) && ++failures <= 3) { setMessage(`Translation service is slow — retrying (${failures}/3)… ${total} fields done.`); await new Promise(r => setTimeout(r, 3000)); continue; }
        if (!res.ok || !data?.translations) throw new Error(data?.error?.message || "Automatic translation is unavailable right now.");
        failures = 0;
        onTranslated(data.translations);
        current = { ...current, translations: data.translations };
        total += data.filled ?? 0;
        if (!data.remaining) break;
        setMessage(`Translated ${total} fields so far, ${data.remaining} to go…`);
        if (!data.filled) throw new Error("The translation service is not answering right now; the fields done so far are kept.");
      }
      setMessage(total ? `Filled ${total} empty RU/KZ fields — review the RU and KZ tabs (machine translation), then save.` : "Nothing to translate: every RU/KZ field is already filled.");
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
