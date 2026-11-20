// Task 2.1 (owner 2026-11-19): per-variant Specs (and grouped specs), Overview and In the box,
// inherit-with-override. A key present in a variant's `content` means "Own" (even when empty: an own,
// empty In the box shows nothing); an absent key inherits the product's block.
import type { ProductSpecItem, SpecGroup } from "../cms/types";
import { localizeRecord, type FieldSpec } from "../../i18n/translate-record.ts";
import type { Locale } from "../../contracts/commerce";

export type Spec = ProductSpecItem;
export type { SpecGroup };
export interface VariantContent { specs?: Spec[]; specGroups?: SpecGroup[]; overviewHtml?: string; inTheBox?: string[] }
/** The product-level blocks a variant inherits from (already localized when used for ru/kk). */
export interface ProductContentDTO { specs: Spec[]; specGroups?: SpecGroup[]; overviewHtml?: string; inTheBox: string[] }
export const VARIANT_CONTENT_KEYS = ["specs", "specGroups", "overviewHtml", "inTheBox"] as const;

const copySpecs = (rows: readonly Spec[]): Spec[] => rows.map(r => ({ label: r.label, value: r.value }));
const copyGroups = (rows: readonly SpecGroup[]): SpecGroup[] => rows.map(g => ({ title: g.title, items: copySpecs(g.items) }));

/** The content a variant shows: each owned block replaces the product's, the rest is inherited. */
export function effectiveVariantContent(product: ProductContentDTO, variant: { content?: VariantContent }): Required<VariantContent> {
  const own = variant.content ?? {};
  return {
    specs: copySpecs(own.specs ?? product.specs),
    specGroups: copyGroups(own.specGroups ?? product.specGroups ?? []),
    overviewHtml: own.overviewHtml ?? product.overviewHtml ?? "",
    inTheBox: [...(own.inTheBox ?? product.inTheBox)],
  };
}

/** Same merge rules as the product overlay (blank or missing rows fall back to the English row). */
export const VARIANT_CONTENT_SPEC: FieldSpec = Object.freeze({
  scalars: ["overviewHtml"],
  stringLists: ["inTheBox"],
  lists: { specs: { scalars: ["label", "value"] }, specGroups: { scalars: ["title"], lists: { items: { scalars: ["label", "value"] } } } },
});

/**
 * Localizes an English override with its translated override (Task 2.2 stores it at
 * product_translations.content.variants[<editor variant id>].content). Only blocks the variant owns in
 * English are kept: a translation never makes a block "Own", and an owned block without a translation
 * stays the English override (not the product's translation).
 */
export function localizeVariantOverride(english: VariantContent, translated: unknown, locale: Locale): VariantContent {
  if (locale === "en" || translated === null || typeof translated !== "object" || Array.isArray(translated)) return english;
  const local = localizeRecord({ ...english, translations: { [locale]: translated } }, locale, VARIANT_CONTENT_SPEC);
  const out: VariantContent = {};
  if (english.specs !== undefined) out.specs = local.specs;
  if (english.specGroups !== undefined) out.specGroups = local.specGroups;
  if (english.overviewHtml !== undefined) out.overviewHtml = local.overviewHtml;
  if (english.inTheBox !== undefined) out.inTheBox = local.inTheBox;
  return out;
}

/** Reads a stored override (jsonb) defensively: malformed blocks are treated as absent (inherit). */
export function parseVariantContent(value: unknown): VariantContent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>, out: VariantContent = {};
  const spec = (v: unknown): Spec | null => { const r = v as Record<string, unknown> | null; return r && typeof r.label === "string" && typeof r.value === "string" ? { label: r.label, value: r.value } : null; };
  if (Array.isArray(raw.specs)) out.specs = raw.specs.map(spec).filter((s): s is Spec => s !== null);
  if (Array.isArray(raw.specGroups)) out.specGroups = raw.specGroups.flatMap(g => { const r = g as Record<string, unknown> | null; return r && typeof r.title === "string" ? [{ title: r.title, items: (Array.isArray(r.items) ? r.items : []).map(spec).filter((s): s is Spec => s !== null) }] : []; });
  if (typeof raw.overviewHtml === "string") out.overviewHtml = raw.overviewHtml;
  if (Array.isArray(raw.inTheBox)) out.inTheBox = raw.inTheBox.filter((s): s is string => typeof s === "string");
  return out;
}
