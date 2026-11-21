// Maps a legacy CMS product (free-text category / subCategory / family) onto taxonomy node keys.
// Pure function: no DB access. Used by the dev import (scripts/dev/import.mjs) to give imported
// products initial product_categories rows; the admin editor owns assignments afterwards.
//
// Rules, in order:
// 1. subCategory, then category: alias table (old hardcoded admin tree + labels seen in data.json),
//    then an exact normalized name match against catalog/accessory nodes. The first hit is primary.
// 2. family → the longest "Watch Series" group whose normalized name prefixes the family
//    ("MARQ Adventurer (Gen 3)" → MARQ, "fēnix 9" → fēnix).
// 3. A product in a watch series that has no category under Smartwatches also gets Smartwatches,
//    so every watch is listed on /c/wearables-smartwatches.

export interface CategoryMatchNode {
  key: string;
  name: string;
  kind: "catalog" | "accessory" | "group";
  parentKey: string | null;
}

export interface LegacyCategoryFields {
  category?: unknown;
  subCategory?: unknown;
  family?: unknown;
}

export interface CategoryMatch {
  primaryKey: string | null;
  keys: string[];
  unmatched: string[];
}

export const SMARTWATCHES_KEY = "wearables-smartwatches";
const SERIES_ROOT_KEY = "watch-series";

export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Normalized legacy label → taxonomy key.
const ALIASES: Record<string, string> = {
  smartwatches: SMARTWATCHES_KEY,
  smartwatchesandwearables: SMARTWATCHES_KEY,
  everydaysmartwatches: SMARTWATCHES_KEY,
  multisportgps: "sports-fitness/multisport-smartwatches",
  triathlonandmultisport: "sports-fitness/multisport-smartwatches",
  runninggps: "sports-fitness/running-smartwatches",
  fitnesstracking: "sports-fitness/activity-fitness-trackers",
  fitnesstrackers: "sports-fitness/activity-fitness-trackers",
  fashionandwellness: "sports-fitness/fashion-hybrid-smartwatches",
  luxurysmartwatches: "wearables-smartwatches/marq-luxury-watch-collection",
  luxurytoolwatchesmarq: "wearables-smartwatches/marq-luxury-watch-collection",
  moderntoolwatches: "wearables-smartwatches/marq-luxury-watch-collection",
  carbonedition: "wearables-smartwatches/marq-luxury-watch-collection",
  damascusedition: "wearables-smartwatches/marq-luxury-watch-collection",
  titaniumluxury: "wearables-smartwatches/marq-luxury-watch-collection",
  adventurewatches: "outdoor-recreation/adventure-smartwatches",
  adventuregps: "outdoor-recreation/adventure-smartwatches",
  divingandtactical: "outdoor-recreation/sportsman-and-tactical-devices",
  golfsmartwatches: "sports-fitness/golf-gps-devices-smartwatches",
  marineandsailing: "marine/handhelds-gps-and-watches",
  marineandsailinggps: "marine/handhelds-gps-and-watches",
  kidssmartwatches: "sports-fitness/kids-wearables-fitness-activity-trackers",
  cyclingcomputers: "sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights",
  handheldgps: "outdoor-recreation/handheld-hiking-gps",
  aviationsmartwatches: "aviation/gps-wearables-apps",
  flightnavigationgps: "aviation/gps-wearables-apps",
  bandsandstraps: "bands",
  heartrateandsensors: "heart-rate-monitors",
  cablesandpower: "cables-chargers",
  mountsandprotection: "wearables-smartwatches-accessories",
};

function label(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function matchLegacyCategories(nodes: readonly CategoryMatchNode[], product: LegacyCategoryFields): CategoryMatch {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const byName = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind === "group") continue;
    const name = normalizeLabel(node.name);
    if (!byName.has(name)) byName.set(name, node.key);
  }
  const keys: string[] = [], unmatched: string[] = [];
  const add = (key: string) => { if (byKey.has(key) && !keys.includes(key)) keys.push(key); };

  let primaryKey: string | null = null;
  for (const raw of [label(product.subCategory), label(product.category)]) {
    if (!raw) continue;
    const name = normalizeLabel(raw);
    const key = ALIASES[name] ?? byName.get(name);
    if (key && byKey.has(key)) {
      primaryKey ??= key;
      add(key);
      break;
    }
    unmatched.push(raw);
  }

  const family = label(product.family);
  if (family) {
    const normalized = normalizeLabel(family);
    const series = nodes
      .filter((node) => node.kind === "group" && node.parentKey === SERIES_ROOT_KEY && normalized.startsWith(normalizeLabel(node.name)))
      .sort((a, b) => normalizeLabel(b.name).length - normalizeLabel(a.name).length)[0];
    if (series) {
      add(series.key);
      const underSmartwatches = keys.some((key) => isDescendantOrSelf(byKey, key, SMARTWATCHES_KEY));
      if (!underSmartwatches) {
        add(SMARTWATCHES_KEY);
        primaryKey ??= SMARTWATCHES_KEY;
      }
    }
  }

  if (primaryKey === null) primaryKey = keys.find((key) => byKey.get(key)?.kind !== "group") ?? null;
  return { primaryKey, keys, unmatched: primaryKey ? [] : unmatched };
}

function isDescendantOrSelf(byKey: Map<string, CategoryMatchNode>, key: string, ancestor: string): boolean {
  for (let current: string | null = key, depth = 0; current && depth < 32; depth++) {
    if (current === ancestor) return true;
    current = byKey.get(current)?.parentKey ?? null;
  }
  return false;
}
