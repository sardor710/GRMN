import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SectionHeading } from "@/components/SectionHeading";
import { blogPosts, getPost, articleBody } from "@/lib/blog";
import { getBlogs } from "@/lib/cms/store";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import type { CMSBlog } from "@/lib/cms/types";

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  const cmsBlogs = getBlogs();
  const cmsBlog = cmsBlogs.find((b) => b.slug === slug);

  if (!post && !cmsBlog) {
    return { title: "Garmin Blog & Fitness Guides" };
  }

  const title = cmsBlog?.seoTitle || (post ? `${post.title} | Garmin Blog` : "Garmin Blog");
  const description =
    cmsBlog?.seoDescription ||
    cmsBlog?.excerpt ||
    post?.excerpt ||
    "Explore training tips, GPS navigation guides, and smartwatch features on the official Garmin Blog.";
  const image = cmsBlog?.ogImage || cmsBlog?.coverImage || post?.image || "/images/blog/triathlon.jpg";
  const url = `https://www.garmin.com/blog/${slug}`;

  return {
    title,
    description,
    keywords: cmsBlog?.focusKeywords?.join(", "),
    alternates: {
      canonical: cmsBlog?.canonicalUrl || url,
    },
    robots: cmsBlog?.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      title,
      description,
      url,
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

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  const cmsBlogs = getBlogs();
  const cmsBlog = cmsBlogs.find((b) => b.slug === slug);

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
    { name: "Garmin", url: "https://www.garmin.com" },
    { name: "Blog", url: "https://www.garmin.com/blog" },
    { name: activeBlog.title, url: `https://www.garmin.com/blog/${activeBlog.slug}` },
  ];

  const body = post ? articleBody(post) : [activeBlog.content];
  const categories = post ? post.categories : [activeBlog.category];
  const displayImage = activeBlog.coverImage || post?.image || "/images/blog/triathlon.jpg";
  const displayDate = post?.date || new Date(activeBlog.publishedAt || activeBlog.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const displayReadTime = post?.readTime || activeBlog.readingTime || "4 min read";

  const related = blogPosts.filter((p) => p.slug !== slug && p.category === (post?.category || activeBlog.category)).slice(0, 3);
  const fallbackRelated = related.length ? related : blogPosts.filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Structured Article Schema for Google Rich Results */}
      <ArticleJsonLd blog={activeBlog} url={`https://www.garmin.com/blog/${slug}`} />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <div className="relative aspect-[1440/520] w-full">
          <Image
            src={displayImage}
            alt={activeBlog.title}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>

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
            <span>By {activeBlog.author}</span>
          </div>
          <div className="mt-8 space-y-5">
            {body.map((para, i) => (
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
              ← Back to all articles
            </Link>
          </div>
        </article>

        {/* Related */}
        <section className="bg-neutral-50 py-14">
          <div className="mx-auto max-w-[1280px] px-4">
            <SectionHeading>Related Articles</SectionHeading>
            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
              {fallbackRelated.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group flex flex-col">
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    <Image src={p.image} alt={p.title} fill sizes="420px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <h3 className="g-heading mt-3 text-[20px] leading-tight text-black group-hover:text-[#007cc3]">{p.title}</h3>
                  <p className="mt-1 text-[13px] text-neutral-500">{p.date}</p>
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
