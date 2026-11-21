// Browser-side preselection of categories for a garmin.com import (plan M3.3): a simple name match of the
// draft's breadcrumb labels (subCategory, then category) against catalog/accessory categories, plus the
// watch-series group whose name prefixes the family ("fēnix 9" → fēnix). No match = no category.
// (The server-side importer has a richer alias table in src/server/catalog/category-match.ts, which client
// code may not import.)
import type { TaxonomyNode } from "../../contracts/admin-catalog.ts";

export function breadcrumbKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/&|\band\b/g, " ")
    .replace(/smart/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const SERIES_ROOT = "watch-series";

export function matchBreadcrumbCategories(nodes: readonly TaxonomyNode[], draft: { category?: unknown; subCategory?: unknown; family?: unknown }): { primaryKey: string | null; keys: string[] } {
  const keys: string[] = [];
  let primaryKey: string | null = null;
  const named = nodes.filter((node) => node.kind === "catalog" || node.kind === "accessory");
  for (const raw of [draft.subCategory, draft.category]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const label = breadcrumbKey(raw);
    const hit = named.find((node) => breadcrumbKey(node.name) === label);
    if (hit) { primaryKey = hit.key; keys.push(hit.key); break; }
  }
  if (typeof draft.family === "string" && draft.family.trim()) {
    const family = breadcrumbKey(draft.family);
    const series = nodes
      .filter((node) => node.kind === "group" && node.parentKey === SERIES_ROOT && family.startsWith(breadcrumbKey(node.name)) && breadcrumbKey(node.name).length > 0)
      .sort((a, b) => breadcrumbKey(b.name).length - breadcrumbKey(a.name).length)[0];
    if (series && !keys.includes(series.key)) keys.push(series.key);
  }
  return { primaryKey: primaryKey ?? keys[0] ?? null, keys };
}
