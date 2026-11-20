// Task C-a (plan 2026-11-21 §3): Garmin-style product comparison, pure helpers shared by the compare page
// (server) and the compare tool (client). The URL is the source of truth: `item=<productId>~<variantSku>`
// repeated, at most five, `~<sku>` optional; old `selected=<id>` links keep working.
import type { ProductSpecItem, SpecGroup } from "../cms/types";

export const COMPARE_MAX_ITEMS = 5;
export const COMPARE_ITEM_PARAM = "item";
/** The old compare link parameter (`/compare?selected=<id>&selected=<id>`), read but never written. */
export const COMPARE_LEGACY_PARAM = "selected";
/** Separates the product id from the variant SKU inside one `item` value. */
export const COMPARE_SKU_SEPARATOR = "~";
/** Longest product id or SKU accepted from a URL; longer values are dropped. */
export const COMPARE_VALUE_MAX_LENGTH = 200;

/** One compare column as requested: a product and, optionally, the variant (size) to show. */
export interface CompareItemRef { productId: string; sku?: string }

/** A query string (with or without `?`), URLSearchParams, or a Next.js page `searchParams` record. */
export type CompareQuery = string | URLSearchParams | Readonly<Record<string, string | readonly string[] | undefined>>;

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= COMPARE_VALUE_MAX_LENGTH ? text : null;
};

/** A valid ref (trimmed), or null when the product id or SKU is empty, over-long or not a string. */
function toRef(productId: unknown, sku: unknown): CompareItemRef | null {
  const id = clean(productId);
  if (!id) return null;
  if (sku === undefined || sku === null || (typeof sku === "string" && !sku.trim())) return { productId: id };
  const variant = clean(sku);
  return variant ? { productId: id, sku: variant } : null;
}

/** Drops invalid refs and exact duplicates (same product and SKU) and keeps the first five. */
function normalizeRefs(refs: Iterable<CompareItemRef | null>): CompareItemRef[] {
  const seen = new Set<string>(), out: CompareItemRef[] = [];
  for (const ref of refs) {
    if (!ref) continue;
    const key = `${ref.productId}\u0000${ref.sku ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length === COMPARE_MAX_ITEMS) break;
  }
  return out;
}

function toSearchParams(query: unknown): URLSearchParams {
  if (query instanceof URLSearchParams) return query;
  if (typeof query === "string") {
    try { return new URLSearchParams(query.startsWith("?") ? query.slice(1) : query); } catch { return new URLSearchParams(); }
  }
  const params = new URLSearchParams();
  if (query === null || typeof query !== "object") return params;
  const record = query as Record<string, unknown>;
  // `item` values come before the old `selected` ones.
  for (const name of [COMPARE_ITEM_PARAM, COMPARE_LEGACY_PARAM]) {
    const raw = record[name];
    for (const value of Array.isArray(raw) ? raw : [raw]) if (typeof value === "string") params.append(name, value);
  }
  return params;
}

/**
 * The compare columns a URL asks for: repeated `item=<productId>~<sku>` (the SKU part optional), then the old
 * repeated `selected=<productId>`. Values are trimmed; empty or over-long ones are dropped, exact duplicates are
 * removed (the same product with another SKU is a separate column), and at most five are kept. Never throws.
 */
export function parseCompareItems(query: CompareQuery | null | undefined): CompareItemRef[] {
  const params = toSearchParams(query);
  const refs: (CompareItemRef | null)[] = [];
  for (const value of params.getAll(COMPARE_ITEM_PARAM)) {
    const at = value.indexOf(COMPARE_SKU_SEPARATOR);
    refs.push(at < 0 ? toRef(value, undefined) : toRef(value.slice(0, at), value.slice(at + 1)));
  }
  for (const value of params.getAll(COMPARE_LEGACY_PARAM)) refs.push(toRef(value, undefined));
  return normalizeRefs(refs);
}

/** `item=<productId>~<sku>` parameters for the given columns (cleaned like `parseCompareItems`); round-trips with it. */
export function serializeCompareItems(items: readonly CompareItemRef[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const ref of normalizeRefs(items.map((item) => toRef(item?.productId, item?.sku)))) {
    params.append(COMPARE_ITEM_PARAM, ref.sku ? `${ref.productId}${COMPARE_SKU_SEPARATOR}${ref.sku}` : ref.productId);
  }
  return params;
}

/** The same parameters as a query string (no leading `?`) that keeps `~` readable instead of `%7E`. */
export function compareQueryString(items: readonly CompareItemRef[]): string {
  return serializeCompareItems(items).toString().replace(/%7E/gi, COMPARE_SKU_SEPARATOR);
}

/**
 * The key two spec labels (or group titles) are matched by: case-insensitive, whitespace collapsed, ™ ® ©
 * removed and trailing colons dropped ("Garmin Pay™:" and "GARMIN PAY" match).
 */
export function normalizeSpecLabel(label: string): string {
  return String(label ?? "")
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:：]+$/, "")
    .trim()
    .toLowerCase();
}

/** One column's spec content: grouped specs, or flat `specs` when the product has no groups. */
export interface CompareColumnContent { specs?: readonly ProductSpecItem[]; specGroups?: readonly SpecGroup[] }
/** One spec row: the first-seen label, and each column's value (`null` when that column lacks the spec). */
export interface CompareRow { key: string; label: string; values: (string | null)[] }
/** One collapsible spec group (first-seen title) and its rows. */
export interface CompareGroup { key: string; title: string; rows: CompareRow[] }

/**
 * The comparison table: the union of groups in first-seen order across columns (matched by normalised title),
 * and inside each group the union of rows in first-seen order (matched by normalised label). A column without a
 * spec, or with a blank value, gets `null`. A column with only flat `specs` contributes them under a group titled
 * `fallbackTitle` (the page passes its translated "Specs"). A label repeated inside one column keeps its first value.
 */
export function buildCompareRows(columns: readonly CompareColumnContent[], fallbackTitle: string): CompareGroup[] {
  const groups: CompareGroup[] = [];
  const groupByKey = new Map<string, CompareGroup>();
  const rowByKey = new Map<string, CompareRow>();
  const width = columns.length;
  columns.forEach((column, index) => {
    const grouped = column?.specGroups?.length ? column.specGroups : null;
    const source: readonly SpecGroup[] = grouped ?? (column?.specs?.length ? [{ title: fallbackTitle, items: [...column.specs] }] : []);
    for (const group of source) {
      const groupKey = normalizeSpecLabel(group.title);
      let target = groupByKey.get(groupKey);
      if (!target) {
        target = { key: groupKey, title: group.title, rows: [] };
        groupByKey.set(groupKey, target);
        groups.push(target);
      }
      for (const item of group.items ?? []) {
        const rowKey = `${groupKey}::${normalizeSpecLabel(item.label)}`;
        let row = rowByKey.get(rowKey);
        if (!row) {
          row = { key: rowKey, label: item.label, values: Array.from({ length: width }, () => null) };
          rowByKey.set(rowKey, row);
          target.rows.push(row);
        }
        const value = typeof item.value === "string" && item.value.trim() ? item.value : null;
        if (row.values[index] === null) row.values[index] = value;
      }
    }
  });
  return groups;
}

const sameText = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Garmin's "Show only differences": a row is kept unless every column has a value and all values are equal
 * after trimming and collapsing whitespace. A row where some column is blank counts as different.
 */
export function isDifferentRow(row: Pick<CompareRow, "values">): boolean {
  const values = row.values;
  if (values.some((value) => value === null || !sameText(value))) return true;
  const first = sameText(values[0] ?? "");
  return values.some((value) => sameText(value ?? "") !== first);
}
