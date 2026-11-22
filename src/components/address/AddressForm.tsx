"use client";

// Reusable Kazakhstan delivery address form with a Yandex map (M8.4). Controlled: the parent owns
// the value and receives every change through onChange (extra fields on the value, such as
// isPrimary, are passed through untouched). Used by the account address book and, next, checkout.
//
// Two-way sync:
// - region/city choice -> the map pans there (from kz-regions, no network);
// - map click / pin drag -> reverse geocode -> region, city and address line are filled;
// - typed address line (debounced, and on blur) -> forward geocode -> the pin moves there;
//   if nothing is found the customer is asked to place the pin, and from then on pin moves fill
//   region/city only: the typed line is never overwritten (precision "manual").
// Without a maps key or when the script fails, the form keeps working without the map.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KZ_REGIONS, findKzCity, getKzRegion, type KzLanguage } from "@/lib/kz-regions";
import {
  MESSAGES,
  PIN_ZOOM,
  applyForward,
  applyReverse,
  chooseCity,
  chooseRegion,
  forwardRequest,
  geocodeViaProxy,
  hasPin,
  mapView,
  placePin,
  regionCodeOf,
  type AddressFormValue,
  type Geocode,
  type PinSource,
} from "@/components/address/address-sync";
import { loadYandexMaps, type YMap, type YPlacemark } from "@/components/address/yandex-maps";

export type { AddressFormValue } from "@/components/address/address-sync";

export interface AddressFormProps<V extends AddressFormValue> {
  value: V;
  onChange: (next: V) => void;
  /** Prefix for element ids (two forms on one page need different prefixes). */
  idPrefix?: string;
  /** UI language for city names, the geocoder and the map. The labels are English like the rest of the site. */
  language?: KzLanguage;
  /** Hide Label (e.g. a one-off checkout address). */
  showLabel?: boolean;
  /** Hide Recipient/Phone when the parent collects the contact elsewhere. */
  showContact?: boolean;
  /** Country of an older saved address, shown with a note that saving moves it to Kazakhstan. */
  legacyCountry?: string;
  disabled?: boolean;
  /** Defaults to NEXT_PUBLIC_YANDEX_MAPS_API_KEY. An empty key shows the form without the map. */
  mapsApiKey?: string;
  /** Defaults to POST /api/geo/geocode. */
  geocode?: Geocode;
}

const SEARCH_DEBOUNCE_MS = 600;
const inputClass = "mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none disabled:bg-neutral-100";
const labelClass = "block text-[12px] font-semibold uppercase tracking-wider text-neutral-600";
const smallButton = "border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
const REGION_OPTIONS = [...KZ_REGIONS.filter(region => region.kind === "city"), ...KZ_REGIONS.filter(region => region.kind === "region").sort((a, b) => a.en.localeCompare(b.en))];

export function AddressForm<V extends AddressFormValue>({
  value, onChange, idPrefix = "address", language = "en", showLabel = true, showContact = true, legacyCountry, disabled = false,
  mapsApiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "", geocode = geocodeViaProxy,
}: AddressFormProps<V>) {
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">(mapsApiKey ? "loading" : "unavailable");
  const [pinSource, setPinSource] = useState<PinSource>(hasPin(value) ? (value.geoPrecision === "manual" ? "manual" : "typed") : "none");
  const [lineLocked, setLineLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Async callbacks (map events, geocoder answers) always read the latest props/state.
  const valueRef = useRef(value), onChangeRef = useRef(onChange), lockedRef = useRef(lineLocked);
  valueRef.current = value; onChangeRef.current = onChange; lockedRef.current = lineLocked;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YMap | null>(null);
  const placemarkRef = useRef<YPlacemark | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceRef = useRef(0);
  const lastSearchRef = useRef<string>("");
  const handlePinRef = useRef<(lat: number, lng: number) => void>(() => undefined);

  const emit = useCallback((next: V) => { valueRef.current = next; onChangeRef.current(next); }, []);
  const pan = useCallback((view: { lat: number; lng: number; zoom: number }) => {
    void mapRef.current?.setCenter([view.lat, view.lng], view.zoom, { duration: 300, checkZoomRange: true });
  }, []);

  // A pin placed by the customer: fill region/city (and the line unless the typed line is kept).
  const handlePin = useCallback(async (lat: number, lng: number) => {
    const sequence = ++sequenceRef.current;
    emit(placePin(valueRef.current, lat, lng));
    setPinSource(lockedRef.current ? "manual" : "map");
    setNotice(null);
    try {
      const result = await geocode({ mode: "reverse", lat, lng, lang: language });
      if (sequence !== sequenceRef.current) return;
      if (result.found) emit(applyReverse(valueRef.current, result.candidates[0], lockedRef.current, language));
      else setNotice(MESSAGES.placeUnknown);
    } catch {
      if (sequence === sequenceRef.current) setNotice(MESSAGES.searchUnavailable);
    }
  }, [emit, geocode, language]);
  handlePinRef.current = (lat, lng) => { void handlePin(lat, lng); };

  // The typed line -> pin. Not found: ask for a pin and keep the typed line from then on.
  const runSearch = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const request = forwardRequest(valueRef.current, language);
    if (!request) return;
    const key = JSON.stringify(request);
    if (key === lastSearchRef.current) return;
    lastSearchRef.current = key;
    const sequence = ++sequenceRef.current;
    setSearching(true);
    try {
      const result = await geocode(request);
      if (sequence !== sequenceRef.current) return;
      if (result.found) {
        const next = applyForward(valueRef.current, result.candidates[0], language);
        emit(next);
        setLineLocked(false); lockedRef.current = false;
        setPinSource("typed"); setNotice(null);
        pan({ lat: result.candidates[0].lat, lng: result.candidates[0].lng, zoom: PIN_ZOOM });
      } else {
        emit({ ...valueRef.current, lat: null, lng: null, geoPrecision: null });
        setLineLocked(true); lockedRef.current = true;
        setPinSource("none"); setNotice(MESSAGES.notFound);
      }
    } catch {
      if (sequence === sequenceRef.current) { lastSearchRef.current = ""; setNotice(MESSAGES.searchUnavailable); }
    } finally {
      if (sequence === sequenceRef.current) setSearching(false);
    }
  }, [emit, geocode, language, pan]);

  // Map: loaded lazily once per page, created when the form mounts, destroyed when it unmounts.
  useEffect(() => {
    if (!mapsApiKey || typeof window === "undefined") return;
    let cancelled = false;
    loadYandexMaps(mapsApiKey, language).then(ymaps => {
      if (cancelled || !containerRef.current) return;
      const view = mapView(valueRef.current);
      const map = new ymaps.Map(containerRef.current, { center: [view.lat, view.lng], zoom: view.zoom, controls: ["zoomControl"] }, { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true });
      // Page scrolling on phones must not get trapped by the map.
      map.behaviors.disable("scrollZoom");
      map.events.add("click", event => { const [lat, lng] = event.get("coords"); handlePinRef.current(lat, lng); });
      const placemark = new ymaps.Placemark([view.lat, view.lng], { hintContent: "Delivery point" }, { draggable: true, preset: "islands#redDotIcon" });
      placemark.events.add("dragend", () => { const [lat, lng] = placemark.geometry.getCoordinates(); handlePinRef.current(lat, lng); });
      if (hasPin(valueRef.current)) map.geoObjects.add(placemark);
      mapRef.current = map; placemarkRef.current = placemark;
      setMapStatus("ready");
    }).catch(() => { if (!cancelled) setMapStatus("unavailable"); });
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null; placemarkRef.current = null;
    };
  }, [mapsApiKey, language]);

  // Keep the placemark on the value's pin (added, moved or removed).
  const pinLat = hasPin(value) ? value.lat : null, pinLng = hasPin(value) ? value.lng : null;
  useEffect(() => {
    const map = mapRef.current, placemark = placemarkRef.current;
    if (!map || !placemark) return;
    map.geoObjects.remove(placemark);
    if (pinLat !== null && pinLng !== null) { placemark.geometry.setCoordinates([pinLat, pinLng]); map.geoObjects.add(placemark); }
  }, [pinLat, pinLng, mapStatus]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const regionCode = regionCodeOf(value);
  const region = getKzRegion(regionCode);
  const cityOptions = useMemo(() => (region?.cities ?? []).map(city => city[language]), [region, language]);
  const legacyRegion = value.region && !regionCode ? value.region : "";
  const id = (name: string) => `${idPrefix}-${name}`;

  const onRegion = (code: string) => {
    const next = chooseRegion(valueRef.current, code, language);
    emit(next);
    if (!hasPin(next)) setPinSource("none");
    pan(mapView(next));
  };
  const onCity = (text: string) => {
    const next = chooseCity(valueRef.current, text);
    emit(next);
    if (!hasPin(next)) setPinSource("none");
    if (findKzCity(regionCodeOf(next), text)) pan(mapView(next));
  };
  const onLine1 = (text: string) => {
    emit({ ...valueRef.current, line1: text });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void runSearch(); }, SEARCH_DEBOUNCE_MS);
  };
  const pinAtArea = () => {
    const view = mapView({ ...valueRef.current, lat: null, lng: null });
    pan({ ...view, zoom: Math.max(view.zoom, 12) });
    void handlePin(view.lat, view.lng);
  };
  const removePin = () => {
    sequenceRef.current++;
    emit({ ...valueRef.current, lat: null, lng: null, geoPrecision: null });
    setPinSource("none");
  };

  return (
    <div className="space-y-3">
      {showLabel && (
        <div>
          <label className={labelClass} htmlFor={id("label")}>Address Title (e.g. Home, Office) *</label>
          <input id={id("label")} name="label" required maxLength={60} disabled={disabled} value={value.label} onChange={e => emit({ ...valueRef.current, label: e.target.value })} className={inputClass} />
        </div>
      )}
      {showContact && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={id("recipient")}>Recipient Name *</label>
            <input id={id("recipient")} name="recipientName" required maxLength={200} autoComplete="name" disabled={disabled} value={value.recipientName} onChange={e => emit({ ...valueRef.current, recipientName: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor={id("phone")}>Contact Phone *</label>
            <input id={id("phone")} name="phone" type="tel" required autoComplete="tel" placeholder="+77001234567" disabled={disabled} value={value.phone} onChange={e => emit({ ...valueRef.current, phone: e.target.value })} className={inputClass} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={id("country")}>Country</label>
          <input id={id("country")} name="country" readOnly value="Kazakhstan" aria-describedby={id("country-note")} className={`${inputClass} bg-neutral-50 text-neutral-700`} />
          <p id={id("country-note")} className="mt-1 text-[11px] text-neutral-500">
            {legacyCountry && legacyCountry !== "KZ" ? `Saved for ${legacyCountry} before. We ship only within Kazakhstan, so saving moves it here.` : "We ship only within Kazakhstan."}
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor={id("region")}>Region *</label>
          <select id={id("region")} name="region" required disabled={disabled} value={regionCode} onChange={e => onRegion(e.target.value)} className={inputClass} aria-describedby={legacyRegion ? id("region-note") : undefined}>
            <option value="">Choose a region</option>
            <optgroup label="Cities of republican significance">
              {REGION_OPTIONS.filter(option => option.kind === "city").map(option => <option key={option.code} value={option.code}>{option[language]}</option>)}
            </optgroup>
            <optgroup label="Regions">
              {REGION_OPTIONS.filter(option => option.kind === "region").map(option => <option key={option.code} value={option.code}>{option[language]}</option>)}
            </optgroup>
          </select>
          {legacyRegion && <p id={id("region-note")} className="mt-1 text-[11px] text-amber-700">Previously saved region: {legacyRegion}. Choose one from the list.</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className={labelClass} htmlFor={id("city")}>City or settlement *</label>
          <input id={id("city")} name="city" required maxLength={120} autoComplete="address-level2" list={id("city-options")} disabled={disabled} value={value.city} onChange={e => onCity(e.target.value)} className={inputClass} placeholder={region ? `e.g. ${region.cities[0][language]}` : "Choose a region first or type"} />
          <datalist id={id("city-options")}>
            {cityOptions.map(name => <option key={name} value={name} />)}
          </datalist>
        </div>
        <div>
          <label className={labelClass} htmlFor={id("postal")}>Postal Code</label>
          <input id={id("postal")} name="postalCode" maxLength={20} inputMode="numeric" autoComplete="postal-code" disabled={disabled} value={value.postalCode ?? ""} onChange={e => emit({ ...valueRef.current, postalCode: e.target.value })} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor={id("line1")}>Street and house *</label>
        <input id={id("line1")} name="line1" required maxLength={200} autoComplete="address-line1" disabled={disabled} value={value.line1} onChange={e => onLine1(e.target.value)} onBlur={() => { void runSearch(); }} aria-describedby={id("search-status")} className={inputClass} placeholder="e.g. Abay Avenue 10" />
        <p id={id("search-status")} aria-live="polite" className={`mt-1 min-h-[16px] text-[12px] ${notice === MESSAGES.notFound ? "font-medium text-amber-800" : notice ? "text-red-700" : "text-neutral-500"}`}>
          {searching ? "Searching the map…" : notice ?? ""}
        </p>
      </div>
      <div>
        <label className={labelClass} htmlFor={id("line2")}>Apartment, entrance, floor (optional)</label>
        <input id={id("line2")} name="line2" maxLength={200} autoComplete="address-line2" disabled={disabled} value={value.line2 ?? ""} onChange={e => emit({ ...valueRef.current, line2: e.target.value })} className={inputClass} />
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className={labelClass} id={id("map-label")}>Delivery point on the map</span>
          {mapStatus === "ready" && <span className="text-[11px] text-neutral-500">Click the map or drag the pin.</span>}
        </div>
        {mapStatus !== "unavailable" ? (
          <div className="relative mt-1 h-60 w-full overflow-hidden border border-neutral-300 bg-neutral-100 sm:h-72">
            <div ref={containerRef} role="region" aria-labelledby={id("map-label")} className="h-full w-full" />
            {mapStatus === "loading" && <p className="absolute inset-0 flex items-center justify-center text-[12px] text-neutral-500">Loading map…</p>}
          </div>
        ) : (
          <p role="note" className="mt-1 border border-neutral-200 bg-neutral-50 p-3 text-[12px] text-neutral-600">{MESSAGES.mapUnavailable}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className="text-[12px] font-medium text-neutral-700">
            {MESSAGES.pin[hasPin(value) ? (pinSource === "none" ? "map" : pinSource) : "none"]}
            {hasPin(value) && <span className="ml-1 font-normal text-neutral-500">({value.lat.toFixed(5)}, {value.lng.toFixed(5)})</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {mapStatus === "ready" && <button type="button" onClick={pinAtArea} disabled={disabled || !region} className={smallButton}>Pin at {region ? (findKzCity(regionCode, value.city)?.[language] ?? region[language]) : "region"}</button>}
            {hasPin(value) && <button type="button" onClick={removePin} disabled={disabled} className={smallButton}>Remove pin</button>}
          </div>
        </div>
        {lineLocked && <p className="mt-1 text-[11px] text-neutral-500">Your typed street stays as entered; the pin fills only the region and city.</p>}
      </div>
    </div>
  );
}
