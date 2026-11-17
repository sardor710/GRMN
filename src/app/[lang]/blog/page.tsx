import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogExplorer } from "@/components/BlogExplorer";
import { initPageLocale } from "@/i18n/page-locale";

export const metadata: Metadata = {
  title: "Garmin Blog | The latest on our products and technology",
  description: "The latest on Garmin products and technology.",
};

export default async function BlogPage({ params }: PageProps<"/[lang]/blog">) {
  await initPageLocale(params);
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
        <BlogExplorer />
      </main>
      <SiteFooter />
    </div>
  );
}
