// M4.4: homepage links (CMS hero banners, carousels and tiles) open local pages where the store has them.
// garmin.com category URLs map to the taxonomy node with that slug or menu link; garmin.com product URLs map to a
// published local product with the same id (or the importer's "garmin-<id>" key). Everything else is left as is.
import type { HomepageConfig } from "../../lib/cms/types";
import { taxonomySeed } from "./taxonomy-seed.ts";
import { productPath } from "../../lib/catalog/product-url.ts";

const GARMIN = /^https:\/\/www\.garmin\.com\/en-US(\/[^?#]*)?(\?[^#]*)?(#.*)?$/;
/** Old local category routes that never existed in the taxonomy. */
export const CATEGORY_ALIASES: Readonly<Record<string, string>> = { automotive: "auto-home" };
/** Sale campaign pages open the local Sale category. */
const SALE_PREFIXES = ["promotions/"];

const resolvable = (slug: string) => taxonomySeed.some(n => n.slug === slug && (n.kind !== "group" || n.navVisible || n.slug.startsWith("watch-series/")));

/** Local /c/<slug> for a garmin.com or local category link; null when there is no local equivalent. */
export function localCategoryHref(href: string): string | null {
  const bySource = taxonomySeed.find(n => n.sourceHref === href && !href.startsWith("/"));
  if (bySource) return `/c/${bySource.slug}`;
  const garmin = GARMIN.exec(href);
  const path = garmin ? garmin[1] ?? "" : href.startsWith("/") && !href.startsWith("//") ? href.split(/[?#]/)[0] : null;
  if (path === null || !path.startsWith("/c/")) return null;
  const slug = path.slice(3).replace(/\/+$/, "");
  if (resolvable(slug)) return `/c/${slug}`;
  if (CATEGORY_ALIASES[slug]) return `/c/${CATEGORY_ALIASES[slug]}`;
  if (SALE_PREFIXES.some(prefix => slug.startsWith(prefix))) return "/c/promotions";
  return null;
}

/** garmin.com product id of a /p/<id>[/pn/<part>] link, or null. */
export function garminProductId(href: string): string | null {
  const garmin = GARMIN.exec(href);
  const match = garmin && /^\/p\/(\d+)(?:\/pn\/[^/]+)?\/?$/.exec(garmin[1] ?? "");
  return match ? match[1] : null;
}

/** Candidate local product keys for a garmin.com product id. */
export const productKeyCandidates = (id: string) => [id, `garmin-${id}`];

export function localizeHref(href: string, publishedKeys: ReadonlySet<string>): string {
  const category = localCategoryHref(href);
  if (category) return category;
  const id = garminProductId(href);
  const key = id ? productKeyCandidates(id).find(candidate => publishedKeys.has(candidate)) : undefined;
  return key ? productPath(key) : href;
}

/** Every product key the homepage could link to locally (for one published-product lookup). */
export function homepageProductCandidates(config: HomepageConfig): string[] {
  const hrefs = [...config.heroBanners.map(b => b.href), ...config.carousels.flatMap(c => c.items.map(i => i.href)), ...config.promoTiles.map(t => t.href), ...config.storyTiles.map(t => t.href), ...config.categoryTiles.map(t => t.href)];
  return [...new Set(hrefs.flatMap(href => { const id = typeof href === "string" ? garminProductId(href) : null; return id ? productKeyCandidates(id) : []; }))];
}

export function localizeHomepage(config: HomepageConfig, publishedKeys: ReadonlySet<string>): HomepageConfig {
  const fix = <T extends { href: string }>(item: T): T => (typeof item.href === "string" && item.href ? { ...item, href: localizeHref(item.href, publishedKeys) } : item);
  return {
    ...config,
    heroBanners: config.heroBanners.map(fix),
    carousels: config.carousels.map(c => ({ ...c, items: c.items.map(fix) })),
    promoTiles: config.promoTiles.map(fix),
    storyTiles: config.storyTiles.map(fix),
    categoryTiles: config.categoryTiles.map(fix),
  };
}
