// Owner 2026-11-22: production starts from today's menu. Loads the seed taxonomy into an existing database.
// Idempotent and never overwrites owner edits:
//   - categories: inserts missing seed nodes only (by key). A node the menu shows is named after its menu label
//     (menu-source.ts), so the DB-built menu reads exactly like the built-in one; a top item whose link is not its
//     own /c/<slug> keeps that link in menu_href.
//   - translations: adds missing RU/KK names from the same menu labels, for nodes whose English name is unchanged.
//   - placements: fills the Products group of a top item only while that item has no placements at all, in menu
//     order; a link label or target that differs from the category's own is stored on the placement.
//   - products (assignProducts): a product with no categories gets its legacy category/subCategory, its watch
//     series and its accessory type (QuickFit 22 mm, Quick Release 20 mm, …); one primary.
import { randomUUID } from "node:crypto";
import en from "../../../messages/en.json" with { type: "json" };
import ru from "../../../messages/ru.json" with { type: "json" };
import kk from "../../../messages/kk.json" with { type: "json" };
import { megaNav } from "../../lib/homepage-nav.ts";
import { taxonomySeed, type TaxonomyNode } from "./taxonomy-seed.ts";
import { itemGroups, menuSourceKeys, nodeForHref } from "./menu-source.ts";
import { matchLegacyCategories } from "./category-match.ts";

interface Query { query<R extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> }
export interface TaxonomyLoadReport { inserted: number; translations: number; placements: number; assigned: number }
type Locale = "en" | "ru" | "kk";

const MESSAGES: Record<Locale, unknown> = { en, ru, kk };
/** A menu message (e.g. "Header.links.running") in one locale, or undefined. */
export function menuMessage(locale: Locale, key: string): string | undefined {
  let node: unknown = MESSAGES[locale];
  for (const part of key.split(".")) node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  return typeof node === "string" ? node : undefined;
}

const SOURCE = menuSourceKeys(megaNav, taxonomySeed);
/** English name a seed node gets on insert: its menu label, else its seed name. */
export function initialName(node: Pick<TaxonomyNode, "key" | "name">): string {
  const key = SOURCE.get(node.key);
  return (key && menuMessage("en", key)) || node.name;
}
/** The message key that names a seed category in the built-in menu, if it appears there. */
export const menuSourceKey = (key: string): string | undefined => SOURCE.get(key);

/** Accessory type a product belongs in, from its name/family (QuickFit and Quick Release widths, Lily, MARQ straps). */
export function accessoryTypeKey(text: string, primaryKey: string | null): string | null {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (primaryKey === "marq-straps-bracelets") return /bracelet/.test(value) ? "marq-straps-bracelets/marq-bracelets" : "marq-straps-bracelets/marq-straps";
  const quickfit = /quickfit\s*(20|22|26)\b/.exec(value);
  if (quickfit) return `bands/quickfit-${quickfit[1]}-mm`;
  const release = /quick release\b.*?\b(18|20|22)\s*mm/.exec(value);
  if (release) return `bands/quick-release-${release[1]}-mm`;
  if (/\blily\b.*\bbands?\b/.test(value)) return "bands/lily-bands";
  return null;
}

export async function loadTaxonomy(client: Query, { assignProducts }: { assignProducts: boolean }): Promise<TaxonomyLoadReport> {
  const report: TaxonomyLoadReport = { inserted: 0, translations: 0, placements: 0, assigned: 0 };
  const existing = new Map((await client.query<{ key: string; id: string; name: string }>("SELECT key,id,name FROM categories")).rows.map(row => [row.key, row]));
  const positions = new Map<string, number>();
  for (const node of taxonomySeed) {
    const siblings = node.parentKey ?? "";
    const position = positions.get(siblings) ?? 0;
    positions.set(siblings, position + 1);
    if (existing.has(node.key)) continue;
    const parent = node.parentKey ? existing.get(node.parentKey) : null;
    if (node.parentKey && !parent) throw new Error(`taxonomy load: parent ${node.parentKey} missing for ${node.key}`);
    const item = node.parentKey === null ? megaNav.find(entry => entry.categoryKey === node.key) : undefined;
    const menuHref = item && item.href !== `/c/${node.slug}` ? item.href : null;
    const id = randomUUID(), name = initialName(node);
    await client.query("INSERT INTO categories(id,key,name,kind,slug,parent_id,position,preset_filters,nav_visible,menu_href) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id, node.key, name, node.kind, node.slug, parent?.id ?? null, position, JSON.stringify(node.presetFilters ?? {}), node.navVisible, menuHref]);
    existing.set(node.key, { key: node.key, id, name });
    report.inserted++;
  }

  for (const node of taxonomySeed) {
    const row = existing.get(node.key), source = SOURCE.get(node.key);
    if (!row || !source || row.name !== initialName(node)) continue;
    for (const locale of ["ru", "kk"] as const) {
      const name = menuMessage(locale, source);
      if (!name) continue;
      const result = await client.query("INSERT INTO category_translations(category_id,locale,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [row.id, locale, name]);
      report.translations += result.rowCount ?? 0;
    }
  }

  const placed = new Set((await client.query<{ key: string }>("SELECT DISTINCT m.key FROM category_menu_placements p JOIN categories m ON m.id=p.menu_category_id")).rows.map(row => row.key));
  for (const item of megaNav) {
    const menu = existing.get(item.categoryKey);
    if (!menu || placed.has(item.categoryKey)) continue;
    let position = 0;
    for (const { group, products } of itemGroups(item)) {
      if (!products) continue;
      for (const link of group.links) {
        const key = nodeForHref(link.href, taxonomySeed);
        const target = key ? existing.get(key) : undefined;
        const seed = key ? taxonomySeed.find(node => node.key === key) : undefined;
        if (!key || !target || !seed) continue;
        const href = link.href === `/c/${seed.slug}` ? null : link.href;
        const label = link.labelKey === SOURCE.get(key)
          ? null
          : Object.fromEntries((["en", "ru", "kk"] as const).flatMap(locale => { const text = menuMessage(locale, link.labelKey); return text ? [[locale, text]] : []; }));
        const result = await client.query("INSERT INTO category_menu_placements(id,menu_category_id,category_id,position,href,label) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [randomUUID(), menu.id, target.id, position++, href, label ? JSON.stringify(label) : null]);
        report.placements += result.rowCount ?? 0;
      }
    }
  }

  if (assignProducts) {
    const products = (await client.query<{ id: string; name: string; family: string | null; category: string | null; sub_category: string | null }>(
      `SELECT p.id,p.name,p.family,p.legacy_content->>'category' AS category,p.legacy_content->>'subCategory' AS sub_category FROM products p
       WHERE NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id) ORDER BY p.created_at,p.id`)).rows;
    for (const product of products) {
      const match = matchLegacyCategories(taxonomySeed, { category: product.category, subCategory: product.sub_category, family: product.family });
      const keys = [...match.keys];
      const type = accessoryTypeKey(`${product.family ?? ""} ${product.name}`, match.primaryKey);
      if (type && !keys.includes(type)) keys.push(type);
      const ids = keys.flatMap(key => { const row = existing.get(key); return row ? [{ key, id: row.id }] : []; });
      if (!ids.length) continue;
      const primary = ids.find(entry => entry.key === match.primaryKey)?.key ?? ids[0].key;
      for (const entry of ids) {
        await client.query("INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [product.id, entry.id, entry.key === primary]);
      }
      report.assigned++;
    }
  }
  return report;
}
