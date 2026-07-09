import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SectionHeading } from "@/components/SectionHeading";
import { blogPosts, getPost, articleBody } from "@/lib/blog";

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
  return { title: post ? `${post.title} | Garmin Blog` : "Garmin Blog" };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const body = articleBody(post);
  const related = blogPosts.filter((p) => p.slug !== post.slug && p.category === post.category).slice(0, 3);
  const fallbackRelated = related.length ? related : blogPosts.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <div className="relative aspect-[1440/520] w-full">
          <Image src={post.image} alt={post.title} fill priority sizes="100vw" className="object-cover object-center" />
        </div>

        <article className="mx-auto max-w-[760px] px-4 py-12">
          <div className="flex gap-3">
            {post.categories.map((c) => (
              <span key={c} className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#007cc3]">
                {c}
              </span>
            ))}
          </div>
          <h1 className="g-heading mt-3 text-[36px] leading-tight text-black">{post.title}</h1>
          <div className="mt-3 flex items-center gap-4 text-[13px] text-neutral-500">
            <span>{post.date}</span>
            <span>·</span>
            <span>{post.readTime}</span>
          </div>
          <div className="mt-8 space-y-5">
            {body.map((para, i) => (
              <p
                key={i}
                className={i === 0 ? "text-[19px] leading-relaxed text-black" : "text-[17px] leading-relaxed text-neutral-700"}
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
