import "server-only";
import type { NavItem } from "../../lib/homepage-nav.ts";
import { cmsBackend } from "../cms/source.ts";
import { getDatabase } from "../db/client.ts";
import { buildMegaNav, type MenuLocale } from "./mega-nav.ts";

// The header menu per locale, rebuilt only when the taxonomy epoch moves (every category, placement and
// translation write bumps it in the database), so admin edits show on the next page load without cache code.
// null keeps the built-in menu: legacy CMS mode, no categories yet, or the database is unavailable.
const cache = new Map<MenuLocale, { epoch: string; items: NavItem[] | null }>();

export async function getMegaNav(locale: MenuLocale, t: (key: string) => string): Promise<NavItem[] | null> {
  if (cmsBackend() !== "postgres") return null;
  try {
    const pool = getDatabase().pool;
    const epoch = (await pool.query<{ epoch: string }>("SELECT epoch::text AS epoch FROM catalog_taxonomy_guard WHERE id=1")).rows[0]?.epoch ?? "0";
    const hit = cache.get(locale);
    if (hit && hit.epoch === epoch) return hit.items;
    const items = await buildMegaNav(pool, locale, t);
    cache.set(locale, { epoch, items });
    return items;
  } catch (error) {
    console.error("menu: using the built-in menu,", error instanceof Error ? error.message : error);
    return null;
  }
}
