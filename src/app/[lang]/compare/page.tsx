import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool } from "@/components/CompareTool";
import { getAllProducts } from "@/lib/products";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export async function generateMetadata({ params }: PageProps<"/[lang]/compare">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getMetaTranslations(params);
  return {
    title: t("compareTitle"),
    ...localizedSeo({ path: "/compare", locale, indexedLocales: ROUTE_LOCALES.compare }),
  };
}

export default async function ComparePage({ params }: PageProps<"/[lang]/compare">) {
  const locale = await initPageLocale(params);
  const products = getAllProducts(locale);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <CompareTool products={products} />
      </main>
      <SiteFooter />
    </div>
  );
}
