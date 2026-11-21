// Pure state rules for AddressForm (M8.4): how region/city choices, map pins and geocoder answers
// change the address value. Kept free of React and the map so they can be unit tested directly.
import type { GeoPrecision } from "../../contracts/commerce.ts";
import type { GeocodeCandidate, GeocodeLanguage, GeocodeRequest, GeocodeResult } from "../../contracts/geo.ts";
import { findKzCity, findKzCityAnywhere, getKzRegion, KZ_CITY_ZOOM, KZ_DEFAULT_VIEW, resolveKzRegion, type KzLanguage } from "../../lib/kz-regions.ts";

export interface AddressFormValue {
  label: string;
  recipientName: string;
  phone: string;
  countryCode: string;
  region?: string;
  city: string;
  line1: string;
  line2?: string;
  postalCode?: string;
  lat?: number | null;
  lng?: number | null;
  geoPrecision?: GeoPrecision | null;
}

/** typed = pin from the typed address; map = pin placed on the map, fields filled from it; manual = pin placed after the typed address was not found (line kept). */
export type PinSource = "none" | "typed" | "map" | "manual";

export const MESSAGES = {
  notFound: "We couldn't find this address on the map. Please place the pin on your location.",
  searchUnavailable: "Address search is unavailable right now. You can place the pin on the map yourself.",
  placeUnknown: "We couldn't identify this place. Check the region and city.",
  mapUnavailable: "The map is unavailable right now. You can still enter the address by hand.",
  pin: { none: "No pin yet: click the map or type the address.", typed: "Pin from typed address", map: "Pin placed on the map", manual: "Pin placed manually" } satisfies Record<PinSource, string>,
} as const;

export const PIN_ZOOM = 16;
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function hasPin(value: AddressFormValue): value is AddressFormValue & { lat: number; lng: number } {
  return typeof value.lat === "number" && typeof value.lng === "number";
}

/** The region code a stored value means (codes, or legacy names such as "Алматинская область"). */
export function regionCodeOf(value: AddressFormValue): string {
  return getKzRegion(value.region)?.code ?? resolveKzRegion(value.region)?.code ?? "";
}

/** Where the map should look: the pin, else the chosen city, else the region, else all of Kazakhstan. */
export function mapView(value: AddressFormValue): { lat: number; lng: number; zoom: number } {
  if (hasPin(value)) return { lat: value.lat, lng: value.lng, zoom: PIN_ZOOM };
  const code = regionCodeOf(value);
  const city = findKzCity(code, value.city);
  if (city) return { lat: city.lat, lng: city.lng, zoom: KZ_CITY_ZOOM };
  const region = getKzRegion(code);
  return region ? { lat: region.lat, lng: region.lng, zoom: region.zoom } : { ...KZ_DEFAULT_VIEW };
}

const withoutPin = <V extends AddressFormValue>(value: V): V => ({ ...value, lat: null, lng: null, geoPrecision: null });

/** Choosing a region: a city of republican significance fills the city; another region keeps only its own listed city. A pin elsewhere is dropped. */
export function chooseRegion<V extends AddressFormValue>(value: V, code: string, language: KzLanguage = "en"): V {
  const region = getKzRegion(code);
  if (!region) return withoutPin({ ...value, region: "" });
  const keepCity = findKzCity(region.code, value.city);
  const city = region.kind === "city" ? region.cities[0][language] : keepCity ? value.city : "";
  const sameRegion = regionCodeOf(value) === region.code;
  const next = { ...value, region: region.code, city };
  return sameRegion ? next : withoutPin(next);
}

/** Typing or picking a city: with no region chosen yet, a listed city also sets its region. A pin stays only while the city is unchanged. */
export function chooseCity<V extends AddressFormValue>(value: V, city: string): V {
  const owner = regionCodeOf(value) ? undefined : findKzCityAnywhere(city);
  const next = { ...value, city, ...(owner ? { region: owner.region.code } : {}) };
  return city.trim() === value.city.trim() ? next : withoutPin(next);
}

/** A pin the customer put on the map (click, drag or "pin at city"), before the reverse answer arrives. */
export function placePin<V extends AddressFormValue>(value: V, lat: number, lng: number): V {
  return { ...value, lat: round6(lat), lng: round6(lng), geoPrecision: "manual" };
}

/**
 * Reverse answer for a pin. Region and city always follow the pin. The address line is filled only
 * while the typed address has not failed (keepLine false) and the place has a street.
 */
export function applyReverse<V extends AddressFormValue>(value: V, candidate: GeocodeCandidate, keepLine: boolean, language: KzLanguage = "en"): V {
  const region = getKzRegion(candidate.regionCode);
  const city = region?.kind === "city" ? region.cities[0][language] : candidate.city;
  const fillLine = !keepLine && candidate.line1 !== "" && candidate.precision !== "locality";
  return {
    ...value,
    ...(region ? { region: region.code } : {}),
    ...(city ? { city } : {}),
    ...(fillLine ? { line1: candidate.line1 } : {}),
    lat: round6(candidate.lat), lng: round6(candidate.lng),
    geoPrecision: fillLine ? candidate.precision as GeoPrecision : "manual",
  };
}

/** Forward answer for the typed line: the pin moves there; region and city follow it; the typed line is never rewritten. */
export function applyForward<V extends AddressFormValue>(value: V, candidate: GeocodeCandidate, language: KzLanguage = "en"): V {
  const region = getKzRegion(candidate.regionCode);
  const sameRegion = Boolean(region) && regionCodeOf(value) === region?.code;
  const found = region?.kind === "city" ? region.cities[0][language] : candidate.city;
  // Keep the customer's city while the answer stays in their region; otherwise follow the answer.
  const city = sameRegion && value.city.trim() && region?.kind !== "city" ? value.city : found || (sameRegion ? value.city : "");
  return {
    ...value,
    ...(region ? { region: region.code, city } : {}),
    lat: round6(candidate.lat), lng: round6(candidate.lng),
    geoPrecision: candidate.precision === "locality" ? "manual" : candidate.precision as GeoPrecision,
  };
}

/** The forward request for the typed line, biased to the chosen region and city; null when too short to search. */
export function forwardRequest(value: AddressFormValue, language: GeocodeLanguage = "en"): Extract<GeocodeRequest, { mode: "forward" }> | null {
  const text = value.line1.trim();
  if (text.length < 3) return null;
  const regionCode = regionCodeOf(value);
  return { mode: "forward", text: text.slice(0, 300), lang: language, ...(regionCode ? { regionCode } : {}), ...(value.city.trim() ? { city: value.city.trim().slice(0, 120) } : {}) };
}

export type Geocode = (request: GeocodeRequest) => Promise<GeocodeResult>;

/** Browser call to the same-origin proxy. Throws on any failure so the form can say so. */
export const geocodeViaProxy: Geocode = async request => {
  const response = await fetch("/api/geo/geocode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), cache: "no-store" });
  if (!response.ok) throw new Error(`Geocoder ${response.status}`);
  return await response.json() as GeocodeResult;
};
