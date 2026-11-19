import "server-only";
import type { FieldSpec } from "../../i18n/translate-record.ts";

// Owner 2026-11-19: Russian and Kazakh are machine-translated by default through OpenRouter
// (OPENROUTER_API_KEY, OPENROUTER_MODEL). translateRecord walks a record with its translation spec
// (src/i18n/translate-record.js), sends every English text that still lacks a translation in
// bounded batches, and returns the overlay ({ ru?, kk? }) with existing staff translations kept.
// HTML fields are translated text node by text node, so tags, attributes, classes and image paths
// stay byte-identical. The result goes into the admin form; staff review it and save.

export type MachineLocale = "ru" | "kk";
export interface TranslationModel { complete(input: { locale: MachineLocale; segments: Record<string, string> }): Promise<Record<string, string>> }
type Json = unknown;
type Overlay = Record<string, Json>;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const blank = (value: unknown) => typeof value !== "string" || value.trim() === "";
// Text worth translating: letters present (not only numbers, units, entities or punctuation).
const translatable = (text: string) => /\p{L}{2,}/u.test(text.replace(/&[a-z#0-9]+;/gi, ""));

interface Slot { key: string; text: string; set: (overlay: Overlay, value: string) => void }

function at(overlay: Overlay, path: (string | number)[], create = true): Overlay | Json[] | undefined {
  let node: Overlay | Json[] = overlay;
  for (const [index, part] of path.entries()) {
    const nextIsIndex = typeof path[index + 1] === "number";
    const current = (node as Record<string | number, Json>)[part];
    if (current === undefined || current === null) { if (!create) return undefined; (node as Record<string | number, Json>)[part] = nextIsIndex ? [] : {}; }
    node = (node as Record<string | number, Json>)[part] as Overlay | Json[];
  }
  return node;
}
function read(overlay: Overlay | undefined, path: (string | number)[]): unknown {
  let node: unknown = overlay;
  for (const part of path) { if (node === null || typeof node !== "object") return undefined; node = (node as Record<string | number, unknown>)[part]; }
  return node;
}

/** Collects the empty translation slots of one locale, with setters that write into the overlay. */
function collect(record: Record<string, unknown>, spec: FieldSpec, existing: Overlay, htmlFields: Set<string>): Slot[] {
  const slots: Slot[] = [];
  let counter = 0;
  const add = (path: (string | number)[], field: string, text: string) => {
    if (!translatable(text) || !blank(read(existing, [...path, field]))) return;
    if (htmlFields.has(field) && path.length === 0) {
      // HTML: one slot per text node; the overlay field is rebuilt from the translated nodes.
      const parts = text.split(/(<[^>]+>)/);
      const translated = [...parts];
      const finish = (overlay: Overlay) => { (at(overlay, path) as Overlay)[field] = translated.join(""); };
      parts.forEach((part, index) => {
        if (part.startsWith("<") || !translatable(part)) return;
        const lead = part.match(/^\s*/)![0], tail = part.match(/\s*$/)![0];
        slots.push({ key: `s${counter++}`, text: part.trim(), set: (overlay, value) => { translated[index] = lead + value.trim() + tail; finish(overlay); } });
      });
      return;
    }
    slots.push({ key: `s${counter++}`, text: text.trim(), set: (overlay, value) => { (at(overlay, path) as Overlay)[field] = value.trim(); } });
  };
  const walk = (node: Record<string, unknown>, nodeSpec: FieldSpec, path: (string | number)[]) => {
    for (const field of nodeSpec.scalars ?? []) if (typeof node[field] === "string") add(path, field, node[field] as string);
    for (const field of nodeSpec.stringLists ?? []) {
      const list = node[field];
      if (Array.isArray(list)) list.forEach((item, index) => {
        if (typeof item !== "string" || !translatable(item) || !blank(read(existing, [...path, field, index]))) return;
        slots.push({ key: `s${counter++}`, text: item.trim(), set: (overlay, value) => { const parent = at(overlay, path) as Overlay; if (!Array.isArray(parent[field])) parent[field] = []; const target = parent[field] as Json[]; for (let i = target.length; i < index; i++) target[i] = ""; target[index] = value.trim(); } });
      });
    }
    for (const [field, sub] of Object.entries(nodeSpec.lists ?? {})) {
      const list = node[field];
      if (Array.isArray(list)) list.forEach((item, index) => { if (isObject(item)) walk(item, sub, [...path, field, index]); });
    }
    for (const [field, sub] of Object.entries(nodeSpec.keyed ?? {})) {
      const list = node[field];
      if (Array.isArray(list)) for (const item of list) if (isObject(item) && typeof item.id === "string") walk(item, sub, [...path, field, item.id]);
    }
    if (path.length === 0) for (const patch of nodeSpec.idPatches ?? []) {
      if (patch.map === "imageAlts") continue; // alt texts: many and low value for a free model; left to staff
      const visit = (items: unknown, depth: number) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          if (!isObject(item)) continue;
          if (depth < patch.path.length - 1) { visit(item[patch.path[depth + 1]], depth + 1); continue; }
          const text = item[patch.field];
          if (typeof item.id === "string" && typeof text === "string") add([patch.map], item.id, text);
        }
      };
      visit(node[patch.path[0]], 0);
    }
  };
  walk(record, spec, []);
  return slots;
}

function batches(slots: Slot[], maxItems: number, maxChars: number): Slot[][] {
  const out: Slot[][] = [];
  let current: Slot[] = [], size = 0;
  for (const slot of slots) {
    if (current.length && (current.length >= maxItems || size + slot.text.length > maxChars)) { out.push(current); current = []; size = 0; }
    current.push(slot); size += slot.text.length;
  }
  if (current.length) out.push(current);
  return out;
}

export async function translateRecord(input: {
  record: Record<string, unknown>; spec: FieldSpec; htmlFields?: readonly string[]; existing: Record<string, unknown> | undefined;
  locales: readonly MachineLocale[]; model: TranslationModel; batch?: { maxItems: number; maxChars: number };
  /** Stop starting new batches after this many ms; the caller repeats until `remaining` is 0. */
  budgetMs?: number;
}): Promise<{ translations: Record<string, Overlay>; filled: number; remaining: number }> {
  const html = new Set(input.htmlFields ?? []), existing = isObject(input.existing) ? input.existing : {};
  const translations: Record<string, Overlay> = {};
  for (const [locale, overlay] of Object.entries(existing)) if (isObject(overlay)) translations[locale] = structuredClone(overlay);
  let filled = 0, remaining = 0;
  const deadline = input.budgetMs === undefined ? Infinity : Date.now() + input.budgetMs;
  for (const locale of input.locales) {
    const current = translations[locale] ?? {};
    const slots = collect(input.record, input.spec, current, html);
    for (const group of batches(slots, input.batch?.maxItems ?? 25, input.batch?.maxChars ?? 3000)) {
      if (Date.now() >= deadline) { remaining += group.length; continue; }
      const result = await input.model.complete({ locale, segments: Object.fromEntries(group.map(slot => [slot.key, slot.text])) });
      for (const slot of group) {
        const value = result[slot.key];
        if (typeof value === "string" && value.trim()) { slot.set(current, value); filled++; }
      }
    }
    if (Object.keys(current).length) translations[locale] = current;
  }
  return { translations, filled, remaining };
}

const LANGUAGE: Record<MachineLocale, string> = { ru: "Russian", kk: "Kazakh (written in the Kazakh Cyrillic alphabet only; never Latin or Turkish letters)" };

/** OpenRouter chat-completions model. Errors carry the HTTP status only, never the key. */
export function openRouterModel(config: { apiKey: string; model: string; fetch?: typeof fetch; timeoutMs?: number }): TranslationModel {
  const request = config.fetch ?? fetch;
  return {
    async complete({ locale, segments }) {
      const system = `You translate an online store's product and content text from English to ${LANGUAGE[locale]}. ` +
        "Keep brand and product names (Garmin, fēnix, MARQ, Venu, Forerunner, Instinct, inReach, Connect IQ, Garmin Pay), model and part numbers, units and numbers unchanged. " +
        "Translate naturally for shoppers. Answer with one JSON object only: the same keys, each value the translation of that key's text.";
      const response = await request("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(config.timeoutMs ?? 40_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}`, "x-title": "GRMN store admin" },
        body: JSON.stringify({ model: config.model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(segments) }] }),
      });
      if (!response.ok) throw new Error(`Translation service answered ${response.status}`);
      // (A timeout surfaces as AbortError/TimeoutError and is reported as a retryable 503.)
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "";
      const json = content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      const start = json.indexOf("{"), end = json.lastIndexOf("}");
      try { const parsed = JSON.parse(json.slice(start, end + 1)); return isObject(parsed) ? Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as Record<string, string> : {}; }
      catch { throw new Error("Translation service returned unreadable output; try again"); }
    },
  };
}

export function translationModelFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): TranslationModel | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  return apiKey ? openRouterModel({ apiKey, model: env.OPENROUTER_MODEL?.trim() || "nvidia/nemotron-3.5-super-vl:free" }) : null;
}
