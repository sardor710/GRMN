import type { MetadataRoute } from "next";
import { cmsBackend, readProductsPage, readBlogsPage } from "@/server/cms/source";
import { getSitemapCategorySlugs } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.garmin.com";
  const now = new Date();

  // Core Static Pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/garmin-pay`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/minisite/fenix-8`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/minisite/marq`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/minisite/marq2`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/minisite/why-garmin`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  // Category Routes: taxonomy pages with at least one listed product (Postgres), or the legacy catalogues.
  const categories = await getSitemapCategorySlugs();
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((slug) => ({
    url: `${baseUrl}/c/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Dynamic Products from CMS Store
  const normalized:MetadataRoute.Sitemap=[];
  if(cmsBackend()==="postgres"){const {getCatalogService}=await import("@/server/catalog/runtime");let cursor:string|undefined;do{const page=await getCatalogService().listProducts({market:"default",locale:"en",displayCurrency:"KZT"},{limit:100,cursor});normalized.push(...page.items.filter(p=>!p.noIndex).map(p=>({url:p.canonicalUrl||`${baseUrl}/p/${encodeURIComponent(p.publicKey)}`,lastModified:p.updatedAt?new Date(p.updatedAt):now,changeFrequency:"daily" as const,priority:0.85})));cursor=page.nextCursor??undefined;}while(cursor);}
  const products: import("@/lib/cms/types").CMSProduct[] = [];
  let productCursor:string|undefined;if(cmsBackend()==="legacy")do{const page=await readProductsPage({limit:100,cursor:productCursor});products.push(...page.items);productCursor=page.nextCursor??undefined;}while(productCursor);
  const productRoutes: MetadataRoute.Sitemap = products
    .filter((p) => !p.noIndex && p.status === "published")
    .map((p) => ({
      url: `${baseUrl}/p/${p.id}`,
      lastModified: p.createdAt ? new Date(p.createdAt) : now,
      changeFrequency: "daily",
      priority: p.isFeatured ? 0.95 : 0.85,
    }));

  // Dynamic Blogs from CMS Store
  const blogs: import("@/lib/cms/types").CMSBlog[] = [];
  let blogCursor:string|undefined;do{const page=await readBlogsPage({limit:100,cursor:blogCursor});blogs.push(...page.items);blogCursor=page.nextCursor??undefined;}while(blogCursor);
  const blogRoutes: MetadataRoute.Sitemap = blogs
    .filter((b) => !b.noIndex && b.status === "published")
    .map((b) => ({
      url: `${baseUrl}/blog/${b.slug}`,
      lastModified: b.publishedAt ? new Date(b.publishedAt) : now,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

  return [...staticRoutes, ...categoryRoutes, ...normalized, ...productRoutes, ...blogRoutes];
}
