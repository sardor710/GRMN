// Owner 2026-11-22: the storefront top menu is built from Admin ▸ Categories.
//   - Top items: nav-visible, unarchived catalog roots in position order; label = name in the visitor's language,
//     link = menu_href or /c/<slug>.
//   - Products group: the item's placements in order (placement label/href override the category's own). The
//     built-in item's Products columns keep their sizes (Marine spans two columns); extra links go in the last one.
//     An item the built-in menu does not know gets a single Products column.
//   - Other columns, groups and promos come from the built-in menu. A link there that stands for a category
//     (/c/<slug>) is dropped when the category is hidden, archived or deleted; its label stays the built-in one
//     until the category is renamed in that language, then it is the category's name.
// Returns null while there are no catalog roots, so callers keep the built-in menu.
import { megaNav, resolveNavGroup, resolveNavPromo, type NavGroup, type NavItem, type NavLink } from "../../lib/homepage-nav.ts";
import { itemGroups, PRODUCTS_HEADING } from "./menu-source.ts";
import { menuSourceKey } from "./taxonomy-load.ts";
import { taxonomySeed } from "./taxonomy-seed.ts";

interface Query { query<R extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }> }
export type MenuLocale = "en" | "ru" | "kk";
type Translate = (key: string) => string;

interface CategoryRow { id: string; key: string; slug: string | null; kind: string; parent_id: string | null; nav_visible: boolean; archived: boolean; menu_href: string | null; name: string; local_name: string | null }
interface PlacementRow { menu_category_id: string; category_id: string; href: string | null; label: Partial<Record<MenuLocale, string>> | null }

const SEED_SLUGS = new Set(taxonomySeed.map(node => node.slug));

export async function buildMegaNav(client: Query, locale: MenuLocale, t: Translate): Promise<NavItem[] | null> {
  const categories = (await client.query<CategoryRow>(
    `SELECT c.id,c.key,c.slug,c.kind,c.parent_id,c.nav_visible,c.archived,c.menu_href,c.name,t.name AS local_name
     FROM categories c LEFT JOIN category_translations t ON t.category_id=c.id AND t.locale=$1
     ORDER BY c.parent_id NULLS FIRST,c.position,c.key`, [locale])).rows;
  const roots = categories.filter(row => row.kind === "catalog" && row.parent_id === null && row.nav_visible && !row.archived);
  if (!roots.length) return null;
  const placements = (await client.query<PlacementRow>("SELECT menu_category_id,category_id,href,label FROM category_menu_placements ORDER BY menu_category_id,position,id")).rows;
  const byId = new Map(categories.map(row => [row.id, row]));
  const bySlug = new Map(categories.flatMap(row => row.slug ? [[row.slug, row] as const] : []));
  const name = (row: CategoryRow) => row.local_name ?? row.name;
  const shown = (row: CategoryRow | undefined): row is CategoryRow => !!row && row.nav_visible && !row.archived;

  /** A built-in column link: kept as is, renamed after its category, or dropped with it. */
  function columnLink(link: { labelKey: string; href: string }): NavLink | null {
    if (!link.href.startsWith("/c/")) return { label: t(link.labelKey), href: link.href };
    const slug = link.href.slice(3).split(/[?#]/)[0].replace(/\/+$/, "");
    const row = bySlug.get(slug);
    if (!row) return SEED_SLUGS.has(slug) ? null : { label: t(link.labelKey), href: link.href };
    if (!shown(row)) return null;
    const source = menuSourceKey(row.key);
    const renamed = !source || name(row) !== t(source);
    return { label: renamed ? name(row) : t(link.labelKey), href: link.href };
  }

  return roots.map((root): NavItem => {
    const builtIn = megaNav.find(item => item.categoryKey === root.key);
    const products: NavLink[] = placements
      .filter(row => row.menu_category_id === root.id)
      .flatMap(row => {
        const target = byId.get(row.category_id);
        if (!shown(target) || !target.slug) return [];
        return [{ label: row.label?.[locale] ?? name(target), href: row.href ?? `/c/${target.slug}` }];
      });

    let columns: NavGroup[][] | undefined;
    if (builtIn?.columns) {
      const groups = itemGroups(builtIn);
      const productGroups = groups.filter(entry => entry.products);
      let next = 0;
      const built: NavGroup[][] = builtIn.columns.map(() => []);
      groups.forEach(entry => {
        if (entry.products) {
          const last = entry === productGroups.at(-1);
          const take = last ? products.length - next : Math.min(entry.group.links.length, products.length - next);
          const slice = products.slice(next, next + take);
          next += take;
          if (slice.length) built[entry.column].push({ ...(entry.group.headingKey ? { heading: t(entry.group.headingKey) } : {}), links: slice });
          return;
        }
        const resolved = resolveNavGroup(entry.group, t);
        const kept = entry.group.links.map(columnLink).filter((link): link is NavLink => link !== null);
        if (kept.length) built[entry.column].push({ ...resolved, links: kept });
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
