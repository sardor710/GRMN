"use client";

// 0033 (owner 2026-11-26): Settings ▸ Store pickup. The one store customers can choose at checkout: on/off, name,
// address and opening hours in EN/RU/KK, phone and an optional map pin. Orders keep a copy of what was set when
// they were placed, so editing this never changes an existing order.
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui";
import { pickupLocationSchema, pickupMapUrl, type PickupLocation, type PickupText } from "@/lib/pickup";

const LOCALES = [{ key: "en", label: "English" }, { key: "ru", label: "Русский" }, { key: "kk", label: "Қазақша" }] as const;
const input = "mt-1 w-full h-10 border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none";
type Form = Omit<PickupLocation, "lat" | "lng"> & { lat: string; lng: string };
const toForm = (value: PickupLocation): Form => ({ ...value, lat: value.lat === null ? "" : String(value.lat), lng: value.lng === null ? "" : String(value.lng) });

export function StorePickupSection({ value, busy, onSave }: { value: PickupLocation; busy: boolean; onSave: (next: PickupLocation) => void }) {
  const [form, setForm] = useState<Form>(toForm(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setForm(toForm(value)); }, [value]);

  const text = (field: "name" | "address" | "hours", locale: keyof PickupText, next: string) => setForm(current => ({ ...current, [field]: { ...current[field], [locale]: next } }));
  function save() {
    const coordinate = (raw: string) => raw.trim() === "" ? null : Number(raw.replace(",", "."));
    const candidate = { ...form, phone: form.phone.trim(), lat: coordinate(form.lat), lng: coordinate(form.lng) };
    const parsed = pickupLocationSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues.some(issue => issue.message.includes("both")) ? "Set both map coordinates or leave both empty." : "Fill the store name, address and hours in all three languages; the phone may be empty.");
      return;
    }
    setError(null);
    onSave(parsed.data);
  }

  return (
    <section className="space-y-3 border border-garmin-control p-4" aria-labelledby="settings-pickup-heading">
      <h2 id="settings-pickup-heading" className="font-sans mb-3 border-b border-garmin-rule pb-2.5 text-sm font-medium tracking-[0.64px] text-black">Store pickup</h2>
      <label className="g-checkbox-label font-bold">
        <input className="g-checkbox" type="checkbox" name="pickupEnabled" checked={form.enabled} onChange={event => setForm(current => ({ ...current, enabled: event.target.checked }))} />
        Offer “Pick up at store” at checkout
      </label>
      <p className="text-sm text-muted-foreground">Pickup orders are paid at checkout and cost no shipping. On the order board they go New → Ready for pickup → Picked up. Customers see this store on checkout and on their order.</p>
      {(["name", "address", "hours"] as const).map(field => (
        <fieldset key={field} className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-bold">{field === "name" ? "Store name" : field === "address" ? "Address" : "Opening hours"}</legend>
          {LOCALES.map(locale => (
            <label key={locale.key} className="block text-xs text-muted-foreground">{locale.label}
              <input name={`pickup-${field}-${locale.key}`} className={input} value={form[field][locale.key]} onChange={event => text(field, locale.key, event.target.value)} />
            </label>
          ))}
        </fieldset>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm"><span className="block font-bold">Store phone</span>
          <input name="pickup-phone" className={input} placeholder="+7 727 000 00 00" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></label>
        <label className="block text-sm"><span className="block font-bold">Map latitude</span>
          <input name="pickup-lat" inputMode="decimal" className={`${input} tabular-nums`} placeholder="43.2389" value={form.lat} onChange={event => setForm(current => ({ ...current, lat: event.target.value }))} /></label>
        <label className="block text-sm"><span className="block font-bold">Map longitude</span>
          <input name="pickup-lng" inputMode="decimal" className={`${input} tabular-nums`} placeholder="76.9455" value={form.lng} onChange={event => setForm(current => ({ ...current, lng: event.target.value }))} /></label>
      </div>
      <p className="text-xs text-muted-foreground">Without coordinates the “Open in maps” link searches the Russian address. <a className="underline" href={pickupMapUrl({ address: form.address, lat: value.lat, lng: value.lng })} target="_blank" rel="noreferrer">Check the saved store on the map</a></p>
      {error && <p role="alert" className="text-sm text-garmin-error">{error}</p>}
      <Button variant="secondary" size="md" type="button" disabled={busy} onClick={save}>Save store pickup</Button>
    </section>
  );
}
