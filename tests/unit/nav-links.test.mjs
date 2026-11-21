// M4.4: every mega-menu link is either a local route that resolves (a taxonomy page or an existing app route)
// or is listed in EXTERNAL_NAV_LINKS with a reason; no "#" links remain in nav/home components; homepage CMS
// links are rewritten to local pages where the store has them.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { megaNav, takeoverBar, EXTERNAL_NAV_LINKS } from "../../src/lib/homepage-nav.ts";
import { taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";
import { watchFamilies } from "../../src/lib/catalog-constants.ts";
import { homeCategoryTiles, homePromoTiles, homeHeroSlides, homeFeaturedCards } from "../../src/lib/homepage-content.ts";
import { garminProductId, localCategoryHref, localizeHomepage, localizeHref, homepageProductCandidates } from "../../src/server/catalog/local-links.ts";

const resolvableSlugs = new Set(taxonomySeed.filter(n => n.kind !== "group" || n.navVisible || n.slug.startsWith("watch-series/")).map(n => n.slug));
const appRouteExists = href => {
  const segments = href.split(/[?#]/)[0].split("/").filter(Boolean);
  return fs.existsSync(path.join("src/app", ...segments, "page.tsx"));
};
function localResolves(href) {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const clean = href.split(/[?#]/)[0];
  if (clean.startsWith("/c/")) return resolvableSlugs.has(clean.slice(3));
  if (clean.startsWith("/p/")) return true;
  return appRouteExists(clean);
}
const allLinks = () => [
  ...megaNav.flatMap(item => [
    { where: item.label, href: item.href },
    ...(item.columns ?? []).flat().flatMap(group => group.links.map(link => ({ where: `${item.label} > ${link.label}`, href: link.href }))),
    ...(item.promos ?? []).map(promo => ({ where: `${item.label} promo ${promo.title}`, href: promo.href })),
  ]),
  { where: "takeover bar", href: takeoverBar.href },
];

test("every mega-menu href is a resolving local route or an allowlisted external link", () => {
  const external = new Set(EXTERNAL_NAV_LINKS.map(e => e.href));
  const bad = allLinks().filter(({ href }) => !(href.startsWith("/") ? localResolves(href) : external.has(href)));
  assert.deepEqual(bad, []);
  assert.ok(allLinks().filter(l => l.href.startsWith("/c/")).length >= 90, "the catalog part of the menu is local");
  for (const entry of EXTERNAL_NAV_LINKS) assert.ok(entry.reason.length > 0, entry.href);
});

test("no allowlisted external link has a taxonomy node (those must be local)", () => {
  const nodeSources = new Set(taxonomySeed.map(n => n.sourceHref).filter(Boolean));
  for (const { href } of EXTERNAL_NAV_LINKS) {
    assert.ok(!nodeSources.has(href), `${href} mirrors a taxonomy node`);
    assert.equal(localCategoryHref(href), null, `${href} has a local category`);
  }
  // Every taxonomy node mirrored from a garmin.com menu link is reachable from the menu.
  const local = new Set(allLinks().map(l => l.href));
  for (const node of taxonomySeed.filter(n => n.kind === "catalog" && n.sourceHref?.startsWith("https://"))) {
    assert.ok(local.has(`/c/${node.slug}`) || node.parentKey === null, `${node.name} (${node.slug}) is linked locally`);
  }
});

test("no '#' placeholder links remain in nav and home components", () => {
  const files = ["src/lib/homepage-nav.ts", "src/lib/homepage-content.ts", "src/components/WearablesHero.tsx", "src/components/SiteHeader.tsx",
    ...fs.readdirSync("src/components/home").filter(f => f.endsWith(".tsx")).map(f => `src/components/home/${f}`)];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /href=["']#["']|href:\s*["']#["']|\|\|\s*["']#["']/, file);
  for (const family of watchFamilies) assert.ok(family.href && localResolves(family.href), `${family.name} links to its series page`);
  for (const tile of [...homeCategoryTiles, ...homePromoTiles]) if (tile.href.startsWith("/")) assert.ok(localResolves(tile.href), tile.href);
  for (const item of [...homeHeroSlides, ...homeFeaturedCards]) if (item.href.startsWith("/c/")) assert.ok(localResolves(item.href), item.href);
});

test("homepage CMS links: garmin.com categories and published products become local, others stay", () => {
  const published = new Set(["1941179", "garmin-1953453"]);
  assert.equal(localizeHref("https://www.garmin.com/en-US/c/sports-fitness/swimming-smartwatches/", published), "/c/sports-fitness/swimming-smartwatches");
  assert.equal(localizeHref("https://www.garmin.com/en-US/c/promotions/holiday-sale-guide-americas/", published), "/c/promotions");
  assert.equal(localizeHref("/c/automotive", published), "/c/auto-home", "the old Auto & Home tile no longer 404s");
  assert.equal(localizeHref("/c/marine", published), "/c/marine");
  assert.equal(localizeHref("https://www.garmin.com/en-US/p/1941179/", published), "/p/1941179");
  assert.equal(localizeHref("https://www.garmin.com/en-US/p/1953453/", published), "/p/garmin-1953453", "imported products keep the garmin- key");
  assert.equal(localizeHref("https://www.garmin.com/en-US/p/1555457/pn/010-02985-01/", published), "https://www.garmin.com/en-US/p/1555457/pn/010-02985-01/", "unpublished products stay external");
  assert.equal(localizeHref("https://www.garmin.com/en-US/health/", published), "https://www.garmin.com/en-US/health/");
  assert.equal(localizeHref("https://apps.garmin.com/apps/collection?ids=1", published), "https://apps.garmin.com/apps/collection?ids=1");
  assert.equal(garminProductId("https://www.garmin.com/en-US/p/1613801/pn/010-03013-00/"), "1613801");
  const config = { heroBanners: [{ href: "https://www.garmin.com/en-US/p/1941179/" }], carousels: [{ items: [{ href: "https://www.garmin.com/en-US/p/1953453/" }, { href: "" }] }], promoTiles: [{ href: "/c/sports-fitness/running-smartwatches" }], storyTiles: [{ href: "https://www.garmin.com/en-US/stories/" }], categoryTiles: [{ href: "/c/automotive" }] };
  assert.deepEqual(homepageProductCandidates(config).sort(), ["1941179", "1953453", "garmin-1941179", "garmin-1953453"]);
  const out = localizeHomepage(config, published);
  assert.deepEqual([out.heroBanners[0].href, out.carousels[0].items[0].href, out.carousels[0].items[1].href, out.promoTiles[0].href, out.storyTiles[0].href, out.categoryTiles[0].href],
    ["/p/1941179", "/p/garmin-1953453", "", "/c/sports-fitness/running-smartwatches", "https://www.garmin.com/en-US/stories/", "/c/auto-home"]);
});
