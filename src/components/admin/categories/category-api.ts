"use client";

// Client for /api/admin/catalog/categories (src/server/cms/catalog-http.ts). Writes send the epoch the tree was
// read with (If-Match); every write answers with the whole new tree.
export type Locale = "en" | "ru" | "kk";
export interface LocalName { en: string; ru: string | null; kk: string | null }
export interface AdminNode { key: string; slug: string | null; kind: string; name: LocalName; parentKey: string | null; position: number; navVisible: boolean; productCount: number; childCount: number }
export interface AdminPlacement extends AdminNode { href: string | null; label: Partial<Record<Locale, string>> | null }
export type LocalText = Record<Locale, string>;
export type MenuText = Partial<Record<Locale, string>>;
export interface AdminMenuLink {
  id: string; href: string; external: boolean; label: LocalText; defaultLabel: LocalText; override: MenuText | null; hidden: boolean;
  category: { key: string | null; state: "shown" | "hidden" | "removed" } | null;
}
export interface AdminMenuGroup { id: string; column: number; products: boolean; heading: LocalText | null; defaultHeading: LocalText | null; override: MenuText | null; hidden: boolean; links: AdminMenuLink[] }
export interface AdminMenuItem extends AdminNode { menuHref: string | null; placements: AdminPlacement[]; groups: AdminMenuGroup[]; others: AdminNode[] }
export interface AdminAccessory extends AdminNode { children: AdminNode[] }
export interface CategoryTree { epoch: string; menu: AdminMenuItem[]; accessories: AdminAccessory[]; series: AdminNode[] }
export interface CategoryUsage { products: number; children: number; typeLinks: number; promotions: number; priceRules: number; presets: number }

export class CategoryRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly counts?: CategoryUsage) { super(message); }
}

const BASE = "/api/admin/catalog/categories";

async function send(path: string, init: RequestInit, epoch?: string): Promise<CategoryTree> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(epoch ? { "if-match": `W/"taxonomy-${epoch}"` } : {}) } });
  const body = await response.json().catch(() => null) as (CategoryTree & { error?: { code?: string; message?: string; counts?: CategoryUsage } }) | null;
  if (!response.ok || !body || !Array.isArray(body.menu)) {
    throw new CategoryRequestError(body?.error?.message ?? `Categories could not be saved (HTTP ${response.status}).`, response.status, body?.error?.code ?? "ERROR", body?.error?.counts);
  }
  return body;
}

const keyQuery = (key: string) => `?key=${encodeURIComponent(key)}`;
export const categoryApi = {
  load: () => send(BASE, { method: "GET" }),
  create: (epoch: string, body: { section: "menu" | "menu-child" | "accessory" | "accessory-type" | "series"; parentKey?: string; name: { en: string; ru?: string; kk?: string }; navVisible?: boolean }) =>
    send(BASE, { method: "POST", body: JSON.stringify(body) }, epoch),
  update: (epoch: string, key: string, body: { name?: { en?: string; ru?: string; kk?: string }; navVisible?: boolean }) =>
    send(BASE + keyQuery(key), { method: "PATCH", body: JSON.stringify(body) }, epoch),
  remove: (epoch: string, key: string) => send(BASE + keyQuery(key), { method: "DELETE" }, epoch),
  order: (epoch: string, parentKey: string | null, keys: string[]) => send(`${BASE}/order`, { method: "PUT", body: JSON.stringify({ parentKey, keys }) }, epoch),
  /** Hide/show or rename (text: null = back to the default) one heading or column link of top item `menuKey`. */
  menu: (epoch: string, menuKey: string, body: ({ group: string } | { link: string }) & { hidden?: boolean; text?: MenuText | null }) =>
    send(`${BASE}/menu${keyQuery(menuKey)}`, { method: "PUT", body: JSON.stringify(body) }, epoch),
  placements: (epoch: string, menuKey: string, keys: string[]) => send(`${BASE}/placements${keyQuery(menuKey)}`, { method: "PUT", body: JSON.stringify({ keys }) }, epoch),
};

/** Machine-translated RU/KK for an English name, through the product translator's `name` field. */
export async function translateName(en: string): Promise<{ ru?: string; kk?: string }> {
  const response = await fetch("/api/admin/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "product", record: { name: en } }) });
  const body = await response.json().catch(() => null) as { translations?: { ru?: { name?: string }; kk?: { name?: string } }; error?: { message?: string } } | null;
  if (!response.ok || !body?.translations) throw new Error(body?.error?.message ?? "Automatic translation is unavailable right now.");
  return { ru: body.translations.ru?.name, kk: body.translations.kk?.name };
}

/** Moves item `index` by `delta` in a copy of `list`. */
export function moved<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const next = [...list], target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
