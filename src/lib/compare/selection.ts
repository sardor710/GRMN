// Task C-c (plan 2026-11-21 §3): the catalogue's compare selection, kept across catalogue pages and the product
// page in localStorage (a per-viewer convenience; the compare URL stays the source of truth for the comparison).
// Pure list helpers first, then a tiny external store. Every storage call is guarded: with storage blocked (private
// mode, disabled site data) the selection lives in memory for the tab.
import { COMPARE_MAX_ITEMS, COMPARE_VALUE_MAX_LENGTH, compareHref, type CompareItemRef } from "./compare-items.ts";

/** localStorage key; bump the version when the stored shape changes. */
export const COMPARE_SELECTION_KEY = "garmin-compare-v1";
/** Same-tab change event (the `storage` event only reaches other tabs). */
export const COMPARE_SELECTION_EVENT = "garmin-compare-change";
/** Id of the compare bar's visible "up to five" note; a catalogue card's disabled control points at it. */
export const COMPARE_LIMIT_NOTE_ID = "compare-limit-note";

/** One chosen product (and size), with what the compare bar shows for it. */
export interface CompareSelectionItem extends CompareItemRef {
  /** Product name for the slot's title and the remove label. */
  name?: string;
  /** Thumbnail URL for the slot. */
  image?: string;
}

/** Longest name or image URL kept from storage. */
const META_MAX_LENGTH = 2048;

const cleanText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= max ? text : undefined;
};

function toItem(value: unknown): CompareSelectionItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const productId = cleanText(record.productId, COMPARE_VALUE_MAX_LENGTH);
  if (!productId) return null;
  const sku = cleanText(record.sku, COMPARE_VALUE_MAX_LENGTH);
  // A SKU that is given but unusable (not text, over-long) drops the item, like parseCompareItems does.
  const skuGiven = record.sku !== undefined && record.sku !== null && !(typeof record.sku === "string" && !record.sku.trim());
  if (skuGiven && !sku) return null;
  const name = cleanText(record.name, META_MAX_LENGTH);
  const image = cleanText(record.image, META_MAX_LENGTH);
  return { productId, ...(sku ? { sku } : {}), ...(name ? { name } : {}), ...(image ? { image } : {}) };
}

/** Same product and size: SKUs match case-insensitively, a missing SKU only matches a missing SKU. */
export function sameItem(a: CompareItemRef, b: CompareItemRef): boolean {
  return a.productId === b.productId && (a.sku ?? "").toLowerCase() === (b.sku ?? "").toLowerCase();
}

/** Valid items only, exact duplicates dropped, at most five. Never throws. */
export function normalizeSelection(value: unknown): CompareSelectionItem[] {
  if (!Array.isArray(value)) return [];
  const out: CompareSelectionItem[] = [];
  for (const entry of value) {
    const item = toItem(entry);
    if (!item || out.some((other) => sameItem(other, item))) continue;
    out.push(item);
    if (out.length === COMPARE_MAX_ITEMS) break;
  }
  return out;
}

/** The stored JSON as items; anything malformed reads as an empty selection. */
export function parseSelection(raw: string | null | undefined): CompareSelectionItem[] {
  if (!raw) return [];
  try {
    return normalizeSelection(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function serializeSelection(items: readonly CompareSelectionItem[]): string {
  return JSON.stringify(normalizeSelection(items));
}

export const hasItem = (items: readonly CompareSelectionItem[], ref: CompareItemRef): boolean => items.some((item) => sameItem(item, ref));
export const hasProduct = (items: readonly CompareSelectionItem[], productId: string): boolean => items.some((item) => item.productId === productId);
export const isSelectionFull = (items: readonly CompareSelectionItem[]): boolean => items.length >= COMPARE_MAX_ITEMS;

/** Appends the item; a duplicate, an invalid item or a full selection leaves the list unchanged (same array). */
export function addItem(items: readonly CompareSelectionItem[], item: CompareSelectionItem): readonly CompareSelectionItem[] {
  const next = toItem(item);
  if (!next || hasItem(items, next) || isSelectionFull(items)) return items;
  return [...items, next];
}

/** Removes that product and size. */
export function removeItem(items: readonly CompareSelectionItem[], ref: CompareItemRef): readonly CompareSelectionItem[] {
  return hasItem(items, ref) ? items.filter((item) => !sameItem(item, ref)) : items;
}

/** Removes every size of that product. */
export function removeProduct(items: readonly CompareSelectionItem[], productId: string): readonly CompareSelectionItem[] {
  return hasProduct(items, productId) ? items.filter((item) => item.productId !== productId) : items;
}

/** The product page's control: adds or removes exactly this product and size. */
export function toggleItem(items: readonly CompareSelectionItem[], item: CompareSelectionItem): readonly CompareSelectionItem[] {
  return hasItem(items, item) ? removeItem(items, item) : addItem(items, item);
}

/** A catalogue card's control: a product in any size counts as added, and removing drops all its sizes. */
export function toggleProduct(items: readonly CompareSelectionItem[], item: CompareSelectionItem): readonly CompareSelectionItem[] {
  return hasProduct(items, item.productId) ? removeProduct(items, item.productId) : addItem(items, item);
}

/** The compare page link for the selection (no locale prefix), e.g. `/compare?item=fenix-8~F8-47&item=venu-4`. */
export function selectionHref(items: readonly CompareSelectionItem[]): string {
  return compareHref(items.map(({ productId, sku }) => (sku ? { productId, sku } : { productId })));
}

/** Where the store keeps its JSON and how it tells this tab about changes. Injected so tests run without a DOM. */
export interface CompareSelectionEnvironment {
  /** The storage to use; it may throw (blocked storage) or return null (no window). */
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** The event target for the same-tab event and the cross-tab `storage` event; null on the server. */
  target: () => Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent"> | null;
}

export interface CompareSelectionStore {
  subscribe: (onChange: () => void) => () => void;
  /** The current items; the same array until the stored value changes (for useSyncExternalStore). */
  getSnapshot: () => readonly CompareSelectionItem[];
  /** Applies a change (e.g. `items => toggleProduct(items, item)`), stores it and notifies subscribers. */
  update: (change: (items: readonly CompareSelectionItem[]) => readonly CompareSelectionItem[]) => void;
}

const EMPTY: readonly CompareSelectionItem[] = Object.freeze([]);

export function createCompareSelectionStore(env: CompareSelectionEnvironment): CompareSelectionStore {
  // After the first storage failure the selection lives here for the rest of the tab's life.
  let inMemory = false;
  let memoryRaw: string | null = null;
  let cached: { raw: string | null; items: readonly CompareSelectionItem[] } | null = null;

  const readRaw = (): string | null => {
    if (inMemory) return memoryRaw;
    try {
      const store = env.storage();
      return store ? store.getItem(COMPARE_SELECTION_KEY) : memoryRaw;
    } catch {
      inMemory = true;
      return memoryRaw;
    }
  };
  const writeRaw = (raw: string | null) => {
    memoryRaw = raw;
    if (inMemory) return;
    try {
      const store = env.storage();
      if (!store) return;
      if (raw === null) store.removeItem(COMPARE_SELECTION_KEY);
      else store.setItem(COMPARE_SELECTION_KEY, raw);
    } catch {
      inMemory = true;
    }
  };
  const notify = () => {
    try {
      env.target()?.dispatchEvent(new Event(COMPARE_SELECTION_EVENT));
    } catch {
      // No event support: subscribers read the new value on their next render.
    }
  };

  const getSnapshot = () => {
    const raw = readRaw();
    if (!cached || cached.raw !== raw) cached = { raw, items: raw ? parseSelection(raw) : EMPTY };
    return cached.items;
  };

  return {
    getSnapshot,
    subscribe(onChange) {
      const target = env.target();
      if (!target) return () => {};
      const onStorage = (event: Event) => {
        const key = (event as StorageEvent).key;
        // `key === null` is localStorage.clear() in another tab.
        if (key === COMPARE_SELECTION_KEY || key === null) onChange();
      };
      target.addEventListener(COMPARE_SELECTION_EVENT, onChange);
      target.addEventListener("storage", onStorage);
      return () => {
        target.removeEventListener(COMPARE_SELECTION_EVENT, onChange);
        target.removeEventListener("storage", onStorage);
      };
    },
    update(change) {
      const current = getSnapshot();
      const next = normalizeSelection(change(current));
      const raw = next.length ? JSON.stringify(next) : null;
      if (raw === (current.length ? JSON.stringify(current) : null)) return;
      writeRaw(raw);
      notify();
    },
  };
}

/** The browser's store (window.localStorage, window events); inert on the server. */
export const compareSelection: CompareSelectionStore = createCompareSelectionStore({
  storage: () => (typeof window === "undefined" ? null : window.localStorage),
  target: () => (typeof window === "undefined" ? null : window),
});
