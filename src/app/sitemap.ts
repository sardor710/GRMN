import type { MetadataRoute } from "next";
import { getProducts, getBlogs } from "@/lib/cms/store";
import { catalogues } from "@/lib/products";
import { ROUTE_LOCALES, SITE_URL, buildSitemapEntries, type SitemapRoute } from "@/i18n/seo";
import { translatedLocales } from "@/i18n/translate-record";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: SitemapRoute[] = [
    { path: "/", indexedLocales: ROUTE_LOCALES.home, changeFrequency: "daily", priority: 1.0 },
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

  const productRoutes: SitemapRoute[] = getProducts()
    .filter((p) => !p.noIndex && p.status === "published")
    .map((p) => ({
      path: `/p/${p.id}`,
      indexedLocales: translatedLocales(p, ["name", "description"]),
      lastModified: p.createdAt ? new Date(p.createdAt) : now,
      changeFrequency: "daily",
      priority: p.isFeatured ? 0.95 : 0.85,
    }));

  const blogRoutes: SitemapRoute[] = getBlogs()
    .filter((b) => !b.noIndex && b.status === "published")
    .map((b) => ({
      path: `/blog/${b.slug}`,
      indexedLocales: translatedLocales(b, ["title", "content"]),
      lastModified: b.publishedAt ? new Date(b.publishedAt) : now,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

  return buildSitemapEntries(SITE_URL, [...staticRoutes, ...categoryRoutes, ...productRoutes, ...blogRoutes]);
}
