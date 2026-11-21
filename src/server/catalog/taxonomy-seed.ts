// Category taxonomy seed data for migration 0013's `categories` columns. Pure data: no DB access.
// A seeding step inserts the nodes in list order (parents always precede children); a node's
// `position` is its index among siblings in this list.
//
// kind "catalog" mirrors the garmin.com mega-menu captured in src/lib/homepage-nav.ts (`megaNav`):
// - Each top-level menu item is a root node. Its slug is its own /c/ path, unless that path belongs
//   to one of its links (e.g. Sports & Fitness opens Running); then it is the slugified label.
// - In "Products" groups (and Marine's untitled continuation) every link is a node; in all other
//   groups only links to a garmin.com /c/ category page are nodes. Discover/Communities content,
//   tools (locators, map updates), product pages outside Products groups and external sites are not.
// - slug = the full path after /c/ (query string dropped); without a /c/ path,
//   slugify(label) under the parent's slug.
// - The tree has one parent per node. A category garmin.com lists in several menus sits under the
//   first menu (nav order) and names the others in `alsoListedUnder`. Links whose path is an
//   accessory node's slug (Apps, Service Plans, Cycling Accessories) reuse that accessory node.
// kind "accessory" and "group" are the store's accessory tree, compatibility groupings and watch
// series. Groups are hidden from navigation by default.
import type { CategoryKind, CategoryPresetFilters } from "../db/schema/catalog.ts";

export interface TaxonomyNode {
  /** Stable identity, stored as categories.key; equals the initial slug. Unique across the seed. */
  key: string;
  name: string;
  kind: CategoryKind;
  /** URL path segment(s), stored as categories.slug; lowercase ASCII words joined by '-' and '/'. */
  slug: string;
  /** Key of the parent node, or null for a root. The parent always appears earlier in the list. */
  parentKey: string | null;
  presetFilters: CategoryPresetFilters;
  navVisible: boolean;
  /** The menu link this node mirrors (garmin.com or local route), when there is one. */
  sourceHref?: string;
  /** Keys of other top-level menus where garmin.com also lists this category. */
  alsoListedUnder?: readonly string[];
}

export const LEGACY_CATALOG_SLUGS = ["wearables-smartwatches", "sports-fitness/running-smartwatches"] as const;

const G = "https://www.garmin.com/en-US";

type Extra = Partial<Pick<TaxonomyNode, "presetFilters" | "navVisible" | "sourceHref" | "alsoListedUnder">>;
const node = (kind: CategoryKind, parentKey: string | null, name: string, slug: string, extra: Extra = {}): TaxonomyNode => ({
  key: slug, name, kind, slug, parentKey, presetFilters: {}, navVisible: kind !== "group", ...extra,
});
const garmin = (path: string) => `${G}/c/${path}/`;
const catalog = (parentKey: string | null, name: string, slug: string, extra: Extra = {}) =>
  node("catalog", parentKey, name, slug, { sourceHref: garmin(slug), ...extra });
const linked = (parentKey: string | null, name: string, slug: string, sourceHref: string, extra: Extra = {}) =>
  node("catalog", parentKey, name, slug, { sourceHref, ...extra });

const SW = "wearables-smartwatches", SF = "sports-fitness", OR = "outdoor-recreation", AH = "auto-home", MA = "marine", AV = "aviation";
const ALL_MENUS = [SW, SF, OR, AH, MA, AV] as const;

const catalogNodes: TaxonomyNode[] = [
  // Smartwatches ("All Smartwatches" is this node's own landing link).
  catalog(null, "Smartwatches", SW, { sourceHref: "/c/wearables-smartwatches" }),
  catalog(SW, "Health & Fitness Tracking", "sports-fitness/activity-fitness-trackers", { alsoListedUnder: [SF] }),
  linked(SW, "Design Your Own Watch", `${SW}/design-your-own-watch`, `${G}/your-watch-your-way/`, { alsoListedUnder: [SF, OR] }),
  linked(SW, "Watches for Women", "women-wearables", `${G}/c/women-wearables/?FILTER_FEATURE_FORWOMEN=true`),
  catalog(SW, "Fashion & Hybrid Smartwatches", "sports-fitness/fashion-hybrid-smartwatches"),
  linked(SW, "MARQ Luxury Watch Collection", `${SW}/marq-luxury-watch-collection`, "/minisite/marq", { presetFilters: { families: ["MARQ"] } }),
  catalog(SW, "Running", "sports-fitness/running-smartwatches", { sourceHref: "/c/sports-fitness/running-smartwatches", presetFilters: { activities: ["running"] }, alsoListedUnder: [SF] }),
  catalog(SW, "Multisport & Triathlete", "sports-fitness/multisport-smartwatches", { presetFilters: { activities: ["triathlon"] }, alsoListedUnder: [SF] }),
  catalog(SW, "Adventure", "outdoor-recreation/adventure-smartwatches", { alsoListedUnder: [OR] }),
  catalog(SW, "Swimming", "sports-fitness/swimming-smartwatches", { presetFilters: { activities: ["swimming"] }, alsoListedUnder: [SF] }),
  catalog(SW, "Diving", "sports-fitness/dive-computers-smartwatches", { presetFilters: { activities: ["diving"] }, alsoListedUnder: [SF] }),
  catalog(SW, "Golf", "sports-fitness/golf-gps-devices-smartwatches", { presetFilters: { activities: ["golfing"] }, alsoListedUnder: [SF] }),
  catalog(SW, "Kids Smartwatches", "sports-fitness/kids-wearables-fitness-activity-trackers", { presetFilters: { levels: ["Youth"] }, alsoListedUnder: [SF] }),
  catalog(SW, "Outdoor Maps", "wearables-mapping", { alsoListedUnder: [SF] }),
  catalog(SW, "Smartwatch Accessories", "wearables-smartwatches-accessories", { alsoListedUnder: [SF] }),

  // Sports & Fitness (its menu link opens Running).
  linked(null, "Sports & Fitness", SF, "/c/sports-fitness/running-smartwatches"),
  linked(SF, "CIRQA™ Smart Band", `${SF}/cirqa-smart-band`, `${G}/p/1989182/`),
  catalog(SF, "Cycling", "sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights", { presetFilters: { activities: ["cycling"] } }),
  catalog(SF, "Tacx® Indoor Cycling", "sports-fitness/indoor-trainers"),
  catalog(SF, "Scales & Monitors", "sports-fitness/scales-monitors"),
  catalog(SF, "Indoor Training Accessories", "sports-fitness/indoor-training/accessories"),
  catalog(SF, "Student Athletes", "student-athlete-smartwatches"),

  // Outdoor Recreation (its menu link opens Handhelds).
  linked(null, "Outdoor Recreation", OR, garmin("outdoor-recreation/handheld-hiking-gps")),
  catalog(OR, "Handhelds", "outdoor-recreation/handheld-hiking-gps"),
  catalog(OR, "Satellite Communicators", "outdoor-recreation/satellite-communicators"),
  catalog(OR, "Off-Road & Motorsports", "automotive/motorsports", { alsoListedUnder: [AH] }),
  catalog(OR, "Sportsman & Tactical", "outdoor-recreation/sportsman-and-tactical-devices", { presetFilters: { activities: ["tactical-training"] } }),
  catalog(OR, "Dog Tracking & Training", "outdoor-recreation/sporting-dog-tracking-training-devices"),
  linked(OR, "Optics", `${OR}/optics`, `${G}/p/798183/`),
  linked(OR, "Equine", `${OR}/equine`, `${G}/p/1277934`),
  catalog(OR, "Outdoor Maps", "outdoor-maps"),
  catalog(OR, "DeLorme Atlas & Gazetteer", "delorme-atlas-gazetteer"),

  // Auto & Home (its menu link opens Cars, RV & Cameras).
  linked(null, "Auto & Home", AH, garmin("automotive/car-gps-navigation")),
  catalog(AH, "Cars, RV & Cameras", "automotive/car-gps-navigation"),
  catalog(AH, "Motorcycles", "automotive/motorcycle-gps-navigation"),
  catalog(AH, "Trucks", "automotive/semi-truck-gps-navigation"),
  catalog(AH, "Car Audio", "automotive/jl-audio-car-audio"),
  catalog(AH, "Home Audio", "home-audio-systems"),
  catalog(AH, "Purchase New Maps", "road-maps"),
  catalog(AH, "Stealthbox®", "automotive/stealthbox-audio"),

  // Marine (its menu link opens Chartplotters & Fishfinders).
  linked(null, "Marine", MA, garmin("marine/chartplotters")),
  catalog(MA, "Chartplotters & Fishfinders", "marine/chartplotters"),
  catalog(MA, "Live Sonar", "marine/live-sonar"),
  catalog(MA, "Audio", "marine/audio"),
  catalog(MA, "Transducers", "marine/boat-sonar-transducers"),
  catalog(MA, "Trolling Motors", "marine/trolling-motors"),
  catalog(MA, "Ice Fishing Bundles & Kits", "marine/ice-fishing-bundles"),
  catalog(MA, "Radar", "marine/boat-radars"),
  catalog(MA, "Autopilots", "marine/boat-autopilots"),
  catalog(MA, "Lighting", "marine/lighting"),
  catalog(MA, "Handhelds & Smartwatches", "marine/handhelds-gps-and-watches"),
  catalog(MA, "VHF & AIS", "marine/vhf-ais-marine-radios"),
  catalog(MA, "Sonar Black Boxes", "marine/sonar-black-boxes"),
  catalog(MA, "Antennas & Sensors", "marine/boat-sensors-antennas"),
  catalog(MA, "Cameras", "marine/boat-cameras"),
  catalog(MA, "Sailing", "marine/sailing"),
  catalog(MA, "Digital Switching", "marine/digital-switching"),
  linked(MA, "Engine Cutoff/MOB", `${MA}/engine-cutoff-mob`, `${G}/p/1229049/`),
  catalog(MA, "Apps", "marine/marine-apps"),

  // Aviation (its menu link opens Navigation & Radios).
  linked(null, "Aviation", AV, garmin("aviation/navigation-radios")),
  catalog(AV, "Navigation & Radios", "aviation/navigation-radios"),
  catalog(AV, "Autopilots", "aviation/autopilot-systems"),
  catalog(AV, "Flight Displays & Instruments", "aviation/flight-displays-instruments"),
  linked(AV, "Engine Indication Systems", `${AV}/engine-indication-systems`, `${G}/aviation/eis-buyers-guide/`),
  catalog(AV, "Integrated Flight Decks", "aviation/flight-decks"),
  catalog(AV, "Datalinks & Connectivity", "aviation/datalinks-connected-cockpit"),
  catalog(AV, "Audio Panels", "aviation/audio-panels"),
  catalog(AV, "Weather", "aviation/weather-solutions"),
  catalog(AV, "Traffic", "aviation/traffic-surveillance-systems"),
  linked(AV, "ADS-B & Transponders", `${AV}/ads-b-transponders`, `${G}/aviation/adsb-solutions/`),
  catalog(AV, "Portable GPS & Wearables", "aviation/gps-wearables-apps"),
  catalog(AV, "General Aviation", "aviation/general"),
  catalog(AV, "Business Aviation", "aviation/business"),
  catalog(AV, "Experimental", "aviation/experimental"),
  catalog(AV, "Helicopters", "aviation/helicopters"),

  // Sale
  catalog(null, "Sale", "promotions"),
];

const accessory = (name: string, slug: string, extra: Extra = {}) => node("accessory", null, name, slug, extra);
const group = (parentKey: string | null, name: string, slug: string, extra: Extra = {}) => node("group", parentKey, name, slug, extra);

const BANDS = "bands", MARQ_STRAPS = "marq-straps-bracelets", SERIES = "watch-series";

const accessoryNodes: TaxonomyNode[] = [
  accessory("Apps", "apps", { sourceHref: garmin("apps"), alsoListedUnder: ALL_MENUS }),
  accessory("Service Plans", "subscription-plans", { sourceHref: garmin("subscription-plans"), alsoListedUnder: ALL_MENUS }),
  accessory("Bands", BANDS),
  accessory("Dive Bands", "dive-bands"),
  accessory("MARQ Straps & Bracelets", MARQ_STRAPS),
  accessory("Cables & Chargers", "cables-chargers"),
  accessory("Cycling Accessories", "sports-fitness/cycling-biking-accessories", { sourceHref: garmin("sports-fitness/cycling-biking-accessories"), alsoListedUnder: [SF] }),
  accessory("Heart Rate Monitors", "heart-rate-monitors"),
  accessory("Sensors", "sensors"),
];

const groupNodes: TaxonomyNode[] = [
  group(BANDS, "QuickFit 20 mm", `${BANDS}/quickfit-20-mm`),
  group(BANDS, "QuickFit 22 mm", `${BANDS}/quickfit-22-mm`),
  group(BANDS, "QuickFit 26 mm", `${BANDS}/quickfit-26-mm`),
  group(BANDS, "Quick Release 18 mm", `${BANDS}/quick-release-18-mm`),
  group(BANDS, "Quick Release 20 mm", `${BANDS}/quick-release-20-mm`),
  group(BANDS, "Quick Release 22 mm", `${BANDS}/quick-release-22-mm`),
  group(BANDS, "Lily Bands", `${BANDS}/lily-bands`),
  group(MARQ_STRAPS, "MARQ Straps", `${MARQ_STRAPS}/marq-straps`),
  group(MARQ_STRAPS, "MARQ Bracelets", `${MARQ_STRAPS}/marq-bracelets`),
  group(null, "Watch Series", SERIES),
  ...([
    ["fēnix", "fenix"], ["epix", "epix"], ["Forerunner", "forerunner"], ["Venu", "venu"], ["vívoactive", "vivoactive"],
    ["Instinct", "instinct"], ["Enduro", "enduro"], ["MARQ", "marq"], ["quatix", "quatix"], ["tactix", "tactix"],
    ["D2", "d2"], ["Descent", "descent"], ["Approach", "approach"], ["Lily", "lily"], ["vívomove", "vivomove"],
    ["Bounce", "bounce"], ["Edge", "edge"],
  ] as const).map(([name, slug]) => group(SERIES, name, `${SERIES}/${slug}`, { presetFilters: { families: [name] } })),
];

/** Every seed node in insertion order: catalog, then accessory, then group nodes. */
export const taxonomySeed: readonly TaxonomyNode[] = [...catalogNodes, ...accessoryNodes, ...groupNodes];
