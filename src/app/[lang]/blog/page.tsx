import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogExplorer } from "@/components/BlogExplorer";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export async function generateMetadata({ params }: PageProps<"/[lang]/blog">): Promise<Metadata> {
  const tm = await getMetaTranslations(params);
  return { title: tm("blogTitle"), description: tm("blogDescription") };
}

export default async function BlogPage({ params }: PageProps<"/[lang]/blog">) {
  await initPageLocale(params);
  const t = await getTranslations("BlogPage");
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
        <BlogExplorer />
      </main>
      <SiteFooter />
    </div>
  );
}
