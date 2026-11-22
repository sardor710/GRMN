import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { mergeTranslationsSafely } from "../../lib/cms/translation-input.ts";
import type { FieldSpec } from "../../i18n/translate-record.ts";

// Task 24 / Task 2.2: ru/kk translation overlays for CMS records, shared by the legacy CMS save
// (service.ts) and the PostgreSQL catalog writer (catalog-write.ts, beta5 merge).

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};

export const LOCALES=["ru","kk"] as const;
/** Validates `incoming` and merges it per locale with `stored` (a sent locale replaces, blank removes). */
export function mergedTranslations(stored:unknown,incoming:unknown,spec:FieldSpec,html?:Record<string,(value:string)=>string>):Record<string,unknown>{
  if(incoming===undefined)return record(stored);
  if(incoming!==null&&typeof incoming==="object"&&!Array.isArray(incoming)&&Object.keys(incoming).some(key=>!(LOCALES as readonly string[]).includes(key)))return fail("INVALID_INPUT",400,"Invalid translations: only ru and kk can be translated");
  if(incoming!==null&&typeof incoming==="object"&&Object.values(incoming).some(value=>value===null||typeof value!=="object"||Array.isArray(value)))return fail("INVALID_INPUT",400,"Invalid translations: each locale must be an object");
  const merged=mergeTranslationsSafely({translations:record(stored)},incoming,spec,html);
  if(!merged.ok)return fail("INVALID_INPUT",400,`Invalid translations: ${merged.error}`);
  return merged.translations;
}
/**
 * Task 2.2: variant translations (translations.<locale>.variants[<editor variant id>].content) follow the
 * saved document. A locale that was sent without a `variants` key keeps its stored ones (an older form
 * must not wipe them; `variants: {}` clears them). Only blocks the variant owns are kept, for variants
 * that still exist; absent blocks are never invented.
 */
export function variantTranslations(translations:Record<string,unknown>,stored:unknown,incoming:unknown,variants:unknown):Record<string,unknown>{
  const owned=new Map<string,Record<string,unknown>>();
  if(Array.isArray(variants))for(const v of variants){const item=record(v);if(typeof item.id==="string"&&item.content!==null&&typeof item.content==="object"&&!Array.isArray(item.content))owned.set(item.id,record(item.content));}
  const out:Record<string,unknown>={};
  for(const locale of LOCALES){
    const overlay=translations[locale];if(overlay===undefined)continue;
    const sent=record(incoming)[locale]!==undefined,hasKey=sent&&Object.hasOwn(record(record(incoming)[locale]),"variants");
    const source=sent&&!hasKey?record(record(stored)[locale]).variants:record(overlay).variants;
    const {variants:_dropped,...rest}=record(overlay);void _dropped;
    const kept:Record<string,unknown>={};
    for(const [id,entry] of Object.entries(record(source))){
      const own=owned.get(id);if(!own)continue;
      const content=record(record(entry).content),blocks=Object.fromEntries(Object.entries(content).filter(([key])=>Object.hasOwn(own,key)));
      if(Object.keys(blocks).length)kept[id]={content:blocks};
    }
    const next=Object.keys(kept).length?{...rest,variants:kept}:rest;
    if(Object.keys(next).length)out[locale]=next;
  }
  return out;
}
/** JSON with object keys sorted, so a jsonb round trip (which reorders keys) compares equal. */
export const sortedJSON=(value:unknown):string=>Array.isArray(value)?"["+value.map(sortedJSON).join(",")+"]"
  :value!==null&&typeof value==="object"?"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+sortedJSON((value as Record<string,unknown>)[key])).join(",")+"}"
  :JSON.stringify(value);

/**
 * beta5 merge: documents saved by the legacy projection keyed variant translations
 * (translations.<locale>.variants[<id>]) by the editor's own variant id; the catalog writer keys them by
 * the stored variant id. Re-keys every entry whose key is not a stored id, through the legacy document's
 * variant SKU, so translations survive the switch. Entries that match nothing are left as they are
 * (variantTranslations prunes them on the next save, as before).
 */
export function rekeyVariantTranslations(translations: unknown, legacyVariants: unknown, stored: readonly { id: string; sku: string }[]): Record<string, unknown> {
  const out = { ...record(translations) };
  const storedIds = new Set(stored.map(variant => variant.id));
  const bySku = new Map(stored.map(variant => [variant.sku.toLowerCase(), variant.id]));
  const legacySku = new Map<string, string>();
  if (Array.isArray(legacyVariants)) for (const value of legacyVariants) { const item = record(value); if (typeof item.id === "string" && typeof item.sku === "string") legacySku.set(item.id, item.sku.toLowerCase()); }
  for (const [locale, overlay] of Object.entries(out)) {
    const variants = record(record(overlay).variants);
    if (!Object.keys(variants).length) continue;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(variants)) {
      const sku = legacySku.get(key), target = storedIds.has(key) ? key : sku ? bySku.get(sku) ?? key : key;
      if (!(target in next) || target === key) next[target] = entry;
    }
    out[locale] = { ...record(overlay), variants: next };
  }
  return out;
}
