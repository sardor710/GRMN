"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui";
import type { PickupLocation } from "@/lib/pickup";
import { StorePickupSection } from "./StorePickupSection";
import { ANALYTICS_FIELDS, validateAnalyticsInput, type AnalyticsConfig, type AnalyticsErrors, type AnalyticsField } from "@/lib/analytics/config";

// Task 18B: typed, versioned store settings and the audited KZT-per-USD rate editor (PostgreSQL mode).
// Task 3.1: Payments -> "Demo checkout" (the payment mode): on, checkout offers only the demo method;
// off, only manual payment. DEMO_CHECKOUT_DISABLED=1 on the server forces it off.
// O07 (Task 21C): the payment instructions shown to manual-payment customers and the hold time.
// Task 5.1: Google & analytics: GA4 / GTM ids and Search Console / Yandex Webmaster tokens. Checked here with the
// same rules as the server (inline field errors); saving replaces the stored set, and a blank field is unset.

interface Settings {
  version: number; storeName: string | null; contactEmail: string | null; supportPhone: string | null; baseCurrency: string;
  usdDisplayEnabled: boolean; exchangeRate: { version: number; kztPerUsd: string; createdAt: string } | null;
  freeShippingThresholdMinor: string | null; maintenanceMode: boolean; paymentMode: "demo" | "live"; seoTitle: string | null; seoDescription: string | null;
  manualPayment: { instructions: string | null; holdHours: number };
  demoCheckout: { enabled: boolean; forcedOff: boolean };
  analytics?: AnalyticsConfig;
  pickupLocation?: PickupLocation;
}
const GOOGLE_FIELDS: Record<AnalyticsField, { label: string; placeholder: string; help: string }> = {
  ga4Id: { label: "GA4 measurement id", placeholder: "G-ABC123XYZ", help: "Google Analytics ▸ Admin ▸ Data streams ▸ your web stream. Loads gtag.js on the storefront unless a Tag Manager container is set." },
  gtmId: { label: "Tag Manager container id", placeholder: "GTM-ABC1234", help: "When set, only Tag Manager loads: configure GA4 inside the container (ecommerce events arrive in its dataLayer)." },
  googleVerification: { label: "Google Search Console token", placeholder: "the content value only", help: "Search Console ▸ HTML tag method: paste the content=\"…\" value of the google-site-verification tag, not the whole tag." },
  yandexVerification: { label: "Yandex Webmaster token", placeholder: "the content value only", help: "Yandex Webmaster ▸ Meta tag method: paste the content=\"…\" value of the yandex-verification tag." },
};
const googleForm = (config: AnalyticsConfig | undefined): Record<AnalyticsField, string> =>
  ({ ga4Id: config?.ga4Id ?? "", gtmId: config?.gtmId ?? "", googleVerification: config?.googleVerification ?? "", yandexVerification: config?.yandexVerification ?? "" });
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
  const [google, setGoogle] = useState(googleForm(undefined));
  const [googleErrors, setGoogleErrors] = useState<AnalyticsErrors>({});

  function apply(next: Settings) {
    setSettings(next);
    setForm({ storeName: next.storeName ?? "", contactEmail: next.contactEmail ?? "", supportPhone: next.supportPhone ?? "", seoTitle: next.seoTitle ?? "", seoDescription: next.seoDescription ?? "",
      threshold: next.freeShippingThresholdMinor === null ? "" : (Number(next.freeShippingThresholdMinor) / 100).toFixed(2), usd: next.usdDisplayEnabled, maintenance: next.maintenanceMode });
    setManual({ instructions: next.manualPayment.instructions ?? "", holdHours: String(next.manualPayment.holdHours) });
    setGoogle(googleForm(next.analytics));
  }
  function saveGoogle() {
    if (!settings) return;
    const { config, errors } = validateAnalyticsInput(google);
    setGoogleErrors(errors);
    if (Object.keys(errors).length) { setMessage({ kind: "error", text: "Fix the highlighted Google & analytics fields" }); return; }
    void send("PUT", { expectedVersion: settings.version, analytics: config }, "Google settings saved");
  }
  function saveManual() {
    if (!settings) return;
    const hours = Number(manual.holdHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) { setMessage({ kind: "error", text: "The hold must be a whole number of hours from 1 to 168" }); return; }
    void send("PUT", { expectedVersion: settings.version, manualPaymentInstructions: manual.instructions.trim(), manualPaymentHoldHours: hours }, "Payment instructions saved");
  }
  useEffect(() => { fetch("/api/admin/settings", { cache: "no-store" }).then(r => json<Settings>(r)).then(apply).catch(reason => setMessage({ kind: "error", text: (reason as Error).message })); }, []);

  // Final review M10: the demo toggle updates only the settings record (and so its version); it never
  // overwrites unsaved edits in the general and manual-payment forms, which apply() would reset.
  async function send(method: "PUT" | "POST", body: Record<string, unknown>, done: string, recordOnly = false) {
    setBusy(true); setMessage(null);
    try { const next = await json<Settings>(await fetch("/api/admin/settings", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })); if (recordOnly) setSettings(next); else apply(next); setMessage({ kind: "ok", text: done }); }
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
    <label className="block text-sm"><span className="block font-bold">{label}</span>
      <input className="mt-1 w-full h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none" value={form[key]} placeholder={placeholder} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>
  );

  if (!settings) return <div>{message ? <p role="alert" className="text-sm text-garmin-error">{message.text}</p> : <p className="text-sm text-muted-foreground">Loading settings…</p>}</div>;
  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="g-heading g-h2 text-black">Settings</h1><p className="text-sm text-muted-foreground">Version {settings.version} · base currency {settings.baseCurrency} · payment mode {settings.paymentMode}</p></div>
      {message && <p role={message.kind === "error" ? "alert" : "status"} className={`border p-3 text-sm ${message.kind === "error" ? "border-garmin-error text-garmin-error" : "border-black text-black"}`}>{message.text}</p>}
      <section className="grid gap-4 border border-garmin-control p-4 sm:grid-cols-2">
        {field("Store name", "storeName")}{field("Contact e-mail", "contactEmail")}{field("Support phone", "supportPhone", "+77001234567")}{field("Free shipping from (KZT)", "threshold", "50000.00")}
        {field("SEO title", "seoTitle")}{field("SEO description", "seoDescription")}
        <label className="g-checkbox-label"><input className="g-checkbox" type="checkbox" checked={form.usd} onChange={event => setForm(current => ({ ...current, usd: event.target.checked }))} /> Show USD equivalents</label>
        <label className="g-checkbox-label"><input className="g-checkbox" type="checkbox" checked={form.maintenance} onChange={event => setForm(current => ({ ...current, maintenance: event.target.checked }))} /> Maintenance mode</label>
        <Button variant="primary" size="md" className="justify-self-start sm:col-span-2" type="button" disabled={busy} onClick={save}>Save settings</Button>
      </section>
      {settings.pickupLocation && <StorePickupSection value={settings.pickupLocation} busy={busy} onSave={pickupLocation => void send("PUT", { expectedVersion: settings.version, pickupLocation }, "Store pickup saved", true)} />}
      <section className="space-y-3 border border-garmin-control p-4" aria-labelledby="settings-google-heading">
        <h2 id="settings-google-heading" className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Google & analytics</h2>
        <p className="text-sm text-muted-foreground">The storefront loads only what is set here; admin pages never load tags. Leave a field empty to turn it off. Changes show on the next storefront page load.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ANALYTICS_FIELDS.map(key => {
            const id = `settings-${key}`, error = googleErrors[key], meta = GOOGLE_FIELDS[key];
            return (
              <div key={key} className="text-sm">
                <label htmlFor={id} className="block font-bold">{meta.label}</label>
                <input id={id} name={key} autoComplete="off" spellCheck={false} placeholder={meta.placeholder} value={google[key]}
                  aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}
                  className={`mt-1 w-full h-10 border bg-white px-3 text-sm text-black focus:border-black focus:outline-none ${error ? "border-garmin-error" : "border-garmin-control"}`}
                  onChange={event => { const value = event.target.value; setGoogle(current => ({ ...current, [key]: value })); setGoogleErrors(current => { const rest = { ...current }; delete rest[key]; return rest; }); }} />
                {error && <p id={`${id}-error`} className="mt-1 text-sm text-garmin-error">{error}</p>}
                <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">{meta.help}</p>
              </div>
            );
          })}
        </div>
        {google.gtmId.trim() && google.ga4Id.trim() && <p role="note" className="border border-garmin-control bg-muted p-2.5 text-sm text-black">Tag Manager is set, so the GA4 id above is not loaded directly. Add a Google tag with this GA4 id inside the container instead.</p>}
        <Button variant="secondary" size="md" type="button" disabled={busy} onClick={saveGoogle}>Save Google settings</Button>
      </section>
      <section className="space-y-3 border border-garmin-control p-4">
        <h2 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Payments</h2>
        <label className="g-checkbox-label font-bold">
          <input className="g-checkbox" type="checkbox" name="demoCheckout" checked={settings.paymentMode === "demo"} disabled={busy}
            onChange={event => void send("PUT", { expectedVersion: settings.version, paymentMode: event.target.checked ? "demo" : "live" }, event.target.checked ? "Demo checkout turned on" : "Demo checkout turned off", true)} />
          Demo checkout
        </label>
        <p className="text-sm text-muted-foreground">While demo checkout is on, customers can only place demo orders: no real money is taken and manual payment is not offered. Turn it off to take real orders with manual payment.</p>
        {settings.demoCheckout.forcedOff && <p role="status" className="border border-garmin-control bg-muted p-2.5 text-sm text-black">The server sets DEMO_CHECKOUT_DISABLED=1, so demo checkout is off whatever this setting says.</p>}
        <p className="text-sm">Checkout now offers: <span className="block font-bold">{settings.demoCheckout.enabled ? "demo orders only" : "manual payment only"}</span></p>
      </section>
      <section className="space-y-3 border border-garmin-control p-4">
        <h2 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Manual payment</h2>
        <p className="text-sm text-muted-foreground">Shown on the receipt while an order awaits payment. Staff confirm each payment on the order page. Unpaid orders expire, and their stock is released, when the hold ends.</p>
        <label className="block text-sm"><span className="block font-bold">Payment instructions</span>
          <textarea name="manualPaymentInstructions" rows={5} maxLength={2000} className="mt-1 w-full border border-garmin-control px-3 py-2 text-sm font-normal focus:border-black focus:outline-none" placeholder="Kaspi: +7 … · Bank transfer: IBAN …, put your order number in the reference"
            value={manual.instructions} onChange={event => setManual(current => ({ ...current, instructions: event.target.value }))} /></label>
        <label className="block text-sm"><span className="block font-bold">Hold unpaid orders for (hours)</span>
          <input name="manualPaymentHoldHours" type="number" min={1} max={168} className="mt-1 w-32 h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none tabular-nums" value={manual.holdHours} onChange={event => setManual(current => ({ ...current, holdHours: event.target.value }))} /></label>
        <Button variant="secondary" size="md" type="button" disabled={busy} onClick={saveManual}>Save payment instructions</Button>
      </section>
      <section className="space-y-3 border border-garmin-control p-4">
        <h2 className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">USD display rate</h2>
        <p className="text-sm">{settings.exchangeRate ? `Current: ${settings.exchangeRate.kztPerUsd} KZT per 1 USD (version ${settings.exchangeRate.version}, ${new Date(settings.exchangeRate.createdAt).toLocaleString("en-GB")})` : "No rate set: USD equivalents are hidden."}</p>
        <p className="text-sm text-muted-foreground">Display only. Payable amounts stay in KZT, and past quotes, orders and refunds keep the rate they were shown with.</p>
        <div className="flex gap-2">
          <input aria-label="KZT per USD" className="h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none w-40 tabular-nums" value={rate} placeholder="498.25" onChange={event => setRate(event.target.value)} />
          <Button variant="outline" size="md" type="button" disabled={busy || !rate.trim()} onClick={() => void send("POST", { action: "set_exchange_rate", expectedVersion: settings.version, kztPerUsd: rate.trim() }, "Rate saved")}>Save rate</Button>
        </div>
      </section>
    </div>
  );
}
