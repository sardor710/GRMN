import "./homepage.css";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeFeatured } from "@/components/home/HomeFeatured";
import { HomeTiles } from "@/components/home/HomeTiles";
import { HomeSignup } from "@/components/home/HomeSignup";
import { HomeFooter } from "@/components/home/HomeFooter";
import { getHomepageConfig } from "@/lib/cms/store";
import type { Metadata } from "next";
import { initPageLocale } from "@/i18n/page-locale";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  return localizedSeo({ path: "/", locale, indexedLocales: ROUTE_LOCALES.home });
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  await initPageLocale(params);
  const config = getHomepageConfig();

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
