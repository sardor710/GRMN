"use client";

import { useEffect, useState } from "react";

// Task 18B: typed, versioned store settings and the audited KZT-per-USD rate editor (PostgreSQL mode).
// The payment mode is shown but cannot be changed here (demo until a provider is activated).
// O07 (Task 21C): the payment instructions shown to manual-payment customers and the hold time.

interface Settings {
  version: number; storeName: string | null; contactEmail: string | null; supportPhone: string | null; baseCurrency: string;
  usdDisplayEnabled: boolean; exchangeRate: { version: number; kztPerUsd: string; createdAt: string } | null;
  freeShippingThresholdMinor: string | null; maintenanceMode: boolean; paymentMode: string; seoTitle: string | null; seoDescription: string | null;
  manualPayment: { instructions: string | null; holdHours: number };
}
async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}
const toMinor = (value: string) => { const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(value.trim()); return match ? String(BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"))) : null; };

export default function StoreSettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ storeName: "", contactEmail: "", supportPhone: "", seoTitle: "", seoDescription: "", threshold: "", usd: false, maintenance: true });
  const [rate, setRate] = useState("");
  const [manual, setManual] = useState({ instructions: "", holdHours: "48" });
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function apply(next: Settings) {
    setSettings(next);
    setForm({ storeName: next.storeName ?? "", contactEmail: next.contactEmail ?? "", supportPhone: next.supportPhone ?? "", seoTitle: next.seoTitle ?? "", seoDescription: next.seoDescription ?? "",
      threshold: next.freeShippingThresholdMinor === null ? "" : (Number(next.freeShippingThresholdMinor) / 100).toFixed(2), usd: next.usdDisplayEnabled, maintenance: next.maintenanceMode });
    setManual({ instructions: next.manualPayment.instructions ?? "", holdHours: String(next.manualPayment.holdHours) });
  }
  function saveManual() {
    if (!settings) return;
    const hours = Number(manual.holdHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) { setMessage({ kind: "error", text: "The hold must be a whole number of hours from 1 to 168" }); return; }
    void send("PUT", { expectedVersion: settings.version, manualPaymentInstructions: manual.instructions.trim(), manualPaymentHoldHours: hours }, "Payment instructions saved");
  }
  useEffect(() => { fetch("/api/admin/settings", { cache: "no-store" }).then(r => json<Settings>(r)).then(apply).catch(reason => setMessage({ kind: "error", text: (reason as Error).message })); }, []);

  async function send(method: "PUT" | "POST", body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage(null);
    try { apply(await json<Settings>(await fetch("/api/admin/settings", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))); setMessage({ kind: "ok", text: done }); }
    catch (reason) { setMessage({ kind: "error", text: (reason as Error).message }); } finally { setBusy(false); }
  }
  function save() {
    if (!settings) return;
    const threshold = form.threshold.trim() === "" ? null : toMinor(form.threshold);
    if (threshold === null && form.threshold.trim() !== "") { setMessage({ kind: "error", text: "Enter the free-shipping threshold in KZT, e.g. 50000.00" }); return; }
    void send("PUT", { expectedVersion: settings.version, storeName: form.storeName || undefined, contactEmail: form.contactEmail, supportPhone: form.supportPhone, seoTitle: form.seoTitle, seoDescription: form.seoDescription,
      freeShippingThresholdMinor: threshold, usdDisplayEnabled: form.usd, maintenanceMode: form.maintenance }, "Settings saved");
  }
  const field = (label: string, key: "storeName" | "contactEmail" | "supportPhone" | "seoTitle" | "seoDescription" | "threshold", placeholder = "") => (
    <label className="block text-sm"><span className="text-xs font-bold uppercase tracking-wider text-neutral-600">{label}</span>
      <input className="mt-1 w-full border border-neutral-300 px-2 py-1" value={form[key]} placeholder={placeholder} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>
  );

  if (!settings) return <div className="p-6">{message ? <p role="alert" className="text-sm text-red-800">{message.text}</p> : <p className="text-sm text-neutral-500">Loading settings…</p>}</div>;
  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div><h1 className="text-2xl font-bold text-black">Store settings</h1><p className="text-sm text-neutral-500">Version {settings.version} · base currency {settings.baseCurrency} · payment mode {settings.paymentMode}</p></div>
      {message && <p role={message.kind === "error" ? "alert" : "status"} className={`border p-3 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{message.text}</p>}
      <section className="grid gap-3 border border-neutral-200 p-4 sm:grid-cols-2">
        {field("Store name", "storeName")}{field("Contact e-mail", "contactEmail")}{field("Support phone", "supportPhone", "+77001234567")}{field("Free shipping from (KZT)", "threshold", "50000.00")}
        {field("SEO title", "seoTitle")}{field("SEO description", "seoDescription")}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.usd} onChange={event => setForm(current => ({ ...current, usd: event.target.checked }))} /> Show USD equivalents</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.maintenance} onChange={event => setForm(current => ({ ...current, maintenance: event.target.checked }))} /> Maintenance mode</label>
        <button type="button" disabled={busy} onClick={save} className="bg-black px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 sm:col-span-2">Save settings</button>
      </section>
      <section className="space-y-2 border border-neutral-200 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-600">Manual payment</h2>
        <p className="text-xs text-neutral-500">Shown on the receipt while an order awaits payment. Staff confirm each payment on the order page. Unpaid orders expire, and their stock is released, when the hold ends.</p>
        <label className="block text-sm"><span className="text-xs font-bold uppercase tracking-wider text-neutral-600">Payment instructions</span>
          <textarea name="manualPaymentInstructions" rows={5} maxLength={2000} className="mt-1 w-full border border-neutral-300 px-2 py-1" placeholder="Kaspi: +7 … · Bank transfer: IBAN …, put your order number in the reference"
            value={manual.instructions} onChange={event => setManual(current => ({ ...current, instructions: event.target.value }))} /></label>
        <label className="block text-sm"><span className="text-xs font-bold uppercase tracking-wider text-neutral-600">Hold unpaid orders for (hours)</span>
          <input name="manualPaymentHoldHours" type="number" min={1} max={168} className="mt-1 w-32 border border-neutral-300 px-2 py-1" value={manual.holdHours} onChange={event => setManual(current => ({ ...current, holdHours: event.target.value }))} /></label>
        <button type="button" disabled={busy} onClick={saveManual} className="border border-black px-3 py-1 text-xs font-bold uppercase disabled:opacity-50">Save payment instructions</button>
      </section>
      <section className="space-y-2 border border-neutral-200 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-600">USD display rate</h2>
        <p className="text-sm">{settings.exchangeRate ? `Current: ${settings.exchangeRate.kztPerUsd} KZT per 1 USD (version ${settings.exchangeRate.version}, ${new Date(settings.exchangeRate.createdAt).toLocaleString("en-GB")})` : "No rate set: USD equivalents are hidden."}</p>
        <p className="text-xs text-neutral-500">Display only. Payable amounts stay in KZT, and past quotes, orders and refunds keep the rate they were shown with.</p>
        <div className="flex gap-2">
          <input aria-label="KZT per USD" className="border border-neutral-300 px-2 py-1 text-sm" value={rate} placeholder="498.25" onChange={event => setRate(event.target.value)} />
          <button type="button" disabled={busy || !rate.trim()} onClick={() => void send("POST", { action: "set_exchange_rate", expectedVersion: settings.version, kztPerUsd: rate.trim() }, "Rate saved")} className="border border-black px-3 py-1 text-xs font-bold uppercase disabled:opacity-50">Save rate</button>
        </div>
      </section>
    </div>
  );
}
