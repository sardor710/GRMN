// Owner 2026-11-26 (plan docs/plans/2026-11-26-signup-orders-pickup-devices-xl.md): the one store customers can pick
// up from. Edited in Admin ▸ Settings (store_settings.pickup_location); an order keeps a copy (orders.pickup_snapshot).
// Seed: the Garmin showroom at Panfilova St 154, Almaty, daily 10:00–19:00 (ifit.kz and lap.kz, 2026-11-26).
import { z } from "zod";

export type PickupLocale = "en" | "ru" | "kk";
export interface PickupText { en: string; ru: string; kk: string }
export interface PickupLocation {
  enabled: boolean;
  name: PickupText;
  address: PickupText;
  hours: PickupText;
  phone: string;
  /** Map pin (WGS84); both or neither. */
  lat: number | null;
  lng: number | null;
}
/** What an order keeps: the store as it was when the order was placed (no on/off switch). */
export type PickupSnapshot = Omit<PickupLocation, "enabled">;

export const PICKUP_SEED: PickupLocation = {
  enabled: true,
  name: { en: "Garmin showroom", ru: "Шоурум Garmin", kk: "Garmin шоурумы" },
  address: { en: "154 Panfilov St, Almaty", ru: "г. Алматы, ул. Панфилова, 154", kk: "Алматы қ., Панфилов к-сі, 154" },
  hours: { en: "Daily 10:00–19:00", ru: "Ежедневно 10:00–19:00", kk: "Күн сайын 10:00–19:00" },
  phone: "",
  lat: null,
  lng: null,
};

const text = (max: number) => z.string().trim().min(1).max(max);
const localized = (max: number) => z.object({ en: text(max), ru: text(max), kk: text(max) }).strict();
export const pickupLocationSchema = z.object({
  enabled: z.boolean(),
  name: localized(120),
  address: localized(300),
  hours: localized(300),
  phone: z.string().trim().max(32).refine(value => value === "" || /^[+]?[0-9 ()-]{6,32}$/.test(value), "Invalid phone"),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
}).strict().refine(value => (value.lat === null) === (value.lng === null), "Set both map coordinates or neither");

/** A stored value read back; anything malformed falls back to the seed rather than breaking checkout. */
export function readPickupLocation(value: unknown): PickupLocation {
  const parsed = pickupLocationSchema.safeParse(value);
  return parsed.success ? parsed.data : PICKUP_SEED;
}

export function pickupSnapshotOf(location: PickupLocation): PickupSnapshot {
  const { enabled: _enabled, ...snapshot } = location;
  return snapshot;
}

export const pickupText = (value: PickupText, locale: string): string => value[(locale === "ru" || locale === "kk") ? locale : "en"] || value.en;

/** A map search link for the store (works without a pin). */
export function pickupMapUrl(location: Pick<PickupSnapshot, "address" | "lat" | "lng">): string {
  if (location.lat !== null && location.lng !== null) return `https://yandex.kz/maps/?pt=${location.lng},${location.lat}&z=17&l=map`;
  return `https://yandex.kz/maps/?text=${encodeURIComponent(location.address.ru)}`;
}
