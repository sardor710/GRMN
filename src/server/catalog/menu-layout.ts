// Owner 2026-11-24: every heading and link of the storefront top menu can be added, edited, moved, hidden and
// deleted in Admin ▸ Categories. Pure, no DB — shared by the menu builder (mega-nav.ts) and the admin tree
// (cms/category-admin.ts).
//
// A top item without a stored layout shows the built-in columns (src/lib/homepage-nav.ts) exactly as before.
// The first admin save stores the item's whole layout — `builtInLayout` converts the built-in columns so that
// storing them unchanged renders the same menu — in store_settings.presentation_config.megaMenu (no schema change;
// older images ignore it):
//   { version: 2, items: { "<rootKey>": { groups: [ { id, column, products?, heading?, hidden?, links: [...] } ] } } }
// A link opens a category (`category` key: dropped while the category is hidden, archived or deleted; named after
// it unless `label` says otherwise) or a web address (`href` + `label`). The Products group lists the item's
// placements and is the only group that cannot be deleted.
import { z } from "zod";
import type { MegaGroup, MegaNavItem, NavGroup, NavLink } from "../../lib/homepage-nav.ts";
import { itemGroups, PRODUCTS_HEADING } from "./menu-source.ts";

export type MenuLocale = "en" | "ru" | "kk";
export const MENU_LOCALES: readonly MenuLocale[] = ["en", "ru", "kk"];
export type MenuText = Partial<Record<MenuLocale, string>>;
export const MENU_CONFIG_KEY = "megaMenu";
export const MENU_COLUMNS = 3;

export interface LayoutLink { id: string; category?: string; href?: string; label?: MenuText; hidden?: boolean }
export interface LayoutGroup { id: string; column: number; products?: boolean; heading?: MenuText; hidden?: boolean; links: LayoutLink[] }
export interface ItemLayout { groups: LayoutGroup[] }
export interface MenuConfig { items: Record<string, ItemLayout> }

/** A storefront link target: a local path (not protocol-relative) or an http(s) address. */
export const MENU_HREF = /^(\/(?![/\\])[^\s<>"\\]*|https?:\/\/[^\s<>"/\\]+[^\s<>"\\]*)$/;

const text = z.object({ en: z.string().trim().max(200).optional(), ru: z.string().trim().max(200).optional(), kk: z.string().trim().max(200).optional() }).strict()
  .transform((value): MenuText | undefined => {
    const out: MenuText = {};
    for (const locale of MENU_LOCALES) if (value[locale]) out[locale] = value[locale];
    return Object.keys(out).length ? out : undefined;
  });
const id = z.string().trim().min(1).max(120);
const link = z.object({
  id, category: z.string().trim().min(1).max(200).optional(), href: z.string().trim().max(500).regex(MENU_HREF, "A link must start with / or https://").optional(),
  label: text.optional(), hidden: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.category === undefined) === (value.href === undefined)) ctx.addIssue({ code: "custom", message: "A link opens either a category or a web address" });
  if (value.href !== undefined && !value.label?.en) ctx.addIssue({ code: "custom", message: "A web address link needs an English text" });
});
const group = z.object({
  id, column: z.number().int().min(0).max(MENU_COLUMNS - 1), products: z.boolean().optional(), heading: text.optional(), hidden: z.boolean().optional(),
  links: z.array(link).max(80),
}).strict().superRefine((value, ctx) => {
  if (value.products && value.links.length) ctx.addIssue({ code: "custom", message: "The Products heading lists the menu's subcategories; add links to another heading" });
  if (!value.products && !value.heading?.en && !value.links.length) ctx.addIssue({ code: "custom", message: "A heading needs an English text or at least one link" });
});
export const itemLayoutSchema = z.object({ groups: z.array(group).max(40) }).strict().superRefine((value, ctx) => {
  if (value.groups.filter(entry => entry.products).length !== 1) ctx.addIssue({ code: "custom", message: "The menu must keep its Products heading (hide it instead)" });
  const ids = [...value.groups.map(entry => entry.id), ...value.groups.flatMap(entry => entry.links.map(item => item.id))];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Two headings or links share an id" });
});

/** Tolerant read of the stored JSON: an item whose layout is malformed falls back to the built-in menu. */
export function parseMenuConfig(raw: unknown): MenuConfig {
  const items: Record<string, ItemLayout> = {};
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { items?: unknown }).items : undefined;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [key, value] of Object.entries(source)) { const parsed = itemLayoutSchema.safeParse(value); if (parsed.success) items[key] = parsed.data as ItemLayout; }
  }
  return { items };
}

/** Groups of a built-in top item in reading order with stable ids (heading name, "-2" when repeated; "col<N>" unheaded). */
export function menuGroups(item: Pick<MegaNavItem, "columns"> | undefined): { id: string; column: number; group: MegaGroup; products: boolean; links: { id: string; labelKey: string; href: string }[] }[] {
  if (!item?.columns) return [{ id: "products", column: 0, group: { headingKey: PRODUCTS_HEADING, links: [] }, products: true, links: [] }];
  const used = new Set<string>();
  const unique = (base: string) => { let value = base; for (let n = 2; used.has(value); n++) value = `${base}-${n}`; used.add(value); return value; };
  return itemGroups(item).map(({ column, group, products }) => {
    const groupId = unique(group.headingKey ? group.headingKey.split(".").pop()! : `col${column + 1}`);
    return { id: groupId, column, group, products, links: group.links.map(entry => ({ id: unique(`${groupId}|${entry.href}`), labelKey: entry.labelKey, href: entry.href })) };
  });
}

export interface LayoutCategory { key: string; slug: string | null; nav_visible: boolean; archived: boolean; name: LocalNames }
export type LocalNames = Record<MenuLocale, string>;
export type Translator = Record<MenuLocale, (key: string) => string>;

/**
 * The built-in columns of a top item as a layout. A link to a category keeps an explicit text only where the
 * built-in menu shows something other than the category's own name, so storing it unchanged renders the same menu.
 * `resolve` is the built-in rule for a column link in one language (its text, or null when the menu drops it).
 */
export function builtInLayout(item: Pick<MegaNavItem, "columns"> | undefined, categories: { bySlug: Map<string, LayoutCategory>; seedKeyBySlug: Map<string, string> }, t: Translator,
  resolve: (locale: MenuLocale, link: { labelKey: string; href: string }) => string | null): ItemLayout {
  const all = (key: string): MenuText => ({ en: t.en(key), ru: t.ru(key), kk: t.kk(key) });
  const groups: LayoutGroup[] = [];
  for (const entry of menuGroups(item)) {
    if (entry.products) {
      if (groups.some(existing => existing.products)) continue; // Marine's continuation column: one Products group
      groups.push({ id: entry.id, column: entry.column, products: true, ...(entry.group.headingKey ? { heading: all(entry.group.headingKey) } : {}), links: [] });
      continue;
    }
    const links = entry.links.map((source): LayoutLink => {
      const slug = source.href.startsWith("/c/") ? source.href.slice(3).split(/[?#]/)[0].replace(/\/+$/, "") : null;
      const row = slug === null ? undefined : categories.bySlug.get(slug);
      const seedKey = slug === null ? undefined : categories.seedKeyBySlug.get(slug);
      if (row && `/c/${row.slug}` === source.href) {
        const label: MenuText = {};
        for (const locale of MENU_LOCALES) { const shown = resolve(locale, source) ?? t[locale](source.labelKey); if (shown !== row.name[locale]) label[locale] = shown; }
        return { id: source.id, category: row.key, ...(Object.keys(label).length ? { label } : {}) };
      }
      // A built-in link to a deleted seed category stays dropped, as it is today.
      if (!row && seedKey) return { id: source.id, category: seedKey, label: all(source.labelKey) };
      return { id: source.id, href: source.href, label: all(source.labelKey) };
    });
    groups.push({ id: entry.id, column: entry.column, ...(entry.group.headingKey ? { heading: all(entry.group.headingKey) } : {}), links });
  }
  return { groups };
}

/** The storefront columns of a stored layout in one language. `products` are the item's placement links. */
export function renderLayout(layout: ItemLayout, locale: MenuLocale, products: NavLink[], categoryByKey: (key: string) => { slug: string | null; shown: boolean; name: string } | undefined): NavGroup[][] | undefined {
  const columns: NavGroup[][] = Array.from({ length: MENU_COLUMNS }, () => []);
  const say = (value: MenuText | undefined) => value?.[locale] ?? value?.en;
  for (const entry of layout.groups) {
    if (entry.hidden) continue;
    const heading = say(entry.heading);
    const links = entry.products ? products : entry.links.flatMap((item): NavLink[] => {
      if (item.hidden) return [];
      if (item.category !== undefined) {
        const row = categoryByKey(item.category);
        if (!row || !row.shown || !row.slug) return [];
        return [{ label: item.label?.[locale] ?? row.name, href: `/c/${row.slug}` }];
      }
      return item.href ? [{ label: say(item.label) ?? item.href, href: item.href }] : [];
    });
    if (links.length) columns[entry.column].push({ ...(heading ? { heading } : {}), links });
  }
  const used = columns.filter(column => column.length);
  return used.length ? used : undefined;
}
