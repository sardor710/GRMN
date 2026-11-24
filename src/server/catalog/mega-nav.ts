// Owner 2026-11-22: the storefront top menu is built from Admin ▸ Categories.
//   - Top items: nav-visible, unarchived catalog roots in position order; label = name in the visitor's language,
//     link = menu_href or /c/<slug>.
//   - Products group: the item's placements in order (placement label/href override the category's own). The
//     built-in item's Products columns keep their sizes (Marine spans two columns); extra links go in the last one.
//     An item the built-in menu does not know gets a single Products column.
//   - Other columns, groups and promos come from the built-in menu. A link there that stands for a category
//     (/c/<slug>) is dropped when the category is hidden, archived or deleted; its label stays the built-in one
//     until the category is renamed in that language, then it is the category's name.
//   - Owner 2026-11-24: once Admin ▸ Categories saves a top item's columns (menu-layout.ts, stored in
//     store_settings.presentation_config.megaMenu), that layout replaces the built-in columns for the item; the
//     Products group still lists the placements. Items without a stored layout are exactly as above.
// Returns null while there are no catalog roots, so callers keep the built-in menu.
import { megaNav, resolveNavPromo, type NavGroup, type NavItem, type NavLink } from "../../lib/homepage-nav.ts";
import { PRODUCTS_HEADING } from "./menu-source.ts";
import { MENU_CONFIG_KEY, menuGroups, parseMenuConfig, renderLayout, type MenuConfig, type MenuLocale } from "./menu-layout.ts";
import { menuSourceKey } from "./taxonomy-load.ts";
import { taxonomySeed } from "./taxonomy-seed.ts";

interface Query { query<R extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }> }
export type { MenuLocale };
type Translate = (key: string) => string;

export interface MenuCategoryRow { id: string; key: string; slug: string | null; kind: string; parent_id: string | null; nav_visible: boolean; archived: boolean; menu_href: string | null; name: string; local_name: string | null }
type CategoryRow = MenuCategoryRow;
interface PlacementRow { menu_category_id: string; category_id: string; href: string | null; label: Partial<Record<MenuLocale, string>> | null }

const SEED_SLUGS = new Set(taxonomySeed.map(node => node.slug));
/** Seed category key by slug: a built-in link to a deleted seed category stays dropped once stored. */
export const SEED_KEY_BY_SLUG = new Map(taxonomySeed.flatMap(node => node.slug ? [[node.slug, node.key] as const] : []));

/** Category a built-in /c/<slug> link stands for, or null. */
export function linkSlug(href: string): string | null {
  return href.startsWith("/c/") ? href.slice(3).split(/[?#]/)[0].replace(/\/+$/, "") : null;
}

/**
 * A built-in column link in one language, before overrides: kept as is, renamed after its category, or null when
 * its category is hidden, archived or deleted.
 */
export function columnLinkResolver(categories: readonly CategoryRow[], t: Translate): (link: { labelKey: string; href: string }) => NavLink | null {
  const bySlug = new Map(categories.flatMap(row => row.slug ? [[row.slug, row] as const] : []));
  return (link) => {
    const slug = linkSlug(link.href);
    if (slug === null) return { label: t(link.labelKey), href: link.href };
    const row = bySlug.get(slug);
    if (!row) return SEED_SLUGS.has(slug) ? null : { label: t(link.labelKey), href: link.href };
    if (!row.nav_visible || row.archived) return null;
    const source = menuSourceKey(row.key);
    const renamed = !source || (row.local_name ?? row.name) !== t(source);
    return { label: renamed ? (row.local_name ?? row.name) : t(link.labelKey), href: link.href };
  };
}

/** The stored menu layouts; none when nothing is stored or store_settings is unreadable. */
export async function readMenuConfig(client: Query): Promise<MenuConfig> {
  const row = (await client.query<{ config: unknown }>(`SELECT presentation_config->'${MENU_CONFIG_KEY}' AS config FROM store_settings WHERE id=1`)).rows[0];
  return parseMenuConfig(row?.config);
}

export async function buildMegaNav(client: Query, locale: MenuLocale, t: Translate): Promise<NavItem[] | null> {
  const categories = (await client.query<CategoryRow>(
    `SELECT c.id,c.key,c.slug,c.kind,c.parent_id,c.nav_visible,c.archived,c.menu_href,c.name,t.name AS local_name
     FROM categories c LEFT JOIN category_translations t ON t.category_id=c.id AND t.locale=$1
     ORDER BY c.parent_id NULLS FIRST,c.position,c.key`, [locale])).rows;
  const roots = categories.filter(row => row.kind === "catalog" && row.parent_id === null && row.nav_visible && !row.archived);
  if (!roots.length) return null;
  const placements = (await client.query<PlacementRow>("SELECT menu_category_id,category_id,href,label FROM category_menu_placements ORDER BY menu_category_id,position,id")).rows;
  const config = await readMenuConfig(client).catch((): MenuConfig => ({ items: {} }));
  const byKey = new Map(categories.map(row => [row.key, row]));
  const byId = new Map(categories.map(row => [row.id, row]));
  const name = (row: CategoryRow) => row.local_name ?? row.name;
  const shown = (row: CategoryRow | undefined): row is CategoryRow => !!row && row.nav_visible && !row.archived;
  const columnLink = columnLinkResolver(categories, t);

  return roots.map((root): NavItem => {
    const builtIn = megaNav.find(item => item.categoryKey === root.key);
    const heading = (headingKey: string | undefined) => headingKey ? { heading: t(headingKey) } : {};
    const products: NavLink[] = placements
      .filter(row => row.menu_category_id === root.id)
      .flatMap(row => {
        const target = byId.get(row.category_id);
        if (!shown(target) || !target.slug) return [];
        return [{ label: row.label?.[locale] ?? name(target), href: row.href ?? `/c/${target.slug}` }];
      });

    let columns: NavGroup[][] | undefined;
    const layout = config.items[root.key];
    if (layout) {
      columns = renderLayout(layout, locale, products, key => { const row = byKey.get(key); return row && { slug: row.slug, shown: shown(row), name: name(row) }; });
    } else if (builtIn?.columns) {
      const groups = menuGroups(builtIn);
      const productGroups = groups.filter(entry => entry.products);
      let next = 0;
      const built: NavGroup[][] = builtIn.columns.map(() => []);
      groups.forEach(entry => {
        if (entry.products) {
          const last = entry === productGroups.at(-1);
          const take = last ? products.length - next : Math.min(entry.group.links.length, products.length - next);
          const slice = products.slice(next, next + take);
          next += take;
          if (slice.length) built[entry.column].push({ ...heading(entry.group.headingKey), links: slice });
          return;
        }
        const kept = entry.links.map(columnLink).filter((link): link is NavLink => link !== null);
        if (kept.length) built[entry.column].push({ ...heading(entry.group.headingKey), links: kept });
      });
      columns = built.filter(column => column.length);
      if (!columns.length) columns = undefined;
    } else if (products.length) {
      columns = [[{ heading: t(PRODUCTS_HEADING), links: products }]];
    }
    return {
      label: name(root),
      href: root.menu_href ?? `/c/${root.slug}`,
      ...(columns ? { columns } : {}),
      ...(builtIn?.promos ? { promos: builtIn.promos.map(promo => resolveNavPromo(promo, t)) } : {}),
    };
  });
}
