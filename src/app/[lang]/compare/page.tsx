import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool } from "@/components/CompareTool";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export async function generateMetadata({ params }: PageProps<"/[lang]/compare">): Promise<Metadata> {
  const t = await getMetaTranslations(params);
  return { title: t("compareTitle") };
}

export default async function ComparePage({ params }: PageProps<"/[lang]/compare">) {
  await initPageLocale(params);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <CompareTool />
      </main>
      <SiteFooter />
    </div>
  );
}
