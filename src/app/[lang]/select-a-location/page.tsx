import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LocationList } from "@/components/LocationList";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { initPageLocale } from "@/i18n/page-locale";

export async function generateMetadata({ params }: PageProps<"/[lang]/select-a-location">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getTranslations({ locale, namespace: "Locations" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...localizedSeo({ path: "/select-a-location", locale, indexedLocales: ROUTE_LOCALES.selectLocation }),
  };
}

export default async function SelectALocationPage({ params }: PageProps<"/[lang]/select-a-location">) {
  const locale = await initPageLocale(params);
  const t = await getTranslations({ locale, namespace: "Locations" });
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1 bg-white">
        <section className="mx-auto max-w-[1000px] px-4 pt-12 pb-20">
          <h1 className="g-heading text-center text-[32px] leading-tight text-black sm:text-[40px]">{t("title")}</h1>
          <p className="mx-auto mt-4 max-w-[640px] text-center text-[15px] leading-relaxed text-neutral-600">{t("intro")}</p>
          <div className="mt-10">
            <LocationList />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
