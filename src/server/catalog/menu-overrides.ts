// Owner 2026-11-24: every heading and link of the storefront top menu is visible in Admin ▸ Categories, and each
// can be hidden or renamed (EN/RU/KK) under one top item. Pure, no DB — shared by the menu builder (mega-nav.ts)
// and the admin tree (cms/category-admin.ts), so both read the menu the same way.
//
// The columns themselves (Maps, Accessories & Plans, Discover…) still come from the built-in menu
// (src/lib/homepage-nav.ts); the Products group comes from category placements. Overrides are stored without a
// schema change in store_settings.presentation_config.megaMenu (older images ignore it), keyed by top item
// category key, then by group id / link id:
//   { items: { "<rootKey>": { groups: { "<groupId>": { hidden?, heading? } }, links: { "<linkId>": { hidden?, label? } } } } }
import type { MegaGroup, MegaNavItem } from "../../lib/homepage-nav.ts";
import { itemGroups, PRODUCTS_HEADING } from "./menu-source.ts";

export type MenuLocale = "en" | "ru" | "kk";
export const MENU_LOCALES: readonly MenuLocale[] = ["en", "ru", "kk"];
export type MenuText = Partial<Record<MenuLocale, string>>;
export interface GroupOverride { hidden?: boolean; heading?: MenuText }
export interface LinkOverride { hidden?: boolean; label?: MenuText }
export interface ItemOverrides { groups?: Record<string, GroupOverride>; links?: Record<string, LinkOverride> }
export interface MenuOverrides { items?: Record<string, ItemOverrides> }

/** Key inside store_settings.presentation_config. */
export const MENU_OVERRIDES_KEY = "megaMenu";
/** Group id of the single Products column an item outside the built-in menu gets. */
export const PRODUCTS_GROUP_ID = "products";

export interface MenuGroupRef {
  id: string;
  column: number;
  group: MegaGroup;
  products: boolean;
  links: { id: string; labelKey: string; href: string }[];
}

/** Groups of a top item in reading order with stable ids (heading name, "-2" when repeated; "col<N>" for an unheaded column). */
export function menuGroups(item: Pick<MegaNavItem, "columns"> | undefined): MenuGroupRef[] {
  if (!item?.columns) return [{ id: PRODUCTS_GROUP_ID, column: 0, group: { headingKey: PRODUCTS_HEADING, links: [] }, products: true, links: [] }];
  const used = new Set<string>();
  const unique = (base: string) => { let id = base; for (let n = 2; used.has(id); n++) id = `${base}-${n}`; used.add(id); return id; };
  return itemGroups(item).map(({ column, group, products }) => {
    const id = unique(group.headingKey ? group.headingKey.split(".").pop()! : `col${column + 1}`);
    const linkIds = new Set<string>();
    const links = group.links.map(link => {
      let linkId = `${id}|${link.href}`;
      for (let n = 2; linkIds.has(linkId); n++) linkId = `${id}|${link.href}#${n}`;
      linkIds.add(linkId);
      return { id: linkId, labelKey: link.labelKey, href: link.href };
    });
    return { id, column, group, products, links };
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function text(value: unknown): MenuText | undefined {
  if (!isRecord(value)) return undefined;
  const out: MenuText = {};
  for (const locale of MENU_LOCALES) { const entry = value[locale]; if (typeof entry === "string" && entry.trim()) out[locale] = entry.trim(); }
  return Object.keys(out).length ? out : undefined;
}

/** Tolerant read of the stored JSON: anything malformed is ignored, so a bad value never breaks the menu. */
export function parseMenuOverrides(raw: unknown): MenuOverrides {
  if (!isRecord(raw) || !isRecord(raw.items)) return {};
  const items: Record<string, ItemOverrides> = {};
  for (const [key, value] of Object.entries(raw.items)) {
    if (!isRecord(value)) continue;
    const entry: ItemOverrides = {};
    for (const field of ["groups", "links"] as const) {
      const source = value[field];
      if (!isRecord(source)) continue;
      const parsed: Record<string, GroupOverride & LinkOverride> = {};
      for (const [id, override] of Object.entries(source)) {
        if (!isRecord(override)) continue;
        const name = text(field === "groups" ? override.heading : override.label);
        const clean = { ...(override.hidden === true ? { hidden: true } : {}), ...(name ? { [field === "groups" ? "heading" : "label"]: name } : {}) };
        if (Object.keys(clean).length) parsed[id] = clean;
      }
      if (Object.keys(parsed).length) entry[field] = parsed;
    }
    if (Object.keys(entry).length) items[key] = entry;
  }
  return Object.keys(items).length ? { items } : {};
}
