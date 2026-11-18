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

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  // R18: ru/kk are indexable only once the CMS hero + carousel titles are translated. Reads the same
  // config the page renders (legacy JSON or PostgreSQL with resolved collections).
  return localizedSeo({ path: "/", locale, indexedLocales: homepageLocales(await readHomepage()) });
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const locale = await initPageLocale(params);
  const config = localizeHomepage(await readHomepage(), locale);

  return (
    <div className="garmin-home min-h-screen bg-white">
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
