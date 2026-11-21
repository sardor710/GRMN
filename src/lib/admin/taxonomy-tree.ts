// Pure helpers for the admin category tree (GET /api/admin/catalog/taxonomy): build the tree per kind,
// search it, label paths, and keep a product's category list valid (exactly one primary).
import type { TaxonomyNode } from "../../contracts/admin-catalog.ts";

export type TaxonomySection = "catalog" | "accessory" | "group";
export const TAXONOMY_SECTIONS: { kind: TaxonomySection; title: string }[] = [
  { kind: "catalog", title: "Catalog categories" },
  { kind: "accessory", title: "Accessory categories" },
  { kind: "group", title: "Groups (QuickFit sizes, watch series)" },
];

export interface TaxonomyTreeNode { node: TaxonomyNode; children: TaxonomyTreeNode[]; depth: number }
export interface CategoryRef { key: string; primary: boolean }

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[™®©]/g, "").toLowerCase().trim();
}

/** Roots grouped by section. A node lives in the section of its own kind (children follow their parent). */
export function buildTaxonomyTree(nodes: readonly TaxonomyNode[]): Record<TaxonomySection, TaxonomyTreeNode[]> {
  const byKey = new Map(nodes.map(node => [node.key, node]));
  const children = new Map<string, TaxonomyNode[]>();
  const roots: TaxonomyNode[] = [];
  for (const node of nodes) {
    if (node.parentKey && byKey.has(node.parentKey)) {
      const list = children.get(node.parentKey) ?? [];
      list.push(node);
      children.set(node.parentKey, list);
    } else roots.push(node);
  }
  const order = (a: TaxonomyNode, b: TaxonomyNode) => a.position - b.position || a.name.localeCompare(b.name);
  const build = (node: TaxonomyNode, depth: number, seen: Set<string>): TaxonomyTreeNode => {
    seen.add(node.key);
    const kids = (children.get(node.key) ?? []).filter(child => !seen.has(child.key)).sort(order);
    return { node, depth, children: kids.map(child => build(child, depth + 1, seen)) };
  };
  const result: Record<TaxonomySection, TaxonomyTreeNode[]> = { catalog: [], accessory: [], group: [] };
  for (const root of roots.sort(order)) {
    const kind = (["catalog", "accessory", "group"] as const).find(k => k === root.kind) ?? "catalog";
    result[kind].push(build(root, 0, new Set()));
  }
  return result;
}

/**
 * Keeps nodes whose name matches every search word, plus their ancestors (so the path stays visible).
 * Returns the filtered roots and the keys to expand. An empty query returns the input unchanged.
 */
export function filterTaxonomyTree(roots: TaxonomyTreeNode[], query: string): { roots: TaxonomyTreeNode[]; expanded: Set<string>; matches: number } {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const expanded = new Set<string>();
  if (!words.length) return { roots, expanded, matches: 0 };
  let matches = 0;
  const visit = (tree: TaxonomyTreeNode): TaxonomyTreeNode | null => {
    const name = normalizeSearch(tree.node.name);
    const self = words.every(word => name.includes(word));
    const kids = tree.children.map(visit).filter((child): child is TaxonomyTreeNode => child !== null);
    if (self) matches++;
    if (!self && !kids.length) return null;
    if (kids.length) expanded.add(tree.node.key);
    return { ...tree, children: self && !kids.length ? tree.children : kids };
  };
  return { roots: roots.map(visit).filter((tree): tree is TaxonomyTreeNode => tree !== null), expanded, matches };
}

export function taxonomyIndex(nodes: readonly TaxonomyNode[]): Map<string, TaxonomyNode> {
  return new Map(nodes.map(node => [node.key, node]));
}

/** Ancestor keys from the root down (excluding the node itself). */
export function ancestorKeys(index: Map<string, TaxonomyNode>, key: string): string[] {
  const path: string[] = [];
  for (let current = index.get(key)?.parentKey ?? null, depth = 0; current && depth < 32; depth++) {
    path.unshift(current);
    current = index.get(current)?.parentKey ?? null;
  }
  return path;
}

/** "Wearables › Running Smartwatches"; unknown keys fall back to the key itself. */
export function categoryPath(index: Map<string, TaxonomyNode>, key: string): string {
  const node = index.get(key);
  if (!node) return key;
  return [...ancestorKeys(index, key).map(k => index.get(k)?.name ?? k), node.name].join(" › ");
}

/** Exactly one primary when the list is not empty (keeps the current primary, else the first entry). */
export function normalizeCategories(list: readonly CategoryRef[]): CategoryRef[] {
  const unique: CategoryRef[] = [];
  for (const item of list) if (!unique.some(u => u.key.toLowerCase() === item.key.toLowerCase())) unique.push({ key: item.key, primary: item.primary });
  const primary = unique.findIndex(item => item.primary);
  return unique.map((item, index) => ({ key: item.key, primary: index === (primary < 0 ? 0 : primary) }));
}

export function toggleCategory(list: readonly CategoryRef[], key: string): CategoryRef[] {
  if (list.some(item => item.key === key)) return normalizeCategories(list.filter(item => item.key !== key));
  return normalizeCategories([...list, { key, primary: list.length === 0 }]);
}

export function setPrimaryCategory(list: readonly CategoryRef[], key: string): CategoryRef[] {
  const has = list.some(item => item.key === key);
  const next = has ? list : [...list, { key, primary: false }];
  return next.map(item => ({ key: item.key, primary: item.key === key }));
}
