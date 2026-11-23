// Owner 2026-11-23: the sitemap lists each product page and every variant page, per translated language.
import assert from "node:assert/strict";
import test from "node:test";
import { productSitemapRoutes } from "../../src/lib/seo/sitemap-products.ts";

const at = new Date("2026-11-23T00:00:00Z");
const product = over => ({ productCode: "1953727", noIndex: false, canonicalUrl: null, updatedAt: at, indexedLocales: ["en", "ru"], skus: ["010-04336-00", "010-04336-05", "A/B"], ...over });

test("a product gives its page plus one route per listed variant, each with the product's languages", () => {
  const { routes, canonical } = productSitemapRoutes([product()]);
  assert.deepEqual(routes.map(r => r.path), ["/p/1953727", "/p/1953727/010-04336-00", "/p/1953727/010-04336-05", "/p/1953727/A%2FB"]);
  assert.ok(routes.every(r => r.indexedLocales.join() === "en,ru" && r.lastModified === at));
  assert.equal(routes[0].priority, 0.85);
  assert.equal(routes[1].priority, 0.8);
  assert.deepEqual(canonical, []);
});

test("noIndex products are left out; a canonical override lists only that URL and no variants", () => {
  assert.deepEqual(productSitemapRoutes([product({ noIndex: true })]).routes, []);
  const { routes, canonical } = productSitemapRoutes([product({ canonicalUrl: "https://elsewhere.test/x" })]);
  assert.deepEqual(routes, []);
  assert.deepEqual(canonical.map(c => c.url), ["https://elsewhere.test/x"]);
});
