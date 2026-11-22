// Kazakhstan-only delivery rules for saved addresses (M8.2) and the optional profile birthday.
// Pure functions: they return a field-specific message instead of throwing, so the service can
// answer 400 with a clear reason. Reusable by checkout when its inline address adopts them.
import { findKzCityAnywhere, isInsideKazakhstan, resolveKzRegion } from "../../lib/kz-regions.ts";
import type { GeoPrecision } from "../../contracts/commerce.ts";

export const DELIVERY_COUNTRY = "KZ";
export const GEO_PRECISIONS: readonly GeoPrecision[] = ["exact", "street", "locality", "manual"];
export const MIN_CUSTOMER_AGE = 10;
export const MAX_CUSTOMER_AGE = 120;

export interface KzAddressGeo { region: string; lat: number | null; lng: number | null; geoPrecision: GeoPrecision | null }
export type RuleResult<T> = { ok: true; value: T } | { ok: false; message: string };

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** Validates the country/region/pin part of an address body. The rest is checked by the schema. */
export function checkKzAddress(body: Record<string, unknown>): RuleResult<KzAddressGeo> {
  const country = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : body.countryCode;
  if (country !== DELIVERY_COUNTRY) return { ok: false, message: "We deliver only within Kazakhstan; the country must be KZ" };
  const regionText = typeof body.region === "string" ? body.region.trim() : "";
  if (regionText.length > 120) return { ok: false, message: "Unknown region of Kazakhstan" };
  // Older saved addresses had an optional free-text region: a listed city still identifies it.
  const region = regionText ? resolveKzRegion(regionText) : findKzCityAnywhere(typeof body.city === "string" ? body.city : "")?.region;
  if (!regionText && !region) return { ok: false, message: "Choose a region of Kazakhstan" };
  if (!region) return { ok: false, message: "Unknown region of Kazakhstan" };

  const { lat, lng, geoPrecision } = body;
  if (lat === undefined && lng === undefined) {
    if (geoPrecision !== undefined && geoPrecision !== null) return { ok: false, message: "A map precision needs map coordinates" };
    return { ok: true, value: { region: region.code, lat: null, lng: null, geoPrecision: null } };
  }
  if (lat === null && lng === null && (geoPrecision === undefined || geoPrecision === null)) {
    return { ok: true, value: { region: region.code, lat: null, lng: null, geoPrecision: null } };
  }
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, message: "Send both map coordinates or neither" };
  }
  if (!isInsideKazakhstan(lat, lng)) return { ok: false, message: "The map pin must be inside Kazakhstan" };
  if (geoPrecision !== undefined && geoPrecision !== null && !GEO_PRECISIONS.includes(geoPrecision as GeoPrecision)) {
    return { ok: false, message: "Unknown map precision" };
  }
  return { ok: true, value: { region: region.code, lat: round6(lat), lng: round6(lng), geoPrecision: (geoPrecision as GeoPrecision | undefined) ?? null } };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Optional birthday: undefined keeps the stored value, null or "" clears it, otherwise a real
 * calendar date, not in the future, for an age from 10 to 120 years (UTC calendar day).
 */
export function checkBirthDate(value: unknown, today: Date = new Date()): RuleResult<string | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: "Birthday must be a date (YYYY-MM-DD)" };
  const match = ISO_DATE.exec(value.trim());
  if (!match) return { ok: false, message: "Birthday must be a date (YYYY-MM-DD)" };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { ok: false, message: "Birthday is not a real date" };
  const [ty, tm, td] = [today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()];
  if (year > ty || (year === ty && (month > tm || (month === tm && day > td)))) return { ok: false, message: "Birthday cannot be in the future" };
  const age = ty - year - (tm < month || (tm === month && td < day) ? 1 : 0);
  if (age < MIN_CUSTOMER_AGE || age > MAX_CUSTOMER_AGE) return { ok: false, message: `Birthday must give an age from ${MIN_CUSTOMER_AGE} to ${MAX_CUSTOMER_AGE} years` };
  return { ok: true, value: match[0] };
}
