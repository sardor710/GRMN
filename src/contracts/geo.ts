// POST /api/geo/geocode (M8.3). Kazakhstan-only address search behind the server-side Yandex key.

export type GeocodeLanguage = "en" | "ru" | "kk";

export type GeocodeRequest =
  | { mode: "forward"; text: string; lang?: GeocodeLanguage; regionCode?: string; city?: string }
  | { mode: "reverse"; lat: number; lng: number; lang?: GeocodeLanguage };

export interface GeocodeCandidate {
  /** Code from src/lib/kz-regions.ts, or null when the place has no recognised region. */
  regionCode: string | null;
  /** Settlement name in the UI language ("" when the point is outside any settlement). */
  city: string;
  /** Street and house ("" when the match is coarser than a street). */
  line1: string;
  lat: number;
  lng: number;
  /** exact = house, street = street or house range, locality = settlement only (reverse only). */
  precision: "exact" | "street" | "locality";
  formatted: string;
}

export type GeocodeResult = { found: false } | { found: true; candidates: GeocodeCandidate[] };
