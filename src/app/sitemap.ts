import type { MetadataRoute } from "next";
import { getProducts, getBlogs } from "@/lib/cms/store";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
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

  // Category Routes
  const categories = [
    "smartwatches",
    "sports-fitness",
    "outdoor-recreation",
    "marine",
    "aviation",
  ];
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((slug) => ({
    url: `${baseUrl}/c/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Dynamic Products from CMS Store
  const products = getProducts();
  const productRoutes: MetadataRoute.Sitemap = products
    .filter((p) => !p.noIndex && p.status === "published")
    .map((p) => ({
      url: `${baseUrl}/p/${p.id}`,
      lastModified: p.createdAt ? new Date(p.createdAt) : now,
      changeFrequency: "daily",
      priority: p.isFeatured ? 0.95 : 0.85,
    }));

  // Dynamic Blogs from CMS Store
  const blogs = getBlogs();
  const blogRoutes: MetadataRoute.Sitemap = blogs
    .filter((b) => !b.noIndex && b.status === "published")
    .map((b) => ({
      url: `${baseUrl}/blog/${b.slug}`,
      lastModified: b.publishedAt ? new Date(b.publishedAt) : now,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...blogRoutes];
}
