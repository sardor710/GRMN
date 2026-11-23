import type { MetadataRoute } from "next";
import { cmsBackend, readProductsPage, readBlogsPage, readHomepage } from "@/server/cms/source";
import { getSitemapCategorySlugs } from "@/lib/products";
import { ROUTE_LOCALES, SITE_URL, buildSitemapEntries, type SitemapRoute } from "@/i18n/seo";
import { homepageLocales, translatedLocales } from "@/i18n/translate-record";
import { productSitemapRoutes } from "@/lib/seo/sitemap-products";
import { productPath } from "@/lib/catalog/product-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: SitemapRoute[] = [
    { path: "/", indexedLocales: homepageLocales(await readHomepage()), changeFrequency: "daily", priority: 1.0 },
    { path: "/compare", indexedLocales: ROUTE_LOCALES.compare, changeFrequency: "weekly", priority: 0.8 },
    { path: "/garmin-pay", indexedLocales: ROUTE_LOCALES.garminPay, changeFrequency: "monthly", priority: 0.7 },
    { path: "/select-a-location", indexedLocales: ROUTE_LOCALES.selectLocation, changeFrequency: "monthly", priority: 0.3 },
    { path: "/minisite/fenix-8", indexedLocales: ROUTE_LOCALES["minisite:fenix-8"], changeFrequency: "weekly", priority: 0.9 },
    { path: "/minisite/marq", indexedLocales: ROUTE_LOCALES["minisite:marq"], changeFrequency: "weekly", priority: 0.9 },
    { path: "/minisite/marq2", indexedLocales: ROUTE_LOCALES["minisite:marq2"], changeFrequency: "weekly", priority: 0.9 },
    { path: "/minisite/why-garmin", indexedLocales: ROUTE_LOCALES["minisite:why-garmin"], changeFrequency: "monthly", priority: 0.7 },
    { path: "/blog", indexedLocales: ROUTE_LOCALES.blogIndex, changeFrequency: "daily", priority: 0.8 },
  ].map((r) => ({ ...r, lastModified: now })) as SitemapRoute[];

  // Same source the /c/[...slug] page serves: taxonomy pages with at least one listed product (PostgreSQL), or the
  // legacy catalogues.
  const categoryRoutes: SitemapRoute[] = (await getSitemapCategorySlugs()).map((slug) => ({
    path: `/c/${slug}`,
    indexedLocales: ROUTE_LOCALES.category,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // PostgreSQL catalog (owner 2026-11-23): each product page /p/{code} and every variant page /p/{code}/{sku}, in the
  // languages the product is translated into (product_translations). A record-level canonical override is listed
  // as-is, like before, without localized alternates or variant pages.
  const normalizedRoutes:SitemapRoute[]=[],canonicalEntries:MetadataRoute.Sitemap=[];
  if(cmsBackend()==="postgres"){
    const {getCatalogService}=await import("@/server/catalog/runtime");const catalog=getCatalogService();let cursor:string|undefined;
    do{
      const page=await catalog.listProducts({market:"default",locale:"en",displayCurrency:"KZT"},{limit:100,cursor});
      const ids=page.items.map(p=>p.id),[locales,skus]=await Promise.all([catalog.translatedLocales(ids),catalog.variantSkus(ids)]);
      const built=productSitemapRoutes(page.items.map(p=>({productCode:p.productCode,noIndex:p.noIndex===true,canonicalUrl:p.canonicalUrl??null,updatedAt:p.updatedAt?new Date(p.updatedAt):now,indexedLocales:locales.get(p.id)??["en"],skus:skus.get(p.id)??[]})));
      normalizedRoutes.push(...built.routes);canonicalEntries.push(...built.canonical);
      cursor=page.nextCursor??undefined;
    }while(cursor);
  }
  // Legacy CMS products (records carry translations, so ru/kk are listed once translated).
  const products: import("@/lib/cms/types").CMSProduct[] = [];
  let productCursor:string|undefined;if(cmsBackend()==="legacy")do{const page=await readProductsPage({limit:100,cursor:productCursor});products.push(...page.items);productCursor=page.nextCursor??undefined;}while(productCursor);
  const productRoutes: SitemapRoute[] = products
    .filter((p) => !p.noIndex && p.status === "published")
    .map((p) => ({
      path: productPath(p.id),
      indexedLocales: translatedLocales(p, ["name", "description"]),
      lastModified: p.createdAt ? new Date(p.createdAt) : now,
      changeFrequency: "daily",
      priority: p.isFeatured ? 0.95 : 0.85,
    }));

  const blogs: import("@/lib/cms/types").CMSBlog[] = [];
  let blogCursor:string|undefined;do{const page=await readBlogsPage({limit:100,cursor:blogCursor});blogs.push(...page.items);blogCursor=page.nextCursor??undefined;}while(blogCursor);
  const blogRoutes: SitemapRoute[] = blogs
    .filter((b) => !b.noIndex && b.status === "published")
    .map((b) => ({
      path: `/blog/${b.slug}`,
      indexedLocales: translatedLocales(b, ["title", "content"]),
      lastModified: b.publishedAt ? new Date(b.publishedAt) : now,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

  return [
    ...buildSitemapEntries(SITE_URL, [...staticRoutes, ...categoryRoutes, ...normalizedRoutes, ...productRoutes, ...blogRoutes]),
    ...canonicalEntries,
  ];
}
