import "server-only";
import { findKzCity, findKzCityAnywhere, getKzRegion, isInsideKazakhstan, KZ_BBOX, resolveKzRegion, type KzLanguage } from "../../lib/kz-regions.ts";
import type { GeocodeCandidate, GeocodeLanguage, GeocodeResult } from "../../contracts/geo.ts";

// M8.3: Yandex HTTP Geocoder 1.x (https://yandex.com/dev/geocode/doc/en/) behind our own route, so
// the key stays on the server, every result is limited to Kazakhstan and the response carries only
// address parts the form needs. Nothing here logs the key, the query or the coordinates.

export const YANDEX_GEOCODER_URL = "https://geocode-maps.yandex.ru/1.x/";
export const GEOCODER_TIMEOUT_MS = 4000;
export const MAX_GEOCODE_TEXT = 300;
const NEAR_PIN_KM = 1;
const SETTLEMENT_KM = 30;
const STREET_PRECISIONS =new Set(["exact", "number", "near", "range", "street"]);
const EXACT_PRECISIONS = new Set(["exact", "number", "near"]);

export class GeocoderUnavailable extends Error {
  constructor() { super("The map search is unavailable right now"); this.name = "GeocoderUnavailable"; }
}

export interface ForwardQuery { text: string; lang: GeocodeLanguage; regionCode?: string; city?: string }
export interface ReverseQuery { lat: number; lng: number; lang: GeocodeLanguage }
type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface YandexComponent { kind?: unknown; name?: unknown }
interface YandexGeoObject {
  Point?: { pos?: unknown };
  metaDataProperty?: { GeocoderMetaData?: { precision?: unknown; kind?: unknown; text?: unknown; Address?: { country_code?: unknown; formatted?: unknown; Components?: unknown } } };
}

const yandexLang = (lang: GeocodeLanguage) => lang === "en" ? "en_US" : "ru_RU";
const uiLanguage = (lang: GeocodeLanguage): KzLanguage => lang === "en" ? "en" : "ru";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** Strips "City of" / "город" style prefixes from a Yandex locality; villages keep their "село" word. */
export function cleanLocality(name: string): string {
  return name.replace(/^(city of|town of|город)\s+/i, "").replace(/\s+settlement$/i, "").trim();
}

/** Maps one Yandex GeoObject to a Kazakhstan candidate, or null when it is outside Kazakhstan. */
export function mapGeoObject(object: YandexGeoObject, lang: GeocodeLanguage): GeocodeCandidate | null {
  const meta = object.metaDataProperty?.GeocoderMetaData;
  const [lngText, latText] = text(object.Point?.pos).split(/\s+/);
  const lat = Number(latText), lng = Number(lngText);
  if (!meta || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const countryCode = text(meta.Address?.country_code).toUpperCase();
  if ((countryCode && countryCode !== "KZ") || !isInsideKazakhstan(lat, lng)) return null;
  const components = (Array.isArray(meta.Address?.Components) ? meta.Address.Components as YandexComponent[] : [])
    .map(component => ({ kind: text(component.kind), name: text(component.name) })).filter(component => component.kind && component.name);
  if (!countryCode && !components.some(component => component.kind === "country" && /kazakhstan|казахстан/i.test(component.name))) return null;

  const provinces = components.filter(component => component.kind === "province").map(component => component.name);
  const localityIndex = components.findIndex(component => component.kind === "locality");
  const locality = localityIndex >= 0 ? components[localityIndex].name : "";
  let region = [...provinces].reverse().map(name => resolveKzRegion(name)).find(Boolean);
  if (!region && locality) region = findKzCityAnywhere(locality)?.region;
  const known = region && locality ? findKzCity(region.code, locality) : undefined;
  const city = known ? known[uiLanguage(lang)] : locality ? cleanLocality(locality) : "";

  const street = components.find(component => component.kind === "street")?.name ?? "";
  const house = components.find(component => component.kind === "house")?.name ?? "";
  const afterLocality = localityIndex >= 0 ? components.slice(localityIndex + 1) : components;
  const district = [...afterLocality].reverse().find(component => component.kind === "district")?.name ?? "";
  const line1 = street ? [street, house].filter(Boolean).join(", ") : house ? [district, house].filter(Boolean).join(", ") : "";

  const yandexPrecision = text(meta.precision);
  const precision: GeocodeCandidate["precision"] = EXACT_PRECISIONS.has(yandexPrecision) ? "exact" : STREET_PRECISIONS.has(yandexPrecision) ? "street" : "locality";
  return {
    regionCode: region?.code ?? null,
    city,
    line1,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    precision,
    formatted: text(meta.Address?.formatted) || text(meta.text),
  };
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const CYRILLIC: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};
const GENERIC_WORDS = new Set(["ulitsa", "ul", "prospekt", "pr", "pr-t", "avenue", "ave", "street", "str", "st", "dom", "kv", "kvartira", "house", "apt", "apartment", "gorod", "city", "kazakhstan", "kazakstan", "respublika", "oblast", "region"]);

/** Latin-transliterated words (3+ letters) of a place text, without street-type words. */
export function placeWords(value: string): string[] {
  const latin = value.toLowerCase().replace(/[а-яёәғқңөұүһі]/g, letter => CYRILLIC[letter] ?? letter).replace(/dzh/g, "j").replace(/zh/g, "j");
  // y/i and the soft sign differ between Yandex's English and Russian spellings (Baitursynov/Байтурсынова).
  return latin.split(/[^a-z]+/).filter(word => word.length >= 3 && !GENERIC_WORDS.has(word)).map(word => word.replace(/y/g, "i"));
}

/**
 * Yandex answers fuzzy text with its best guess ("фывапролд 77" -> "Al-Farabi Avenue, 77"). A match
 * counts only when a word the customer typed, other than the matched settlement's own name (Yandex
 * always finds the city itself), appears in the result.
 */
export function matchesTypedText(typed: string, candidate: GeocodeCandidate): boolean {
  const known = candidate.regionCode ? findKzCity(candidate.regionCode, candidate.city) : undefined;
  const ignore = new Set([candidate.city, ...(known ? [known.en, known.ru, known.kk, ...(known.aliases ?? [])] : [])].flatMap(placeWords));
  const wanted = placeWords(typed).filter(word => !ignore.has(word));
  if (!wanted.length) return false;
  const found = placeWords(`${candidate.line1} ${candidate.formatted}`);
  return wanted.some(word => found.some(other => other.slice(0, 4) === word.slice(0, 4)));
}

function members(body: unknown): YandexGeoObject[] {
  const collection = (body as { response?: { GeoObjectCollection?: { featureMember?: unknown } } } | null)?.response?.GeoObjectCollection;
  if (!collection) throw new GeocoderUnavailable();
  const list = Array.isArray(collection.featureMember) ? collection.featureMember as { GeoObject?: YandexGeoObject }[] : [];
  return list.map(item => item.GeoObject).filter((item): item is YandexGeoObject => Boolean(item));
}

export function createYandexGeocoder({ apiKey, fetcher = fetch as unknown as FetchLike, timeoutMs = GEOCODER_TIMEOUT_MS }: { apiKey: string; fetcher?: FetchLike; timeoutMs?: number }) {
  if (!apiKey) throw new Error("Geocoder key is missing");

  async function request(params: Record<string, string>): Promise<YandexGeoObject[]> {
    const search = new URLSearchParams({ apikey: apiKey, format: "json", ...params });
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetcher(`${YANDEX_GEOCODER_URL}?${search}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    } catch { throw new GeocoderUnavailable(); }
    // Quota, key or upstream errors all become one opaque failure; the upstream body is never relayed.
    if (!response.ok) throw new GeocoderUnavailable();
    let body: unknown;
    try { body = await response.json(); } catch { throw new GeocoderUnavailable(); }
    return members(body);
  }

  return {
    /** Text -> street-level candidates in Kazakhstan, biased to the chosen region/city. */
    async forward(query: ForwardQuery): Promise<GeocodeResult> {
      const typed = query.text.trim().slice(0, MAX_GEOCODE_TEXT);
      const region = getKzRegion(query.regionCode);
      const lang = uiLanguage(query.lang);
      const cityName = (query.city ?? "").trim() || (region?.kind === "city" ? region[lang] : "");
      // Prefix the chosen city (or region) unless the customer already typed it.
      const context = [cityName, !cityName && region ? region[lang] : ""].filter(Boolean).find(name => !typed.toLowerCase().includes(name.toLowerCase()));
      const geocode = context ? `${context}, ${typed}` : typed;
      const city = findKzCity(region?.code, cityName);
      const center = city ?? region;
      const params: Record<string, string> = { geocode, lang: yandexLang(query.lang), results: "5" };
      if (center) {
        const span = city || region?.kind === "city" ? "0.6,0.4" : "6,4";
        Object.assign(params, { ll: `${center.lng},${center.lat}`, spn: span });
      } else {
        Object.assign(params, { bbox: `${KZ_BBOX.minLng},${KZ_BBOX.minLat}~${KZ_BBOX.maxLng},${KZ_BBOX.maxLat}`, rspn: "1" });
      }
      const candidates = (await request(params)).map(object => mapGeoObject(object, query.lang))
        .filter((item): item is GeocodeCandidate => item !== null && item.precision !== "locality" && matchesTypedText(typed, item));
      return candidates.length ? { found: true, candidates } : { found: false };
    },

    /** Point -> the address at that point (house, else street, else settlement). */
    async reverse(query: ReverseQuery): Promise<GeocodeResult> {
      if (!isInsideKazakhstan(query.lat, query.lng)) return { found: false };
      const pin = { lat: query.lat, lng: query.lng };
      const lookup = async (kind?: "locality") => {
        // Fixed decimals: "68,48.5" would be read as text ("68th Street, 48"), not as a point.
        const params: Record<string, string> = { geocode: `${query.lng.toFixed(6)},${query.lat.toFixed(6)}`, sco: "longlat", lang: yandexLang(query.lang), results: "1" };
        if (kind) params.kind = kind;
        return (await request(params)).map(object => mapGeoObject(object, query.lang)).find((item): item is GeocodeCandidate => item !== null);
      };
      // The most precise object at the point: a house/street near the pin, or the settlement/district
      // containing it (region and maybe city, no street line).
      let match = await lookup();
      if (match?.precision === "locality") match = { ...match, line1: "" };
      // Yandex may answer with a house far away; then use the nearby settlement, if there is one.
      else if (match && distanceKm(pin, match) > NEAR_PIN_KM) {
        const locality = await lookup("locality");
        match = locality && distanceKm(pin, locality) <= SETTLEMENT_KM ? { ...locality, line1: "", precision: "locality" } : undefined;
      }
      // The pin is where the customer put it; the parts describe that place.
      return match ? { found: true, candidates: [{ ...match, lat: Math.round(query.lat * 1e6) / 1e6, lng: Math.round(query.lng * 1e6) / 1e6 }] } : { found: false };
    },
  };
}
export type YandexGeocoder = ReturnType<typeof createYandexGeocoder>;
