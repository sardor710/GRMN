import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WearablesHero } from "@/components/WearablesHero";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { SectionHeading } from "@/components/SectionHeading";
import { catalogues, getCatalogue, catalogueProducts } from "@/lib/products";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return catalogues.map((c) => ({ slug: c.slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/c/[...slug]">): Promise<Metadata> {
  const t = await getMetaTranslations(params);
  const tc = await getTranslations();
  const { slug } = await params;
  const def = getCatalogue(slug.join("/"));
  const locale = await initPageLocale(params);
  return {
    title: def ? t("catalogueTitle", { title: tc(def.titleKey) }) : "Garmin",
    ...(def
      ? localizedSeo({ path: `/c/${slug.join("/")}`, locale, indexedLocales: ROUTE_LOCALES.category })
      : {}),
  };
}

export default async function CataloguePage({ params }: PageProps<"/[lang]/c/[...slug]">) {
  const locale = await initPageLocale(params);
  const t = await getTranslations();
  const { slug } = await params;
  const def = getCatalogue(slug.join("/"));
  if (!def) notFound();

  const items = catalogueProducts(def, locale);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        {def.showFamilies ? (
          <WearablesHero />
        ) : def.hero ? (
          <section className="relative w-full overflow-hidden">
            <div className="relative aspect-[1440/380] w-full">
              <Image src={def.hero.image} alt={t(def.hero.blurbKey)} fill priority sizes="100vw" className="object-cover object-center" />
              <div className="absolute inset-0 bg-black/25" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[13px] font-medium uppercase tracking-[0.1em] text-white/90">
                  {t(def.hero.labelKey)}
                </span>
                <h1 className="g-heading mt-2 text-[38px] text-white lg:text-[46px]">{t(def.hero.blurbKey)}</h1>
              </div>
            </div>
          </section>
        ) : null}

        <div className="py-10">
          <SectionHeading>{t(def.headingKey)}</SectionHeading>
        </div>
        <CatalogueGrid products={items} />
        <div className="h-16" />
      </main>
      <SiteFooter />
    </div>
  );
}
