// Owner 2026-11-23: sitemap routes for the PostgreSQL catalog — each product page (/p/{code}) and every variant page
// (/p/{code}/{sku}) of an indexable product, listed in the languages the product is translated into.
import type { Locale } from "../../contracts/commerce.ts";
import { productPath } from "../catalog/product-url.ts";

export interface SitemapProduct {
  productCode: string;
  noIndex: boolean;
  /** Record-level canonical URL: the product is listed by that URL only (as before), without variant pages. */
  canonicalUrl: string | null;
  updatedAt: Date;
  indexedLocales: readonly Locale[];
  /** SKUs of the variants on sale (their pages are 200). */
  skus: readonly string[];
}

export interface ProductSitemapRoute { path: string; indexedLocales: readonly Locale[]; lastModified: Date; changeFrequency: "daily"; priority: number }

export function productSitemapRoutes(products: readonly SitemapProduct[]): { routes: ProductSitemapRoute[]; canonical: { url: string; lastModified: Date; changeFrequency: "daily"; priority: number }[] } {
  const routes: ProductSitemapRoute[] = [];
  const canonical: { url: string; lastModified: Date; changeFrequency: "daily"; priority: number }[] = [];
  for (const p of products) {
    if (p.noIndex) continue;
    if (p.canonicalUrl) {
      canonical.push({ url: p.canonicalUrl, lastModified: p.updatedAt, changeFrequency: "daily", priority: 0.85 });
      continue;
    }
    const base = { indexedLocales: p.indexedLocales, lastModified: p.updatedAt, changeFrequency: "daily" as const };
    routes.push({ ...base, path: productPath(p.productCode), priority: 0.85 });
    for (const sku of p.skus) routes.push({ ...base, path: productPath(p.productCode, sku), priority: 0.8 });
  }
  return { routes, canonical };
}
