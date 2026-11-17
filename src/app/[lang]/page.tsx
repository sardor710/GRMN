import "./homepage.css";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeFeatured } from "@/components/home/HomeFeatured";
import { HomeTiles } from "@/components/home/HomeTiles";
import { HomeSignup } from "@/components/home/HomeSignup";
import { HomeFooter } from "@/components/home/HomeFooter";
import { getHomepageConfig } from "@/lib/cms/store";
import { initPageLocale } from "@/i18n/page-locale";

export const dynamic = "force-dynamic";

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
