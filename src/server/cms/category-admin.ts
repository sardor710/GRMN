import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { seriesValue } from "../../lib/catalog-facets.ts";
import { megaNav } from "../../lib/homepage-nav.ts";
import { columnLinkResolver, readMenuConfig, SEED_KEY_BY_SLUG, type MenuCategoryRow } from "../catalog/mega-nav.ts";
import { builtInLayout, itemLayoutSchema, MENU_CONFIG_KEY, MENU_LOCALES, parseMenuConfig, type ItemLayout, type LayoutCategory, type MenuConfig, type Translator } from "../catalog/menu-layout.ts";
import en from "../../../messages/en.json" with { type: "json" };
import ru from "../../../messages/ru.json" with { type: "json" };
import kk from "../../../messages/kk.json" with { type: "json" };

// Owner 2026-11-22: Admin ▸ Categories (/api/admin/catalog/categories*). Three sections:
//   menu        catalog roots = top menu items; each lists its placements (the Products group, in order) and the
//               other catalog categories under it (links in the code-owned columns: Maps, Markets…)
//   accessories accessory categories and the types inside them (band sizes, charger types)
//   series      the watch-series children used by the Series filter
// Every write runs under the taxonomy guard row and needs the epoch the editor read (409 VERSION_CONFLICT
// otherwise); every write returns the whole tree with the new epoch. Keys and slugs are fixed at creation.

export const SERIES_ROOT_KEY = "watch-series";
type Locale = "en" | "ru" | "kk";
export type LocalName = { en: string; ru: string | null; kk: string | null };
export interface AdminNode {
  key: string; slug: string | null; kind: string; name: LocalName; parentKey: string | null; position: number; navVisible: boolean;
  productCount: number; childCount: number;
}
export interface AdminPlacement extends AdminNode { href: string | null; label: Partial<Record<Locale, string>> | null }
/** Text in every language as the storefront shows it. */
export type LocalText = Record<Locale, string>;
/**
 * A column link of a top item (owner 2026-11-24). `category` is set when the link opens a category page:
 * "hidden" (the category is hidden from the menu, so the link is too), "removed" (deleted or archived).
 */
export interface AdminMenuLink {
  id: string; href: string; external: boolean; label: LocalText; customLabel: boolean; hidden: boolean;
  category: { key: string; state: "shown" | "hidden" | "removed"; name: LocalText } | null;
}
/** A heading of a top item in layout order; the Products heading's links are the placements. */
export interface AdminMenuGroup { id: string; column: number; products: boolean; heading: LocalText | null; hidden: boolean; links: AdminMenuLink[] }
/** `layout` is what the admin edits and sends back whole; `customized` is false while the built-in columns show. */
export interface AdminMenuItem extends AdminNode { menuHref: string | null; placements: AdminPlacement[]; layout: ItemLayout; customized: boolean; groups: AdminMenuGroup[]; others: AdminNode[] }
export interface MenuTarget { key: string; slug: string; kind: string; name: string; hidden: boolean }
export interface AdminAccessory extends AdminNode { children: AdminNode[] }
export interface AdminCategoryTree { epoch: string; menu: AdminMenuItem[]; accessories: AdminAccessory[]; series: AdminNode[]; targets: MenuTarget[] }
export interface CategoryUsage { products: number; children: number; typeLinks: number; promotions: number; priceRules: number; presets: number }

export class CategoryInUse extends AuthFailure {
  readonly counts: CategoryUsage;
  constructor(counts: CategoryUsage) {
    super("IN_USE", 409, "This category is still in use; move what is attached first");
    this.counts = counts;
  }
}

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (message = "Invalid or unknown fields"): never => fail("INVALID_INPUT", 400, message);
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); return result.success ? result.data : invalid(result.error.issues[0]?.message); }

const categoryKey = z.string().trim().min(1).max(200);
const nameText = z.string().trim().max(200);
const createInput = z.object({
  section: z.enum(["menu", "menu-child", "accessory", "accessory-type", "series"]),
  parentKey: categoryKey.optional(),
  name: z.object({ en: nameText.min(1, "An English name is required"), ru: nameText.optional(), kk: nameText.optional() }).strict(),
  navVisible: z.boolean().optional(),
}).strict();
const updateInput = z.object({
  name: z.object({ en: nameText.min(1, "The English name cannot be empty").optional(), ru: nameText.optional(), kk: nameText.optional() }).strict().optional(),
  navVisible: z.boolean().optional(),
}).strict().refine(value => value.name !== undefined || value.navVisible !== undefined, "Nothing to change");
const orderInput = z.object({ parentKey: categoryKey.nullable(), keys: z.array(categoryKey).min(1).max(500) }).strict();
const placementsInput = z.object({ keys: z.array(categoryKey).max(500) }).strict();

/** URL slug segment from an English name (fēnix → fenix, "Charging Clip (USB-C)" → charging-clip-usb-c). */
export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "category";
}

interface Row { id: string; key: string; slug: string | null; kind: string; parent_id: string | null; parent_key: string | null; position: number; nav_visible: boolean; menu_href: string | null; name: string; ru: string | null; kk: string | null; products: number; children: number }

async function rows(client: Pick<PoolClient, "query">): Promise<Row[]> {
  return (await client.query<Row>(`SELECT c.id,c.key,c.slug,c.kind,c.parent_id,p.key AS parent_key,c.position,c.nav_visible,c.menu_href,c.name,
      (SELECT t.name FROM category_translations t WHERE t.category_id=c.id AND t.locale='ru') AS ru,
      (SELECT t.name FROM category_translations t WHERE t.category_id=c.id AND t.locale='kk') AS kk,
      (SELECT count(*)::int FROM product_categories pc WHERE pc.category_id=c.id) AS products,
      (SELECT count(*)::int FROM categories x WHERE x.parent_id=c.id AND NOT x.archived) AS children
    FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE NOT c.archived ORDER BY c.position,c.key`)).rows;
}
const node = (row: Row): AdminNode => ({ key: row.key, slug: row.slug, kind: row.kind, name: { en: row.name, ru: row.ru, kk: row.kk }, parentKey: row.parent_key, position: row.position, navVisible: row.nav_visible, productCount: row.products, childCount: row.children });

export async function readCategoryTree(client: Pick<PoolClient, "query">): Promise<AdminCategoryTree> {
  const epoch = (await client.query<{ epoch: string }>("SELECT epoch::text AS epoch FROM catalog_taxonomy_guard WHERE id=1")).rows[0]?.epoch ?? "0";
  const all = await rows(client);
  const byId = new Map(all.map(row => [row.id, row]));
  const placements = (await client.query<{ menu_category_id: string; category_id: string; href: string | null; label: AdminPlacement["label"] }>(
    "SELECT menu_category_id,category_id,href,label FROM category_menu_placements ORDER BY menu_category_id,position,id")).rows;
  const descendants = (rootId: string) => {
    const out: Row[] = [], queue = [rootId];
    while (queue.length) { const id = queue.shift()!; for (const row of all) if (row.parent_id === id) { out.push(row); queue.push(row.id); } }
    return out;
  };
  const config = await readMenuConfig(client);
  const context = menuContext(await menuCategoryRows(client));
  const menu = all.filter(row => row.kind === "catalog" && row.parent_id === null).map((root): AdminMenuItem => {
    const placed = placements.filter(row => row.menu_category_id === root.id).flatMap(row => { const target = byId.get(row.category_id); return target ? [{ ...node(target), href: row.href, label: row.label }] : []; });
    const layout = effectiveLayout(root.key, config, context);
    const groups = adminGroups(layout, context);
    const shownKeys = new Set([...placed.map(row => row.key), ...groups.flatMap(group => group.links.flatMap(link => link.category?.key ? [link.category.key] : []))]);
    return { ...node(root), menuHref: root.menu_href, placements: placed, layout, customized: root.key in config.items, groups, others: descendants(root.id).filter(row => row.kind === "catalog" && !shownKeys.has(row.key)).map(node) };
  });
  const accessories = all.filter(row => row.kind === "accessory" && row.parent_id === null).map((root): AdminAccessory => ({ ...node(root), children: descendants(root.id).map(node) }));
  const seriesRoot = all.find(row => row.key === SERIES_ROOT_KEY);
  const series = seriesRoot ? all.filter(row => row.parent_id === seriesRoot.id).map(node) : [];
  return { epoch, menu, accessories, series, targets: menuTargets(context) };
}

// ── Menu columns (owner 2026-11-24) ────────────────────────────────────────────────────────────────────────────
type MenuRow = MenuCategoryRow & { ru: string | null; kk: string | null };
const MESSAGES: Record<Locale, unknown> = { en, ru, kk };
const lookup = (messages: unknown, key: string): string | undefined => {
  const value = key.split(".").reduce<unknown>((at, part) => (at && typeof at === "object" ? (at as Record<string, unknown>)[part] : undefined), messages);
  return typeof value === "string" ? value : undefined;
};
const translator = (locale: Locale) => (key: string) => lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.en, key) ?? key;
const T: Translator = { en: translator("en"), ru: translator("ru"), kk: translator("kk") };

/** Every category, archived included, the way the menu builder reads them. */
async function menuCategoryRows(client: Pick<PoolClient, "query">): Promise<MenuRow[]> {
  return (await client.query<MenuRow>(`SELECT c.id,c.key,c.slug,c.kind,c.parent_id,c.nav_visible,c.archived,c.menu_href,c.name,NULL::text AS local_name,
      (SELECT t.name FROM category_translations t WHERE t.category_id=c.id AND t.locale='ru') AS ru,
      (SELECT t.name FROM category_translations t WHERE t.category_id=c.id AND t.locale='kk') AS kk
    FROM categories c ORDER BY c.parent_id NULLS FIRST,c.position,c.key`)).rows;
}

interface MenuContext { bySlug: Map<string, LayoutCategory>; byKey: Map<string, LayoutCategory & { kind: string }>; resolve: (locale: Locale, link: { labelKey: string; href: string }) => string | null }
function menuContext(menuRows: readonly MenuRow[]): MenuContext {
  const resolvers = Object.fromEntries(MENU_LOCALES.map(locale => [locale, columnLinkResolver(menuRows.map(row => ({ ...row, local_name: locale === "en" ? null : row[locale] })), T[locale])])) as Record<Locale, ReturnType<typeof columnLinkResolver>>;
  const categories = menuRows.map(row => ({ key: row.key, slug: row.slug, kind: row.kind, nav_visible: row.nav_visible, archived: row.archived, name: { en: row.name, ru: row.ru ?? row.name, kk: row.kk ?? row.name } }));
  return {
    bySlug: new Map(categories.flatMap(row => row.slug ? [[row.slug, row] as const] : [])),
    byKey: new Map(categories.map(row => [row.key, row])),
    resolve: (locale, link) => resolvers[locale](link)?.label ?? null,
  };
}
/** The item's stored layout, or its built-in columns converted to one. */
function effectiveLayout(rootKey: string, config: MenuConfig, context: MenuContext): ItemLayout {
  return config.items[rootKey] ?? builtInLayout(megaNav.find(item => item.categoryKey === rootKey), { bySlug: context.bySlug, seedKeyBySlug: SEED_KEY_BY_SLUG }, T, context.resolve);
}
const perLocale = (pick: (locale: Locale) => string): LocalText => ({ en: pick("en"), ru: pick("ru"), kk: pick("kk") });

/** The layout as the admin lists it: every text resolved per language, each category link with its state. */
function adminGroups(layout: ItemLayout, context: MenuContext): AdminMenuGroup[] {
  return layout.groups.map((group): AdminMenuGroup => ({
    id: group.id, column: group.column, products: group.products === true, hidden: group.hidden === true,
    heading: group.heading ? perLocale(locale => group.heading?.[locale] ?? group.heading?.en ?? "") : null,
    links: group.links.map((link): AdminMenuLink => {
      const row = link.category === undefined ? undefined : context.byKey.get(link.category);
      const category = link.category === undefined ? null : {
        key: link.category, state: (!row || row.archived ? "removed" : row.nav_visible ? "shown" : "hidden") as "shown" | "hidden" | "removed",
        name: row ? row.name : perLocale(() => link.category!),
      };
      const href = link.href ?? (row?.slug ? `/c/${row.slug}` : "");
      return {
        id: link.id, href, external: /^https?:\/\//.test(href), hidden: link.hidden === true, customLabel: link.category !== undefined && link.label !== undefined,
        label: perLocale(locale => link.label?.[locale] ?? (category ? category.name[locale] : link.label?.en ?? href)), category,
      };
    }),
  }));
}

/** Categories a menu link can open (each has its own /c page). */
function menuTargets(context: MenuContext): MenuTarget[] {
  return [...context.byKey.values()].filter(row => !row.archived && row.slug && (row.kind === "catalog" || row.kind === "accessory"))
    .map(row => ({ key: row.key, slug: row.slug!, kind: row.kind, name: row.name.en, hidden: !row.nav_visible }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Replace (or, with null, restore to the built-in columns) the whole column layout of top item `menuKey`. */
export async function setMenuLayout(client: PoolClient, epoch: string, menuKey: string, raw: unknown): Promise<void> {
  const body = parse(z.object({ layout: z.unknown() }).strict(), raw);
  await lock(client, epoch);
  const root = (await rows(client)).find(row => row.key === menuKey) ?? fail("NOT_FOUND", 404, "Menu item was not found");
  if (root.kind !== "catalog" || root.parent_id !== null) invalid("Headings and links belong to a top menu item");
  const settings = (await client.query<{ config: unknown }>(`SELECT presentation_config->'${MENU_CONFIG_KEY}' AS config FROM store_settings WHERE id=1 FOR UPDATE`)).rows[0]
    ?? fail("SETTINGS_MISSING", 409, "Store settings have not been saved yet: save Admin ▸ Settings once, then try again");
  const config = parseMenuConfig(settings.config);
  if (body.layout === null) delete config.items[root.key];
  else {
    const layout = parse(itemLayoutSchema, body.layout) as ItemLayout;
    const context = menuContext(await menuCategoryRows(client));
    for (const link of layout.groups.flatMap(group => group.links)) {
      if (link.category === undefined) continue;
      const row = context.byKey.get(link.category);
      // A converted built-in link may keep pointing at a deleted seed category (it stays dropped); a new one may not.
      const known = config.items[root.key] ?? effectiveLayout(root.key, { items: {} }, context);
      const kept = known.groups.some(group => group.links.some(entry => entry.id === link.id && entry.category === link.category));
      if (!row && !kept) invalid(`Category ${link.category} was not found`);
      if (row && !(row.kind === "catalog" || row.kind === "accessory") && !kept) invalid("A menu link can open a menu or accessory category");
    }
    config.items[root.key] = layout;
  }
  await writeMenuConfig(client, config);
}

async function writeMenuConfig(client: PoolClient, config: MenuConfig): Promise<void> {
  if (Object.keys(config.items).length) await client.query("UPDATE store_settings SET presentation_config=presentation_config||jsonb_build_object($1::text,$2::jsonb) WHERE id=1", [MENU_CONFIG_KEY, JSON.stringify({ version: 2, items: config.items })]);
  else await client.query("UPDATE store_settings SET presentation_config=presentation_config-$1::text WHERE id=1", [MENU_CONFIG_KEY]);
  // store_settings has no taxonomy trigger: move the epoch so the cached header menu and open editors see the change.
  await client.query("UPDATE catalog_taxonomy_guard SET epoch=epoch+1 WHERE id=1");
}

/** Locks the taxonomy guard row and checks the editor's epoch. */
async function lock(client: PoolClient, expected: string): Promise<void> {
  if (!/^\d{1,19}$/.test(expected)) invalid("Missing or invalid category version");
  const current = (await client.query<{ epoch: string }>("SELECT epoch::text AS epoch FROM catalog_taxonomy_guard WHERE id=1 FOR UPDATE")).rows[0]?.epoch;
  if (current !== expected) fail("VERSION_CONFLICT", 409, "Categories changed; reload before saving");
}
async function find(client: PoolClient, key: string): Promise<Row> {
  return (await rows(client)).find(row => row.key === key) ?? fail("NOT_FOUND", 404, "Category was not found");
}
async function uniqueSlug(client: PoolClient, base: string): Promise<string> {
  const taken = new Set((await client.query<{ slug: string }>("SELECT slug FROM categories WHERE slug=$1 OR slug LIKE $2 OR key=$1 OR key LIKE $2", [base, `${base}-%`])).rows.map(row => row.slug));
  const keys = new Set((await client.query<{ key: string }>("SELECT key FROM categories WHERE key=$1 OR key LIKE $2", [base, `${base}-%`])).rows.map(row => row.key));
  for (let n = 1; ; n++) { const candidate = n === 1 ? base : `${base}-${n}`; if (!taken.has(candidate) && !keys.has(candidate)) return candidate; }
}
async function setTranslation(client: PoolClient, categoryId: string, locale: "ru" | "kk", value: string | undefined): Promise<void> {
  if (value === undefined) return;
  if (value === "") await client.query("DELETE FROM category_translations WHERE category_id=$1 AND locale=$2", [categoryId, locale]);
  else await client.query("INSERT INTO category_translations(category_id,locale,name) VALUES($1,$2,$3) ON CONFLICT (category_id,locale) DO UPDATE SET name=excluded.name", [categoryId, locale, value]);
}

export async function createCategory(client: PoolClient, epoch: string, raw: unknown): Promise<void> {
  const input = parse(createInput, raw);
  await lock(client, epoch);
  const all = await rows(client);
  const parentKey = input.section === "series" ? SERIES_ROOT_KEY : input.parentKey;
  const needsParent = input.section === "menu-child" || input.section === "accessory-type" || input.section === "series";
  if (needsParent && !parentKey) invalid("Choose where the category goes");
  if (!needsParent && input.parentKey) invalid("A top-level category has no parent");
  const parent = parentKey ? all.find(row => row.key === parentKey) ?? fail("NOT_FOUND", 404, "Parent category was not found") : null;
  if (input.section === "menu-child" && !(parent && parent.kind === "catalog" && parent.parent_id === null)) invalid("A menu subcategory goes under a top menu item");
  if (input.section === "accessory-type" && !(parent && parent.kind === "accessory" && parent.parent_id === null)) invalid("An accessory type goes under an accessory category");
  const kind = input.section === "menu" || input.section === "menu-child" ? "catalog" : input.section === "accessory" ? "accessory" : "group";
  const slug = await uniqueSlug(client, parent?.slug ? `${parent.slug}/${slugify(input.name.en)}` : slugify(input.name.en));
  const siblings = all.filter(row => row.parent_id === (parent?.id ?? null) && (parent || row.kind === kind));
  const position = siblings.reduce((max, row) => Math.max(max, row.position + 1), 0);
  const navVisible = input.navVisible ?? kind !== "group";
  const presets = input.section === "series" ? { seriesKeys: [slug] } : {};
  const id = randomUUID();
  await client.query("INSERT INTO categories(id,key,name,kind,slug,parent_id,position,preset_filters,nav_visible) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, slug, input.name.en, kind, slug, parent?.id ?? null, position, JSON.stringify(presets), navVisible]);
  await setTranslation(client, id, "ru", input.name.ru || undefined);
  await setTranslation(client, id, "kk", input.name.kk || undefined);
  if (input.section === "menu-child" && parent) {
    await client.query(`INSERT INTO category_menu_placements(id,menu_category_id,category_id,position)
      VALUES($1,$2,$3,(SELECT coalesce(max(position)+1,0) FROM category_menu_placements WHERE menu_category_id=$2))`, [randomUUID(), parent.id, id]);
  }
}

export async function updateCategory(client: PoolClient, epoch: string, key: string, raw: unknown): Promise<void> {
  const input = parse(updateInput, raw);
  await lock(client, epoch);
  const row = await find(client, key);
  // Only a real change counts: saving the dialog with the same names must keep the menu's own wording.
  const current: Record<"en" | "ru" | "kk", string | null> = { en: row.name, ru: row.ru, kk: row.kk };
  const changed = (["en", "ru", "kk"] as const).filter(locale => input.name?.[locale] !== undefined && (input.name[locale] || null) !== current[locale]);
  if (changed.includes("en")) await client.query("UPDATE categories SET name=$2 WHERE id=$1", [row.id, input.name!.en]);
  if (changed.includes("ru")) await setTranslation(client, row.id, "ru", input.name!.ru);
  if (changed.includes("kk")) await setTranslation(client, row.id, "kk", input.name!.kk);
  // A rename in a language replaces the menu's own wording for it ("All Smartwatches" → the new name).
  for (const locale of changed) {
    await client.query(`UPDATE category_menu_placements SET label=CASE WHEN (label - $2::text)='{}'::jsonb THEN NULL ELSE label - $2::text END
      WHERE category_id=$1 AND label ? $2`, [row.id, locale]);
  }
  if (input.navVisible !== undefined) await client.query("UPDATE categories SET nav_visible=$2 WHERE id=$1", [row.id, input.navVisible]);
}

export async function orderCategories(client: PoolClient, epoch: string, raw: unknown): Promise<void> {
  const input = parse(orderInput, raw);
  await lock(client, epoch);
  if (new Set(input.keys).size !== input.keys.length) invalid("A category is listed twice");
  const all = await rows(client);
  const parent = input.parentKey === null ? null : all.find(row => row.key === input.parentKey) ?? fail("NOT_FOUND", 404, "Parent category was not found");
  const listed = input.keys.map(key => all.find(row => row.key === key) ?? fail("NOT_FOUND", 404, `Category ${key} was not found`));
  if (listed.some(row => row.parent_id !== (parent?.id ?? null))) invalid("Every category must share the same parent");
  for (const [position, row] of listed.entries()) if (row.position !== position) await client.query("UPDATE categories SET position=$2 WHERE id=$1", [row.id, position]);
}

export async function setPlacements(client: PoolClient, epoch: string, menuKey: string, raw: unknown): Promise<void> {
  const input = parse(placementsInput, raw);
  await lock(client, epoch);
  if (new Set(input.keys).size !== input.keys.length) invalid("A category is listed twice");
  const all = await rows(client);
  const menu = all.find(row => row.key === menuKey) ?? fail("NOT_FOUND", 404, "Menu item was not found");
  if (menu.kind !== "catalog" || menu.parent_id !== null) invalid("Placements belong to a top menu item");
  const targets = input.keys.map(key => all.find(row => row.key === key) ?? fail("NOT_FOUND", 404, `Category ${key} was not found`));
  if (targets.some(row => row.kind !== "catalog")) invalid("Only menu categories can be placed in the menu");
  await client.query("DELETE FROM category_menu_placements WHERE menu_category_id=$1 AND NOT (category_id=ANY($2::uuid[]))", [menu.id, targets.map(row => row.id)]);
  for (const [position, target] of targets.entries()) {
    await client.query(`INSERT INTO category_menu_placements(id,menu_category_id,category_id,position) VALUES($1,$2,$3,$4)
      ON CONFLICT (menu_category_id,category_id) DO UPDATE SET position=excluded.position`, [randomUUID(), menu.id, target.id, position]);
  }
}

export async function categoryUsage(client: Pick<PoolClient, "query">, row: Pick<Row, "id" | "key" | "name">): Promise<CategoryUsage> {
  const counts = (await client.query<Omit<CategoryUsage, "presets">>(`SELECT
      (SELECT count(*)::int FROM product_categories WHERE category_id=$1) AS products,
      (SELECT count(*)::int FROM categories WHERE parent_id=$1) AS children,
      (SELECT count(*)::int FROM product_compatibility_types WHERE category_id=$1) AS "typeLinks",
      (SELECT count(*)::int FROM promotion_categories WHERE category_id=$1) AS promotions,
      (SELECT count(*)::int FROM price_adjustment_categories WHERE category_id=$1) AS "priceRules"`, [row.id])).rows[0];
  // Presets name a series by key (seriesKeys) or, in the seed, by a family label matched through seriesValue against
  // the series' slug segment (MARQ → marq) — the same rule the category page uses, so a rename never hides a reference.
  let presets = 0;
  if (row.key.startsWith(`${SERIES_ROOT_KEY}/`)) {
    const value = row.key.split("/").pop();
    const rowsWithPresets = (await client.query<{ series_keys: unknown; families: unknown }>(
      "SELECT preset_filters->'seriesKeys' AS series_keys,preset_filters->'families' AS families FROM categories WHERE id<>$1 AND (preset_filters ? 'seriesKeys' OR preset_filters ? 'families')", [row.id])).rows;
    const list = (raw: unknown) => Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
    presets = rowsWithPresets.filter(entry => list(entry.series_keys).includes(row.key) || list(entry.families).some(family => seriesValue(family) === value)).length;
  }
  return { ...counts, presets };
}

export async function deleteCategory(client: PoolClient, epoch: string, key: string): Promise<void> {
  await lock(client, epoch);
  const row = await find(client, key);
  const counts = await categoryUsage(client, row);
  if (Object.values(counts).some(count => count > 0)) throw new CategoryInUse(counts);
  await client.query("DELETE FROM categories WHERE id=$1", [row.id]);
  // A deleted top item takes its stored menu columns with it, so a new item with the same key starts fresh.
  if (row.kind === "catalog" && row.parent_id === null) {
    const stored = (await client.query<{ config: unknown }>(`SELECT presentation_config->'${MENU_CONFIG_KEY}' AS config FROM store_settings WHERE id=1 FOR UPDATE`)).rows[0];
    const config = parseMenuConfig(stored?.config);
    if (stored && row.key in config.items) { delete config.items[row.key]; await writeMenuConfig(client, config); }
  }
}
