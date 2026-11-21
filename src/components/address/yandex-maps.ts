// Lazy, single loader for the Yandex Maps JavaScript API 2.1 (client only). The script is added
// once per page on first use; every AddressForm shares the same promise. Coordinates are
// [latitude, longitude] (the API default coordorder=latlong).

export type LatLng = [number, number];

export interface YMapEvent { get(name: "coords"): LatLng }
export interface YEventManager { add(type: string, handler: (event: YMapEvent) => void): unknown }
export interface YPlacemark {
  geometry: { getCoordinates(): LatLng; setCoordinates(coords: LatLng): void };
  events: YEventManager;
  options: { set(name: string, value: unknown): void };
}
export interface YMap {
  events: YEventManager;
  geoObjects: { add(object: YPlacemark): void; remove(object: YPlacemark): void };
  setCenter(center: LatLng, zoom?: number, options?: { duration?: number; checkZoomRange?: boolean }): Promise<void> | void;
  getZoom(): number;
  container: { fitToViewport(): void };
  behaviors: { disable(name: string | string[]): void };
  destroy(): void;
}
export interface YMapsApi {
  ready(callback: () => void, errorCallback?: (error: unknown) => void): void;
  Map: new (element: HTMLElement, state: { center: LatLng; zoom: number; controls: string[] }, options?: Record<string, unknown>) => YMap;
  Placemark: new (coords: LatLng, properties: Record<string, unknown>, options: Record<string, unknown>) => YPlacemark;
}

declare global {
  interface Window { ymaps?: YMapsApi }
}

const SCRIPT_ID = "yandex-maps-api-2-1";
const LOAD_TIMEOUT_MS = 15000;
let loading: Promise<YMapsApi> | null = null;

export function yandexMapsLang(language: "en" | "ru" | "kk"): string {
  return language === "en" ? "en_US" : "ru_RU";
}

/** Loads the API once. Rejects (and allows a later retry) when the key is missing or the script fails. */
export function loadYandexMaps(apiKey: string, language: "en" | "ru" | "kk"): Promise<YMapsApi> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.reject(new Error("Maps load only in the browser"));
  if (!apiKey) return Promise.reject(new Error("Maps key is not configured"));
  if (window.ymaps) return new Promise((resolve, reject) => window.ymaps?.ready(() => resolve(window.ymaps as YMapsApi), reject));
  if (loading) return loading;
  loading = new Promise<YMapsApi>((resolve, reject) => {
    const fail = (error: unknown) => { loading = null; document.getElementById(SCRIPT_ID)?.remove(); reject(error instanceof Error ? error : new Error("Maps failed to load")); };
    const timer = window.setTimeout(() => fail(new Error("Maps load timed out")), LOAD_TIMEOUT_MS);
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=${yandexMapsLang(language)}`;
    script.onload = () => {
      const api = window.ymaps;
      if (!api) { window.clearTimeout(timer); fail(new Error("Maps API missing")); return; }
      api.ready(() => { window.clearTimeout(timer); resolve(api); }, error => { window.clearTimeout(timer); fail(error); });
    };
    script.onerror = () => { window.clearTimeout(timer); fail(new Error("Maps failed to load")); };
    document.head.appendChild(script);
  });
  return loading;
}
