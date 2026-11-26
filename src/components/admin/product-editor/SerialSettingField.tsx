"use client";

// Owner 2026-11-25 (plan T4.3): "Serial number at packing" for one product. Automatic follows the categories
// (Admin ▸ Categories), Always / Never override them. Saved on change, outside the product's versioned save, so it
// never conflicts with the editor's own Save.
import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";

type Policy = "required" | "none" | null;
interface Setting { policy: Policy; decision: { required: boolean; source: string; detail: string | null }; warranty?: { months: number | null; effective: number } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE: Record<string, string> = { product: "set on this product", category: "from category", "legacy-category": "from its old-site category", default: "every product needs one unless its category says otherwise" };

function explain(setting: Setting): string {
  const what = setting.decision.required ? "Needs a serial" : "No serial";
  const why = SOURCE[setting.decision.source] ?? setting.decision.source;
  return `${what} — ${why}${setting.decision.detail && setting.decision.source !== "default" ? ` “${setting.decision.detail}”` : ""}`;
}

export function SerialSettingField({ productId }: { productId: string | undefined }) {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = !!productId && UUID.test(productId);
  useEffect(() => {
    if (!valid) return;
    let live = true;
    fetch(`/api/admin/orders?serialProduct=${productId}`, { cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!live) return; if (response.ok) setSetting(body as Setting); else setError(body?.error?.message ?? "The serial setting could not be loaded."); })
      .catch(() => { if (live) setError("The serial setting could not be loaded."); });
    return () => { live = false; };
  }, [productId, valid]);
  if (!valid) return null;
  async function change(policy: Policy) { await save({ action: "set_product_serial_policy", productId, policy }); }
  // 0033 (owner 2026-11-26): warranty months shown in customers' My devices; empty = from categories (else 12).
  async function changeWarranty(raw: string) {
    const months = raw.trim() === "" ? null : Math.min(120, Math.max(1, Number(raw.replace(/\D/g, "")) || 1));
    if ((setting?.warranty?.months ?? null) === months) return;
    await save({ action: "set_product_warranty", productId, months });
  }
  async function save(command: Record<string, unknown>) {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (response.ok) setSetting(body as Setting); else setError(body?.error?.message ?? "The serial setting could not be saved.");
    } catch { setError("The serial setting could not be saved."); }
    finally { setSaving(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border border-garmin-control bg-[#fafafa] px-4 py-3">
      <ScanLine className="h-5 w-5 text-black" aria-hidden />
      <label className="flex items-center gap-2 text-sm font-medium text-black">Serial number at packing
        <select aria-label="Serial number at packing" disabled={!setting || saving} className="h-9 border border-garmin-control bg-white px-2 text-sm font-normal focus:border-black focus:outline-none"
          value={setting?.policy ?? "auto"} onChange={event => void change(event.target.value === "auto" ? null : event.target.value as Policy)}>
          <option value="auto">Automatic</option>
          <option value="required">Always ask</option>
          <option value="none">Never ask</option>
        </select>
      </label>
      {setting && <span className={`text-xs ${setting.decision.required ? "text-black" : "text-muted-foreground"}`}>{explain(setting)}</span>}
      {setting?.warranty && (
        <label className="flex items-center gap-2 text-sm font-medium text-black">Warranty (months)
          <input key={`${setting.warranty.months ?? "auto"}`} aria-label="Warranty months" inputMode="numeric" maxLength={3} disabled={saving} placeholder={`Auto: ${setting.warranty.effective}`}
            defaultValue={setting.warranty.months ?? ""} className="h-9 w-24 border border-garmin-control bg-white px-2 text-sm font-normal tabular-nums focus:border-black focus:outline-none"
            onBlur={event => void changeWarranty(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void changeWarranty(event.currentTarget.value); } }} />
          <span className="text-xs font-normal text-muted-foreground">{setting.warranty.months ? "set on this product" : `${setting.warranty.effective} from categories or the default`}</span>
        </label>
      )}
      {error && <span role="alert" className="text-xs text-garmin-error">{error}</span>}
    </div>
  );
}
