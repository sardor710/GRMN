// Pure helpers for the Options & variants step (plan M6.2). No React, no DOM: unit tested directly
// (tests/unit/variants-state.test.mjs). Generation itself stays in src/lib/cms/product-variants.js.
import type { OptionDisplay, ProductOption, ProductOptionValue, ProductVariant, VariantStatus } from "../../../lib/cms/types.ts";
import { MAX_VARIANTS, WARN_VARIANTS, ensureSingleDefault, generateVariants } from "../../../lib/cms/product-variants.ts";

export { MAX_VARIANTS, WARN_VARIANTS };

const slug = (text: string): string =>
  text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const optionKeyFor = slug;

/** Common options, offered as one-click presets in the empty state and under the option cards. */
export const OPTION_PRESETS: readonly { name: string; display: OptionDisplay; hint: string }[] = [
  { name: "Case size", display: "buttons", hint: "43 mm, 47 mm, 51 mm" },
  { name: "Color", display: "swatch", hint: "Black, Slate Gray" },
  { name: "Edition", display: "buttons", hint: "Solar, Sapphire" },
];

export function presetsAvailable(options: readonly ProductOption[]) {
  const used = new Set(options.map((option) => slug(option.name)));
  return OPTION_PRESETS.filter((preset) => !used.has(slug(preset.name)));
}

export function newOption(makeId: (prefix: string) => string, name = "", display: OptionDisplay = "buttons"): ProductOption {
  return { id: makeId("opt"), key: slug(name), name, display, values: [] };
}

/** "43 mm, 47 mm ,, 51 mm" → ["43 mm", "47 mm", "51 mm"]. */
export function parseValueInput(text: string): string[] {
  return text.split(/[,\n\t]/).map((part) => part.trim()).filter(Boolean);
}

/** Adds labels that are not already values (case-insensitive). Returns the option and the skipped duplicates. */
export function addOptionValues(option: ProductOption, labels: readonly string[], makeId: (prefix: string) => string): { option: ProductOption; duplicates: string[] } {
  const seen = new Set(option.values.map((value) => value.label.trim().toLowerCase()));
  const duplicates: string[] = [];
  const added: ProductOptionValue[] = [];
  for (const label of labels) {
    const normal = label.trim().toLowerCase();
    if (!normal) continue;
    if (seen.has(normal)) { duplicates.push(label.trim()); continue; }
    seen.add(normal);
    added.push({ id: makeId("val"), key: label.trim(), label: label.trim() });
  }
  return { option: added.length ? { ...option, values: [...option.values, ...added] } : option, duplicates };
}

/** Renaming a hand-made value keeps its key in step (keys feed generated SKUs); imported keys stay put. */
export function renameOptionValue(value: ProductOptionValue, label: string): ProductOptionValue {
  return { ...value, label, ...(value.key === value.label ? { key: label } : {}) };
}

/** Renaming an option keeps a derived key in step. */
export function renameOption(option: ProductOption, name: string): ProductOption {
  return { ...option, name, ...(option.key === "" || option.key === slug(option.name) ? { key: slug(name) } : {}) };
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * True when the variants no longer match the option/value set: a variant points at a removed option/value,
 * misses an option, or a value is used by no variant. A partial matrix alone (imports) is not out of date.
 */
export function variantsOutOfDate(options: readonly ProductOption[], variants: readonly ProductVariant[]): boolean {
  const usable = options.filter((option) => option.values.length);
  if (!usable.length) return variants.length > 0;
  if (!variants.length) return true;
  const valid = new Map(usable.map((option) => [option.id, new Set(option.values.map((value) => value.id))]));
  const broken = variants.some((variant) =>
    usable.some((option) => !variant.selections[option.id]) ||
    Object.entries(variant.selections).some(([optionId, valueId]) => !valid.get(optionId)?.has(valueId)));
  if (broken) return true;
  const used = new Set(variants.flatMap((variant) => Object.values(variant.selections)));
  return usable.some((option) => option.values.some((value) => !used.has(value.id)));
}

export type GeneratePreview =
  | { kind: "none" }
  | { kind: "simple"; removed: number }
  | { kind: "unnamed" }
  | { kind: "tooMany"; total: number }
  | { kind: "apply"; stale: boolean; total: number; created: number; kept: number; removed: number; merged: number; warning?: string; createdAsDraft: boolean; variants: ProductVariant[] };

/**
 * What "Apply to variants" would do right now, computed before the user clicks so the bar can say
 * "create 6 · keep 27 · remove 2". Existing variants keep their SKU, price, stock and photos.
 */
export function previewGenerate(options: readonly ProductOption[], variants: readonly ProductVariant[], base: { sku: string; price: number; stock: number }): GeneratePreview {
  const usable = options.filter((option) => option.values.length);
  if (!usable.length) return variants.length ? { kind: "simple", removed: variants.length } : { kind: "none" };
  if (usable.some((option) => !option.name.trim())) return { kind: "unnamed" };
  const total = usable.reduce((count, option) => count * option.values.length, 1);
  if (total > MAX_VARIANTS) return { kind: "tooMany", total };
  const stale = variantsOutOfDate(options, variants);
  const result = generateVariants([...options], [...variants], base);
  if (!stale && result.added === 0 && result.removed === 0) return { kind: "none" };
  return {
    kind: "apply", stale, total, created: result.added, kept: result.variants.length - result.added, removed: result.removed, merged: result.merged,
    ...(result.warning ? { warning: result.warning } : {}), createdAsDraft: variants.length > 0 && result.added > 0, variants: result.variants,
  };
}

export type ReadyBlocker = "noSku" | "draft" | "archived" | "noPrice" | "outOfStock";
export const BLOCKER_LABELS: Record<ReadyBlocker, string> = {
  noSku: "No SKU",
  archived: "Archived — hidden",
  draft: "Draft — hidden",
  noPrice: "No price",
  outOfStock: "Out of stock",
};

/** Ready to sell = active + price > 0 + stock > 0 + SKU. Blockers are listed most important first. */
export function variantReadiness(variant: Pick<ProductVariant, "sku" | "status" | "price" | "stock">): { ready: boolean; blockers: ReadyBlocker[] } {
  const blockers: ReadyBlocker[] = [];
  if (!variant.sku.trim()) blockers.push("noSku");
  if (variant.status === "archived") blockers.push("archived");
  else if (variant.status !== "active") blockers.push("draft");
  if (!(Number(variant.price) > 0)) blockers.push("noPrice");
  if (!(Number(variant.stock) > 0)) blockers.push("outOfStock");
  return { ready: blockers.length === 0, blockers };
}

/** SKU problems per variant id: empty, duplicated inside the product, or rejected by the server (409). */
export function skuIssues(variants: readonly ProductVariant[], conflicts: readonly string[] = []): Map<string, string> {
  const conflictSet = new Set(conflicts.map((sku) => sku.trim().toUpperCase()));
  const counts = new Map<string, number>();
  for (const variant of variants) {
    const key = variant.sku.trim().toUpperCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const issues = new Map<string, string>();
  for (const variant of variants) {
    const key = variant.sku.trim().toUpperCase();
    if (!key) issues.set(variant.id, "SKU is required");
    else if (conflictSet.has(key)) issues.set(variant.id, "SKU already used by another product");
    else if ((counts.get(key) ?? 0) > 1) issues.set(variant.id, "Duplicate SKU in this product");
  }
  return issues;
}

export interface VariantsSummary { total: number; ready: number; outOfStock: number; drafts: number; archived: number; skuProblems: number }

export function summarizeVariants(variants: readonly ProductVariant[], conflicts: readonly string[] = []): VariantsSummary {
  const summary: VariantsSummary = { total: variants.length, ready: 0, outOfStock: 0, drafts: 0, archived: 0, skuProblems: skuIssues(variants, conflicts).size };
  for (const variant of variants) {
    const { ready } = variantReadiness(variant);
    if (ready) summary.ready++;
    if (variant.status === "archived") { summary.archived++; continue; }
    if (variant.status === "draft") summary.drafts++;
    if (!(Number(variant.stock) > 0)) summary.outOfStock++;
  }
  return summary;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "33 variants · 21 ready to sell · 12 out of stock" (+ drafts, archived, SKU problems when present). */
export function summaryLine(summary: VariantsSummary): string {
  if (!summary.total) return "No variants yet";
  const parts = [plural(summary.total, "variant"), `${summary.ready} ready to sell`];
  if (summary.outOfStock) parts.push(`${summary.outOfStock} out of stock`);
  if (summary.drafts) parts.push(plural(summary.drafts, "draft"));
  if (summary.archived) parts.push(`${summary.archived} archived`);
  if (summary.skuProblems) parts.push(plural(summary.skuProblems, "SKU problem"));
  return parts.join(" · ");
}

export interface BulkPatch { price?: number; originalPrice?: number | null; stock?: number; status?: VariantStatus }

/**
 * Applies a bulk edit to the selected variants. compare-at 0 or null clears it. Archiving the default
 * variant moves "default" to the first variant that is still for sale.
 */
export function applyBulk(variants: readonly ProductVariant[], ids: ReadonlySet<string>, patch: BulkPatch): ProductVariant[] {
  const next = variants.map((variant) => {
    if (!ids.has(variant.id)) return variant;
    const changed: ProductVariant = { ...variant };
    if (patch.price !== undefined && Number.isFinite(patch.price) && patch.price >= 0) changed.price = patch.price;
    if (patch.originalPrice !== undefined) {
      if (patch.originalPrice === null || !(patch.originalPrice > 0)) delete changed.originalPrice;
      else changed.originalPrice = patch.originalPrice;
    }
    if (patch.stock !== undefined && Number.isFinite(patch.stock) && patch.stock >= 0) changed.stock = Math.trunc(patch.stock);
    if (patch.status) changed.status = patch.status;
    return changed;
  });
  return patch.status ? ensureSingleDefault(next) : next;
}

/** One variant changed (inline edit); keeps a single default when the status changes. */
export function patchVariant(variants: readonly ProductVariant[], id: string, change: Partial<ProductVariant>): ProductVariant[] {
  const next = variants.map((variant) => (variant.id === id ? { ...variant, ...change } : variant));
  return change.status ? ensureSingleDefault(next) : next;
}

/**
 * Owner 2026-11-23: remove variants the store does not sell (bin per row, "Delete selected"). Saving the product
 * deletes them on the server (archived instead when orders reference them). The last variant is never removed;
 * a removed default hands over to the first remaining active variant.
 */
export function removeVariants(variants: readonly ProductVariant[], ids: ReadonlySet<string>): ProductVariant[] {
  const next = variants.filter((variant) => !ids.has(variant.id));
  if (next.length === variants.length || next.length === 0) return variants as ProductVariant[];
  if (next.some((variant) => variant.isDefault && variant.status !== "archived")) return next;
  const active = next.findIndex((variant) => variant.status === "active");
  return active < 0 ? ensureSingleDefault(next) : next.map((variant, index) => ({ ...variant, isDefault: index === active }));
}

/**
 * After variants are deleted: drop option values that only the deleted variants used (the storefront picker lists
 * every value, so an orphan would be a dead choice) and options left with no values. Values that were already
 * unused before the deletion stay (e.g. one just added). Returns the same array when nothing changes.
 */
export function pruneOrphanedValues(options: readonly ProductOption[], before: readonly ProductVariant[], after: readonly ProductVariant[]): ProductOption[] {
  const used = (list: readonly ProductVariant[]) => new Set(list.flatMap((variant) => Object.entries(variant.selections).map(([option, value]) => `${option}\u0000${value}`)));
  const wasUsed = used(before), stillUsed = used(after);
  let changed = false;
  const next = options.flatMap((option) => {
    const values = option.values.filter((value) => {
      const key = `${option.id}\u0000${value.id}`;
      const keep = !wasUsed.has(key) || stillUsed.has(key);
      if (!keep) changed = true;
      return keep;
    });
    if (values.length === option.values.length) return [option];
    return values.length ? [{ ...option, values }] : [];
  });
  return changed ? next : (options as ProductOption[]);
}

export const setDefaultVariant = (variants: readonly ProductVariant[], id: string): ProductVariant[] =>
  variants.map((variant) => ({ ...variant, isDefault: variant.id === id }));

export type SelectionRule = { kind: "all" } | { kind: "none" } | { kind: "notReady" } | { kind: "outOfStock" } | { kind: "value"; optionId: string; valueId: string };

/** Ids picked by a "Select…" rule, e.g. every variant with Case size 51 mm. */
export function selectByRule(variants: readonly ProductVariant[], rule: SelectionRule): Set<string> {
  const pick = (test: (variant: ProductVariant) => boolean) => new Set(variants.filter(test).map((variant) => variant.id));
  switch (rule.kind) {
    case "all": return pick(() => true);
    case "none": return new Set();
    case "notReady": return pick((variant) => !variantReadiness(variant).ready);
    case "outOfStock": return pick((variant) => variant.status !== "archived" && !(Number(variant.stock) > 0));
    case "value": return pick((variant) => variant.selections[rule.optionId] === rule.valueId);
  }
}

/** Value labels of a variant in option order (the chips shown in its row). */
export function variantChips(options: readonly ProductOption[], variant: ProductVariant): { optionName: string; label: string }[] {
  return options.flatMap((option) => {
    const value = option.values.find((item) => item.id === variant.selections[option.id]);
    return value ? [{ optionName: option.name, label: value.label }] : [];
  });
}

/** Variants matching the per-option filters (and optionally only those not ready to sell). */
export function filterVariants(variants: readonly ProductVariant[], filters: Readonly<Record<string, string>>, notReadyOnly = false): ProductVariant[] {
  return variants.filter((variant) =>
    Object.entries(filters).every(([optionId, valueId]) => !valueId || variant.selections[optionId] === valueId) &&
    (!notReadyOnly || !variantReadiness(variant).ready));
}

/** Parses a number field; blank → undefined, anything not a finite number ≥ 0 → NaN. */
export function parseAmount(raw: string): number | undefined {
  const text = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}
