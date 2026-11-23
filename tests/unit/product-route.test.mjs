// Owner 2026-11-23: /p/{code} and /p/{code}/{sku} share one page; an unknown or archived SKU is a 404 (no redirects).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resolvePageVariant } from "../../src/lib/catalog/variant-selection.ts";

const variants = [{ id: "a", sku: "010-04336-00" }, { id: "b", sku: "010-04336-ab" }];

test("resolvePageVariant matches the SKU case-insensitively and gives null for unknown or absent SKUs", () => {
  assert.equal(resolvePageVariant(variants, "010-04336-00")?.id, "a");
  assert.equal(resolvePageVariant(variants, "010-04336-AB")?.id, "b");
  assert.equal(resolvePageVariant(variants, " 010-04336-ab ")?.id, "b");
  assert.equal(resolvePageVariant(variants, "010-99999-00"), null);
  assert.equal(resolvePageVariant(variants, ""), null);
});

test("product and variant routes share the renderer; old [id] route and ?variant= are gone", () => {
  const product = fs.readFileSync("src/app/[lang]/p/[code]/page.tsx", "utf8");
  const variant = fs.readFileSync("src/app/[lang]/p/[code]/[sku]/page.tsx", "utf8");
  for (const source of [product, variant]) {
    assert.match(source, /export async function generateMetadata/);
    assert.match(source, /export default async function/);
    assert.match(source, /from "\.{1,2}\/(?:\.\.\/)?product-page"/);
  }
  assert.match(variant, /sku/);
  assert.equal(fs.existsSync("src/app/[lang]/p/[id]"), false);
  const shared = fs.readFileSync("src/app/[lang]/p/[code]/product-page.tsx", "utf8");
  assert.doesNotMatch(shared, /variantParam|skuParam|searchParams/);
  assert.match(shared, /notFound\(\)/);
});
