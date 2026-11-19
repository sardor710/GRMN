import { notFound } from "next/navigation";
import { sanitizeRichText } from "@/server/content/sanitize";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SectionHeading } from "@/components/SectionHeading";
import { getPost, articleBody } from "@/lib/blog";
import { decodeRouteParam } from "@/lib/route-params";
import { cmsBackend, readBlog, readBlogsPage } from "@/server/cms/source";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import type { CMSBlog } from "@/lib/cms/types";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";
import { localizedSeo, localizedUrl } from "@/i18n/seo";
import { localizeBlog, resolveSeoText, translatedLocales } from "@/i18n/translate-record";
import { formatDate } from "@/i18n/format";
import { localizeBlogCard, resolveArticleContent, splitParagraphs } from "@/i18n/blog-content";

// Rendered per request so an admin edit (content, translations, noindex) shows up together with
// the force-dynamic sitemap, without a redeploy.
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return (await readBlogsPage({limit:100})).items.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/blog/[slug]">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const tm = await getMetaTranslations(params);
  const slug = decodeRouteParam((await params).slug);
  // The CMS record is the source of truth (legacy JSON or PostgreSQL); translations overlay it.
  const rawBlog = await readBlog(slug);
  const cmsBlog = rawBlog ? localizeBlog(rawBlog, locale) : undefined;
  const post = cmsBackend()==="legacy"&&cmsBlog ? getPost(slug) : undefined;

  if (!post && !cmsBlog) {
    return { title: tm("blogFallbackTitle") };
  }

  const title =
    resolveSeoText(rawBlog, locale, ["seoTitle", "title"]) ||
    (post ? tm("blogPostTitle", { title: post.title }) : tm("blogShortTitle"));
  const description =
    resolveSeoText(rawBlog, locale, ["seoDescription", "excerpt"]) ||
    cmsBlog?.excerpt ||
    post?.excerpt ||
    tm("blogPostDescription");
  const image = cmsBlog?.ogImage || cmsBlog?.coverImage || post?.image || "/images/blog/triathlon.jpg";
  const seo = localizedSeo({
    path: `/blog/${slug}`,
    locale,
    indexedLocales: translatedLocales(rawBlog ?? {}, ["title", "content"]),
    canonicalOverride: cmsBlog?.canonicalUrl || undefined,
    noIndex: cmsBlog?.noIndex,
  });

  return {
    title,
    description,
    keywords: cmsBlog?.focusKeywords?.join(", "),
    alternates: seo.alternates,
    robots: seo.robots,
    openGraph: {
      title,
      description,
      ...seo.openGraph,
      siteName: "Garmin",
      type: "article",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: post?.title || title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ArticlePage({ params }: PageProps<"/[lang]/blog/[slug]">) {
  const locale = await initPageLocale(params);
  const t = await getTranslations("BlogArticle");
  const slug = decodeRouteParam((await params).slug);
  const rawBlog = await readBlog(slug);
  const cmsBlog = rawBlog ? localizeBlog(rawBlog, locale) : undefined;
  const post = cmsBlog ? getPost(slug) : undefined;

  // A changed URL is redirected by the proxy (redirects table) before this page runs.
  if (!post && !cmsBlog) notFound();

  const activeBlog: CMSBlog = cmsBlog || {
    id: `post-${post!.slug}`,
    slug: post!.slug,
    title: post!.title,
    excerpt: post!.excerpt,
    content: post!.excerpt,
    coverImage: post!.image,
    category: post!.categories[0] || "Fitness",
    readingTime: post!.readTime,
    author: "Garmin Editorial Team",
    status: "published",
    publishedAt: new Date(post!.date).toISOString(),
    createdAt: new Date().toISOString(),
  };

  const breadcrumbs = [
    { name: "Garmin", url: localizedUrl("/", locale) },
    { name: "Blog", url: localizedUrl("/blog", locale) },
    { name: activeBlog.title, url: localizedUrl(`/blog/${activeBlog.slug}`, locale) },
  ];

  // R15: category labels follow the translated CMS record; the body is the (localized) CMS content,
  // falling back to the static article body when the record has none.
  const { body, categories } = resolveArticleContent({
    locale,
    rawBlog: rawBlog ?? cmsBlog,
    staticBody: post ? articleBody(post) : undefined,
    staticCategories: post?.categories,
  });
  // Rich text (Task 18A) is rendered as sanitized HTML; plain-text content (e.g. a translation typed
  // without markup) keeps the R15 one-paragraph-per-line layout.
  const richContent = activeBlog.content && /<[a-z][\s\S]*>/i.test(activeBlog.content) ? activeBlog.content : undefined;
  const paragraphs = activeBlog.content && !richContent ? splitParagraphs(activeBlog.content) : body;
  const displayImage = activeBlog.coverImage || post?.image;
  const displayDate = post ? formatDate(post.isoDate, locale, "long") : formatDate(activeBlog.publishedAt || activeBlog.createdAt, locale, "long");
  const displayReadTime = post?.readTime || activeBlog.readingTime || t("defaultReadTime");

  const fallbackRelated = (await readBlogsPage({limit:4})).items.filter(b=>b.slug!==slug).slice(0,3).map(b=>({
    slug: b.slug,
    title: localizeBlogCard({ title: b.title, excerpt: b.excerpt, categories: [] }, b, locale).title,
    image: b.coverImage,
    dateLabel: formatDate(b.publishedAt || b.createdAt, locale, "long"),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Structured Article Schema for Google Rich Results */}
      <ArticleJsonLd
        blog={activeBlog}
        url={localizedUrl(`/blog/${slug}`, locale)}
        locale={locale}
        headline={resolveSeoText(rawBlog, locale, ["seoTitle", "title"]) || activeBlog.seoTitle || activeBlog.title}
        description={resolveSeoText(rawBlog, locale, ["seoDescription", "excerpt"]) || activeBlog.seoDescription || activeBlog.excerpt}
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        {displayImage&&<div className="relative aspect-[1440/520] w-full">
          <Image
            src={displayImage}
            alt={activeBlog.title}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>}

        <article className="mx-auto max-w-[760px] px-4 py-12">
          <div className="flex gap-3">
            {categories.map((c) => (
              <span key={c} className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#007cc3]">
                {c}
              </span>
            ))}
          </div>
          <h1 className="g-heading mt-3 text-[36px] leading-tight text-black">{activeBlog.title}</h1>
          <div className="mt-3 flex items-center gap-4 text-[13px] text-neutral-500">
            <span>{displayDate}</span>
            <span>·</span>
            <span>{displayReadTime}</span>
            <span>·</span>
            <span>{t("byline", { author: activeBlog.author })}</span>
          </div>
          <div className="mt-8 space-y-5">
            {/* Task 18A: CMS rich text is sanitized on save and again here (older rows predate the sanitizer). */}
            {richContent ? (
              <div className="space-y-5 text-[17px] leading-relaxed text-neutral-700 [&_a]:underline [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: sanitizeRichText(richContent) }} />
            ) : paragraphs.map((para, i) => (
              <p
                key={i}
                className={i === 0 ? "text-[19px] leading-relaxed text-black font-medium" : "text-[17px] leading-relaxed text-neutral-700"}
              >
                {para}
              </p>
            ))}
          </div>
          <div className="mt-10 border-t border-neutral-200 pt-6">
            <Link href="/blog" className="text-[14px] text-[#007cc3] underline">
              {t("backToAll")}
            </Link>
          </div>
        </article>

        {/* Related */}
        <section className="bg-neutral-50 py-14">
          <div className="mx-auto max-w-[1280px] px-4">
            <SectionHeading>{t("related")}</SectionHeading>
            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
              {fallbackRelated.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group flex flex-col">
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    {p.image&&<Image src={p.image} alt={p.title} fill sizes="420px" className="object-cover transition-transform duration-500 group-hover:scale-105" />}
                  </div>
                  <h3 className="g-heading mt-3 text-[20px] leading-tight text-black group-hover:text-[#007cc3]">{p.title}</h3>
                  <p className="mt-1 text-[13px] text-neutral-500">{p.dateLabel}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
