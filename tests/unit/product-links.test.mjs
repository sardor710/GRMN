// Owner 2026-11-23: every storefront product link is built by src/lib/catalog/product-url.ts (/p/{code}[/{sku}]).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []);
// Admin SEO previews and the sitemap move to productPath in Tasks 3.3 and 4.x; remove them from this list then.
const PENDING = new Set(["src/lib/seo/analyzer.ts", "src/components/admin/product-editor/tabs/SeoTab.tsx", "src/app/admin/products/_components/ProductsScreen.tsx", "src/app/admin/seo/_components/SEOScreen.tsx", "src/app/sitemap.ts"]);

test("no file builds a /p/ link by hand (template literal or ?variant=/?sku= query) outside product-url.ts", () => {
  const offenders = files("src").filter(file => file !== path.join("src", "lib", "catalog", "product-url.ts") && !PENDING.has(file))
    .filter(file => /`\/p\/\$\{|\/p\/\$\{|\?variant=\$\{/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});
