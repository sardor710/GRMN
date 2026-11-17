import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogExplorer, type BlogExplorerPost } from "@/components/BlogExplorer";
import { blogPosts } from "@/lib/blog";
import { getBlogs } from "@/lib/cms/store";
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

export default async function BlogPage({ params }: PageProps<"/[lang]/blog">) {
  const locale = await initPageLocale(params);
  const t = await getTranslations("BlogPage");
  const cmsBlogs = getBlogs();
  const posts: BlogExplorerPost[] = blogPosts.map((post) => {
    const card = localizeBlogCard(post, cmsBlogs.find((b) => b.slug === post.slug), locale);
    return {
      ...post,
      displayTitle: card.title,
      displayExcerpt: card.excerpt,
      displayCategories: card.categories,
      dateLabel: formatDate(post.isoDate, locale, "long"),
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
      </main>
      <SiteFooter />
    </div>
  );
}
