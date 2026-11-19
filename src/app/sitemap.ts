import type { MetadataRoute } from "next";
import { cmsBackend, readProductsPage, readBlogsPage, readHomepage } from "@/server/cms/source";
import { catalogues } from "@/lib/products";
import { ROUTE_LOCALES, SITE_URL, buildSitemapEntries, type SitemapRoute } from "@/i18n/seo";
import { homepageLocales, translatedLocales } from "@/i18n/translate-record";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: SitemapRoute[] = [
    { path: "/", indexedLocales: homepageLocales(await readHomepage()), changeFrequency: "daily", priority: 1.0 },
    { path: "/compare", indexedLocales: ROUTE_LOCALES.compare, changeFrequency: "weekly", priority: 0.8 },
    { path: "/garmin-pay", indexedLocales: ROUTE_LOCALES.garminPay, changeFrequency: "monthly", priority: 0.7 },
    { path: "/minisite/fenix-8", indexedLocales: ROUTE_LOCALES["minisite:fenix-8"], changeFrequency: "weekly", priority: 0.9 },
    { path: "/minisite/marq", indexedLocales: ROUTE_LOCALES["minisite:marq"], changeFrequency: "weekly", priority: 0.9 },
    { path: "/minisite/marq2", indexedLocales: ROUTE_LOCALES["minisite:marq2"], changeFrequency: "weekly", priority: 0.9 },
    { path: "/minisite/why-garmin", indexedLocales: ROUTE_LOCALES["minisite:why-garmin"], changeFrequency: "monthly", priority: 0.7 },
    { path: "/blog", indexedLocales: ROUTE_LOCALES.blogIndex, changeFrequency: "daily", priority: 0.8 },
  ].map((r) => ({ ...r, lastModified: now })) as SitemapRoute[];

  // Same source the /c/[...slug] page serves.
  const categoryRoutes: SitemapRoute[] = catalogues.map((c) => ({
    path: `/c/${c.slug}`,
    indexedLocales: ROUTE_LOCALES.category,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // PostgreSQL catalog: each product lists the languages it is translated into (product_translations).
  // A record-level canonical override is listed as-is, like before, and gets no localized alternates.
  const normalizedRoutes:SitemapRoute[]=[],canonicalEntries:MetadataRoute.Sitemap=[];
  if(cmsBackend()==="postgres"){const {getCatalogService}=await import("@/server/catalog/runtime");let cursor:string|undefined;do{const page=await getCatalogService().listProducts({market:"default",locale:"en",displayCurrency:"KZT"},{limit:100,cursor});const locales=await getCatalogService().translatedLocales(page.items.map(p=>p.id));for(const p of page.items.filter(p=>!p.noIndex)){const lastModified=p.updatedAt?new Date(p.updatedAt):now;if(p.canonicalUrl)canonicalEntries.push({url:p.canonicalUrl,lastModified,changeFrequency:"daily",priority:0.85});else normalizedRoutes.push({path:`/p/${encodeURIComponent(p.publicKey)}`,indexedLocales:locales.get(p.id)??["en"],lastModified,changeFrequency:"daily",priority:0.85});}cursor=page.nextCursor??undefined;}while(cursor);}
  // Legacy CMS products (records carry translations, so ru/kk are listed once translated).
  const products: import("@/lib/cms/types").CMSProduct[] = [];
  let productCursor:string|undefined;if(cmsBackend()==="legacy")do{const page=await readProductsPage({limit:100,cursor:productCursor});products.push(...page.items);productCursor=page.nextCursor??undefined;}while(productCursor);
  const productRoutes: SitemapRoute[] = products
    .filter((p) => !p.noIndex && p.status === "published")
    .map((p) => ({
      path: `/p/${p.id}`,
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
