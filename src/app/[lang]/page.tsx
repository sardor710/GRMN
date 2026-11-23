import "./homepage.css";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeFeatured } from "@/components/home/HomeFeatured";
import { HomeTiles } from "@/components/home/HomeTiles";
import { HomeSignup } from "@/components/home/HomeSignup";
import { HomeFooter } from "@/components/home/HomeFooter";
import { readHomepage } from "@/server/cms/source";
import type { Metadata } from "next";
import { initPageLocale } from "@/i18n/page-locale";
import { localizedSeo } from "@/i18n/seo";
import { homepageLocales, localizeHomepage } from "@/i18n/translate-record";
import { localizeHomepageLinks } from "@/lib/products";
import { JsonLdScript } from "@/components/seo/JsonLd";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/product-jsonld";
import { SITE_URL } from "@/i18n/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  // R18: ru/kk are indexable only once the CMS hero + carousel titles are translated. Reads the same
  // config the page renders (legacy JSON or PostgreSQL with resolved collections).
  return localizedSeo({ path: "/", locale, indexedLocales: homepageLocales(await readHomepage()) });
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const locale = await initPageLocale(params);
  // M4.4: CMS links to garmin.com categories/products open the local page when the store has one.
  const config = await localizeHomepageLinks(localizeHomepage(await readHomepage(), locale));

  return (
    <div className="garmin-home min-h-screen bg-white">
      <JsonLdScript data={organizationJsonLd(SITE_URL)} />
      <JsonLdScript data={websiteJsonLd(locale, SITE_URL)} />
      <HomeHeader />
      <main>
        <HomeHero banners={config.heroBanners} />
        <HomeFeatured carousels={config.carousels} />
        <HomeTiles
          promoTiles={config.promoTiles}
          storyTiles={config.storyTiles}
          categoryTiles={config.categoryTiles}
        />
        <HomeSignup />
      </main>
      <HomeFooter />
    </div>
  );
}
