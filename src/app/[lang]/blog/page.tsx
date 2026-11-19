import type { Metadata } from "next";
import Image from "next/image";
// Query-only hrefs keep the current (locale-prefixed) path, so plain next/link is locale-safe here.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogExplorer, type BlogExplorerPost } from "@/components/BlogExplorer";
import { readBlogsPage } from "@/server/cms/source";
import { readOr } from "@/server/public-input";
import { formatDate } from "@/i18n/format";
import { localizeBlogCard } from "@/i18n/blog-content";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

// Card text comes from the CMS (admin translations), so render per request like the article pages.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[lang]/blog">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const tm = await getMetaTranslations(params);
  return {
    title: tm("blogTitle"),
    description: tm("blogDescription"),
    ...localizedSeo({ path: "/blog", locale, indexedLocales: ROUTE_LOCALES.blogIndex }),
  };
}

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function BlogPage({ params, searchParams }: PageProps<"/[lang]/blog">) {
  const locale = await initPageLocale(params);
  const t = await getTranslations("BlogPage");
  const raw = await searchParams;
  const query = { cursor: one(raw.cursor), search: one(raw.search), category: one(raw.category) };
  const page = await readOr(readBlogsPage({ limit: 24, ...query }), notFound);
  const next = new URLSearchParams();
  if (query.search) next.set("search", query.search);
  if (query.category) next.set("category", query.category);
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  const posts: BlogExplorerPost[] = page.items.map((b) => {
    const categories = b.category ? [b.category] : [];
    // CMS records carry translations on the legacy backend; blank or missing fields stay English.
    const card = localizeBlogCard({ title: b.title, excerpt: b.excerpt, categories }, b, locale);
    const date = b.publishedAt || b.createdAt;
    return {
      slug: b.slug,
      title: b.title,
      category: (b.category ?? "").toLowerCase(),
      categories,
      date,
      image: b.coverImage,
      excerpt: b.excerpt,
      readTime: b.readingTime,
      displayTitle: card.title,
      displayExcerpt: card.excerpt,
      displayCategories: card.categories,
      dateLabel: date ? formatDate(date, locale, "long") : "",
    };
  });
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <div className="py-4 text-center">
          <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            {t("eyebrow")}
          </span>
        </div>
        <div className="relative aspect-[1440/460] w-full">
          <Image
            src="/images/blog/hero.jpg"
            alt={t("heroAlt")}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
        <BlogExplorer posts={posts} />
        {page.nextCursor && (
          <Link className="block p-6 text-center underline" href={"?" + next}>
            {t("nextArticles")}
          </Link>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
