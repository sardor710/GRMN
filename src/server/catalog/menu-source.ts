// Where each seed category appears in today's built-in menu (src/lib/homepage-nav.ts `megaNav`). Pure, no DB.
// Shared by the taxonomy loader (names, RU/KK translations, placements) and the menu builder (which links in the
// code-owned columns stand for a category), so both read the menu the same way.
//
// A menu link stands for a category when its href is `/c/<slug>` of that category, or, for a local non-/c link,
// when it is the category's seed `sourceHref` (MARQ Luxury Watch Collection → /minisite/marq). A top item stands for
// its `categoryKey`. A group belongs to the Products group when its heading is Header.groups.products, or when it
// has no heading and directly continues a Products group (Marine's second column).
import type { MegaGroup, MegaNavItem } from "../../lib/homepage-nav.ts";

export const PRODUCTS_HEADING = "Header.groups.products";

export interface MenuNodeRef { key: string; slug: string | null; sourceHref?: string }

export interface MenuLinkRef {
  itemIndex: number;
  labelKey: string;
  href: string;
  products: boolean;
  /** Category this link stands for, or null for a plain link. */
  nodeKey: string | null;
}

/** Category key a menu href stands for, or null. */
export function nodeForHref(href: string, nodes: readonly MenuNodeRef[]): string | null {
  if (href.startsWith("/c/")) {
    const slug = href.slice(3).split(/[?#]/)[0].replace(/\/+$/, "");
    return nodes.find(node => node.slug === slug)?.key ?? null;
  }
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return nodes.find(node => node.sourceHref === href)?.key ?? null;
}

/** Groups of a top item in reading order, each tagged with its column and whether it is part of Products. */
export function itemGroups(item: Pick<MegaNavItem, "columns">): { column: number; group: MegaGroup; products: boolean }[] {
  const out: { column: number; group: MegaGroup; products: boolean }[] = [];
  let previousProducts = false;
  (item.columns ?? []).forEach((column, columnIndex) => {
    for (const group of column) {
      const products = group.headingKey === PRODUCTS_HEADING || (group.headingKey === undefined && previousProducts);
      out.push({ column: columnIndex, group, products });
      previousProducts = products;
    }
  });
  return out;
}

/** Every column link of the menu, in reading order, with the category it stands for. */
export function menuLinks(items: readonly MegaNavItem[], nodes: readonly MenuNodeRef[]): MenuLinkRef[] {
  return items.flatMap((item, itemIndex) => itemGroups(item).flatMap(({ group, products }) =>
    group.links.map(link => ({ itemIndex, labelKey: link.labelKey, href: link.href, products, nodeKey: nodeForHref(link.href, nodes) }))));
}

/**
 * The message key that names each category: a root's top item label; otherwise its first Products-group link,
 * else its first link in any other column. Categories the menu never shows have no entry.
 */
export function menuSourceKeys(items: readonly MegaNavItem[], nodes: readonly MenuNodeRef[]): Map<string, string> {
  const source = new Map<string, string>();
  for (const item of items) if (nodes.some(node => node.key === item.categoryKey)) source.set(item.categoryKey, item.labelKey);
  const links = menuLinks(items, nodes);
  for (const products of [true, false]) {
    for (const link of links) if (link.products === products && link.nodeKey && !source.has(link.nodeKey)) source.set(link.nodeKey, link.labelKey);
  }
  return source;
}
