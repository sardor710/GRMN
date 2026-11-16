import Link from "next/link";
import {readBlogsPage} from "@/server/cms/source";
import { notFound } from "next/navigation";
import { readOr } from "@/server/public-input";
export const dynamic="force-dynamic";
import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogExplorer } from "@/components/BlogExplorer";

export const metadata: Metadata = {
  title: "Garmin Blog | The latest on our products and technology",
  description: "The latest on Garmin products and technology.",
};

export default async function BlogPage({searchParams}:{searchParams:Promise<{cursor?:string;search?:string;category?:string}>}) {
  const query=await searchParams,page=await readOr(readBlogsPage({limit:24,...query}),notFound),next=new URLSearchParams();if(query.search)next.set("search",query.search);if(query.category)next.set("category",query.category);if(page.nextCursor)next.set("cursor",page.nextCursor);
  const posts=page.items.map(b=>({slug:b.slug,title:b.title,category:(b.category??"").toLowerCase(),categories:b.category?[b.category]:[],date:b.publishedAt||b.createdAt,image:b.coverImage,excerpt:b.excerpt,readTime:b.readingTime}));
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <div className="py-4 text-center">
          <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            Garmin Blog
          </span>
        </div>
        <div className="relative aspect-[1440/460] w-full">
          <Image
            src="/images/blog/hero.jpg"
            alt="Garmin Blog"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
        <BlogExplorer posts={posts} />
        {page.nextCursor&&<Link className="block p-6 text-center underline" href={"?"+next}>Next articles</Link>}
      </main>
      <SiteFooter />
    </div>
  );
}
