import "server-only";
// Taxonomy-driven category pages (M4.2/M4.3). A category lists the published products assigned to it or to
// any descendant through product_categories. garmin.com subcategories are curated lists, so membership is
// never derived from activity/level presets; `preset_filters` only pre-check facets on the few pages where
// garmin.com pre-applies a filter from its menu link (URL_PRESET_SLUGS).
import type { Pool } from "pg";
import { z } from "zod";
import type { ProductCardDTO } from "../../contracts/commerce.ts";
import type { CatalogSortKey, CategoryCrumbDTO, CategoryDTO, CategoryFilterInput, CategoryKindDTO, CategoryPageDTO } from "../../contracts/catalog-browse.ts";
import { activityKey, caseSizeBucket, computeFacets, emptySelection, matchesSelection, parseSort, seriesValue, sortProducts, type CaseSizeBucket, type FacetProduct, type FacetSelection } from "../../lib/catalog-facets.ts";
import { AuthFailure } from "../auth/config.ts";
import { eligibleFrom, keySQL, stateSQL, variantsFrom } from "./service.ts";

type Query = Pick<Pool, "query">;
const fail = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid catalog query or cursor"); };

/** Same rule as the categories_slug_valid check. */
export const CATEGORY_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;
/** Slugs whose garmin.com menu link pre-applies a filter (Women: Features → Watches for women; MARQ: series=MARQ). */
export const URL_PRESET_SLUGS: ReadonlySet<string> = new Set(["women-wearables", "wearables-smartwatches/marq-luxury-watch-collection"]);
/** Group pages that the storefront links to (WearablesHero series tiles); other groups resolve only when nav-visible. */
export const LINKED_GROUP_PREFIXES: readonly string[] = ["watch-series/"];
export const CATEGORY_PAGE_SIZE = 24;

const value = z.string().trim().min(1).max(100);
const inputSchema = z.object({
  market: z.string().trim().min(1).max(200),
  filters: z.object({
    series: z.array(value).max(30).optional(), activities: z.array(value).max(30).optional(), levels: z.array(value).max(10).optional(),
    caseSizes: z.array(value).max(10).optional(), prices: z.array(value).max(10).optional(), inStock: z.boolean().optional(),
  }).strict().default({}),
  /** False when the URL carries no facet parameter: URL presets may then pre-check facets. */
  explicit: z.boolean().default(false),
  sort: z.string().max(40).optional(),
  /** Free-text search over name and description, like the product listing (?search=); blank means none. */
  search: z.string().max(200).optional(),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(100).default(CATEGORY_PAGE_SIZE),
}).strict();
export type CategoryPageInput = z.input<typeof inputSchema>;

interface CategoryRow { id: string; name: string; slug: string; kind: CategoryKindDTO; description: string | null; preset_filters: Record<string, unknown>; nav_visible: boolean }

export function groupResolvable(row: Pick<CategoryRow, "kind" | "slug" | "nav_visible">): boolean {
  return row.kind !== "group" || row.nav_visible || LINKED_GROUP_PREFIXES.some(prefix => row.slug.startsWith(prefix));
}

const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export async function resolveCategory(pool: Query, slug: string): Promise<(CategoryDTO & { id: string }) | null> {
  if (typeof slug !== "string" || slug.length > 512 || !CATEGORY_SLUG.test(slug)) return null;
  const row = (await pool.query<CategoryRow>("SELECT id,name,slug,kind,description,preset_filters,nav_visible FROM categories WHERE slug=$1 AND NOT archived", [slug])).rows[0];
  if (!row || !groupResolvable(row)) return null;
  const path = (await pool.query<CategoryCrumbDTO & { archived: boolean }>(`WITH RECURSIVE up AS (
      SELECT id,parent_id,name,slug,archived,0 AS depth FROM categories WHERE id=$1
      UNION ALL SELECT c.id,c.parent_id,c.name,c.slug,c.archived,up.depth+1 FROM categories c JOIN up ON c.id=up.parent_id WHERE up.depth<20
    ) SELECT name,slug,archived FROM up WHERE slug IS NOT NULL ORDER BY depth DESC`, [row.id])).rows;
  if (path.some(node => node.archived)) return null;
  const presetFilters = Object.fromEntries(Object.entries(row.preset_filters ?? {}).map(([key, list]) => [key, strings(list)]));
  return { id: row.id, name: row.name, slug: row.slug, kind: row.kind, description: row.description, path: path.map(({ name, slug: s }) => ({ name, slug: s })), presetFilters };
}

/** The preset as a facet selection, only for URL_PRESET_SLUGS. */
export function presetSelection(category: Pick<CategoryDTO, "slug" | "presetFilters">): FacetSelection | null {
  if (!URL_PRESET_SLUGS.has(category.slug)) return null;
  const p = category.presetFilters, selection = emptySelection();
  selection.activities = strings(p.activities).map(activityKey);
  selection.levels = strings(p.levels);
  selection.caseSizes = strings(p.caseSizes);
  selection.series = strings(p.families).map(seriesValue);
  return Object.values(selection).some(v => Array.isArray(v) && v.length) ? selection : null;
}

interface FactRow {
  id: string; public_key: string; name: string; is_featured: boolean; created_key: string; family: string | null;
  activity_keys: string[] | null; level: string | null; case_size: string | null; series: string[] | null;
  variants: { amount: string; available: boolean; sizes: string[] }[];
  search_match: boolean;
}

/** One row per eligible published product in the category subtree, with what facets, filters and sorts need. */
const factsSQL = () => `WITH RECURSIVE tree AS (
   SELECT id FROM categories WHERE id=$2
   UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id=t.id WHERE NOT c.archived
 ), members AS (SELECT DISTINCT pc.product_id FROM product_categories pc JOIN tree t ON t.id=pc.category_id)
 SELECT p.id,p.public_key,p.name,p.is_featured,p.family,
  ($3::text IS NULL OR p.name ILIKE $3 OR p.description ILIKE $3) AS search_match,
  to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_key,
  ${keySQL.activity_keys} AS activity_keys,${keySQL.level} AS level,${keySQL.case_size} AS case_size,
  ARRAY(SELECT c.slug||'|'||c.name FROM product_categories pc JOIN categories c ON c.id=pc.category_id AND NOT c.archived AND c.slug IS NOT NULL
        JOIN categories s ON s.id=c.parent_id AND s.key='watch-series' WHERE pc.product_id=p.id ORDER BY pc.is_primary DESC,c.position,c.name) AS series,
  offers.variants
 FROM members m JOIN products p ON p.id=m.product_id AND p.status='published'
 JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('amount',pr.amount_minor::text,'available',${stateSQL}='available',
   'sizes',COALESCE((SELECT jsonb_agg(ov.label) FROM variant_option_values vo JOIN product_options po ON po.id=vo.option_id JOIN option_values ov ON ov.id=vo.option_value_id
     WHERE vo.variant_id=v.id AND (po.key ILIKE '%size%' OR po.name ILIKE '%size%')),'[]'::jsonb)) ORDER BY v.is_default DESC,v.id) AS variants ${variantsFrom}) offers ON offers.variants IS NOT NULL`;

const PRODUCT_CASE = new Set<CaseSizeBucket>(["Small", "Medium", "Large"]);

export function factFromRow(row: FactRow): FacetProduct {
  const youth = row.level === "Youth";
  const productCase = row.case_size && PRODUCT_CASE.has(row.case_size as CaseSizeBucket) ? row.case_size as CaseSizeBucket : null;
  const series = (row.series ?? []).map(entry => { const at = entry.indexOf("|"); return { value: entry.slice(0, at).split("/").pop() ?? entry, label: entry.slice(at + 1) }; });
  const family = row.family?.replace(/[®™]/g, "").trim();
  if (!series.length && family) series.push({ value: seriesValue(family), label: family });
  return {
    key: row.public_key, name: row.name, featured: row.is_featured, createdKey: row.created_key,
    series, activities: row.activity_keys ?? [], level: row.level,
    variants: row.variants.map(v => {
      const bucket = v.sizes.map(caseSizeBucket).find(Boolean) ?? null;
      return { amountMinor: v.amount, available: v.available, caseSize: youth ? "Youth" : bucket ?? productCase };
    }),
  };
}

/** Same escaping as the product listing: the search text is matched literally (% _ and \\ are not wildcards). */
const likePattern = (search: string) => "%" + search.replace(/[\\%_]/g, match => "\\" + match) + "%";

/** The category's facts; `search` keeps only products whose name or description contains it. */
export async function loadCategoryFacts(pool: Query, market: string, categoryId: string, search?: string): Promise<{ all: FacetProduct[]; matching: FacetProduct[] }> {
  const text = search?.trim();
  const rows = (await pool.query<FactRow>(factsSQL(), [market, categoryId, text ? likePattern(text) : null])).rows;
  const all = rows.map(factFromRow);
  return { all, matching: text ? all.filter((_, index) => rows[index].search_match) : all };
}

/** Every resolvable category slug with at least one listed product (sitemap). */
export async function categorySlugsWithProducts(pool: Query, market: string): Promise<string[]> {
  const rows = (await pool.query<{ slug: string; kind: CategoryKindDTO; nav_visible: boolean }>(`WITH RECURSIVE listed AS (
      SELECT DISTINCT pc.category_id AS id FROM product_categories pc JOIN products p ON p.id=pc.product_id AND p.status='published'
      WHERE EXISTS(SELECT 1 ${eligibleFrom(false)})
    ), up AS (
      SELECT c.id,c.parent_id FROM categories c JOIN listed l ON l.id=c.id
      UNION SELECT c.id,c.parent_id FROM categories c JOIN up ON c.id=up.parent_id
    ) SELECT c.slug,c.kind,c.nav_visible FROM categories c JOIN up ON up.id=c.id WHERE c.slug IS NOT NULL AND NOT c.archived ORDER BY c.slug`, [market])).rows;
  return rows.filter(groupResolvable).map(r => r.slug);
}

function selectionFrom(filters: CategoryFilterInput): FacetSelection {
  return { series: [...(filters.series ?? [])], activities: [...(filters.activities ?? [])].map(activityKey), levels: [...(filters.levels ?? [])], caseSizes: [...(filters.caseSizes ?? [])], prices: [...(filters.prices ?? [])], inStock: filters.inStock === true };
}

export async function loadCategoryPage(
  pool: Query, slug: string, raw: CategoryPageInput,
  cardsByKeys: (keys: string[]) => Promise<ProductCardDTO[]>,
): Promise<CategoryPageDTO | null> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return fail();
  const input = parsed.data;
  const category = await resolveCategory(pool, slug);
  if (!category) return null;
  const { all, matching: facts } = await loadCategoryFacts(pool, input.market, category.id, input.search);
  const preset = input.explicit ? null : presetSelection(category);
  const selection = preset ?? selectionFrom(input.filters);
  const sort: CatalogSortKey = parseSort(input.sort);
  const matches = sortProducts(facts.filter(p => matchesSelection(p, selection)), sort);
  const pageCount = Math.max(1, Math.ceil(matches.length / input.pageSize));
  const page = Math.min(input.page, pageCount);
  const keys = matches.slice((page - 1) * input.pageSize, page * input.pageSize).map(p => p.key);
  const cards = new Map((keys.length ? await cardsByKeys(keys) : []).map(card => [card.publicKey, card]));
  const publicCategory: CategoryDTO = { name: category.name, slug: category.slug, kind: category.kind, description: category.description, path: category.path, presetFilters: category.presetFilters };
  return {
    category: publicCategory, facets: computeFacets(facts, selection),
    items: keys.flatMap(key => cards.get(key) ?? []),
    categoryTotal: all.length, total: matches.length, page, pageCount, pageSize: input.pageSize, sort, selection, presetApplied: preset !== null,
  };
}
