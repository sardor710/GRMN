// Task 2.3: pure editor helpers for per-variant content (inherit with override, Task 2.1). A key in
// `variant.content` means the variant owns that block ("Own"); no key means "Same as product".
import type { ProductContentDTO, VariantContent } from "../catalog/variant-content";
import type { ProductSpecItem, SpecGroup } from "./types";

export type ContentBlock = "specs" | "overview" | "box";

/** The VariantContent keys each block owns. Specs covers both the flat list and the grouped specs. */
export const BLOCK_KEYS: Record<ContentBlock, (keyof VariantContent)[]> = {
  specs: ["specs", "specGroups"],
  overview: ["overviewHtml"],
  box: ["inTheBox"],
};

const copySpecs = (rows: readonly ProductSpecItem[]): ProductSpecItem[] => rows.map((r) => ({ label: r.label, value: r.value }));
const copyGroups = (groups: readonly SpecGroup[]): SpecGroup[] => groups.map((g) => ({ title: g.title, items: copySpecs(g.items) }));

export function ownsBlock(content: VariantContent | undefined, block: ContentBlock): boolean {
  return Boolean(content) && BLOCK_KEYS[block].some((key) => content?.[key] !== undefined);
}

/**
 * The product's block deep-copied as a new override. Specs copies both the flat list and the groups
 * (an empty specGroups is kept as an own, empty list so later product groups never hide this variant's specs).
 */
export function copyProductBlock(product: ProductContentDTO, block: ContentBlock): VariantContent {
  if (block === "specs") return { specs: copySpecs(product.specs), specGroups: copyGroups(product.specGroups ?? []) };
  if (block === "overview") return { overviewHtml: product.overviewHtml ?? "" };
  return { inTheBox: [...product.inTheBox] };
}

export function withoutBlock(content: VariantContent, block: ContentBlock): VariantContent {
  const next = { ...content };
  for (const key of BLOCK_KEYS[block]) delete next[key];
  return next;
}

/** True while an owned block still equals the product's (switching back would lose nothing). */
export function unchangedFromProduct(product: ProductContentDTO, content: VariantContent, block: ContentBlock): boolean {
  const copy = copyProductBlock(product, block);
  return (Object.keys(copy) as (keyof VariantContent)[]).every((key) => JSON.stringify(content[key]) === JSON.stringify(copy[key]));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Removes a variant's translated block (translations.<locale>.variants[<variant id>].content.<key>) when
 * the English override is removed, pruning objects left empty. Returns the input when nothing changes.
 */
export function dropVariantTranslation<T extends object>(translations: T, variantId: string, keys: readonly (keyof VariantContent)[]): T {
  let changed = false;
  const next: Record<string, unknown> = { ...(translations as Record<string, unknown>) };
  for (const [locale, overlay] of Object.entries(next)) {
    if (!isRecord(overlay) || !isRecord(overlay.variants)) continue;
    const entry = overlay.variants[variantId];
    if (!isRecord(entry) || !isRecord(entry.content) || !keys.some((key) => key in (entry.content as object))) continue;
    changed = true;
    const content = { ...entry.content };
    for (const key of keys) delete content[key];
    const variantEntry: Record<string, unknown> = { ...entry, content };
    if (!Object.keys(content).length) delete variantEntry.content;
    const variants: Record<string, unknown> = { ...overlay.variants, [variantId]: variantEntry };
    if (!Object.keys(variantEntry).length) delete variants[variantId];
    const localeOverlay: Record<string, unknown> = { ...overlay, variants };
    if (!Object.keys(variants).length) delete localeOverlay.variants;
    next[locale] = localeOverlay;
  }
  return changed ? (next as T) : translations;
}
