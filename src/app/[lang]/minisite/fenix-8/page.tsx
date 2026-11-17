import type { Metadata } from "next";
import "./fenix-8.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Fenix8Client } from "@/components/fenix-8/Fenix8Client";
import { initPageLocale } from "@/i18n/page-locale";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/minisite/fenix-8">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  return {
    title: "fēnix 8 Series the ultimate smartwatch | Garmin Singapore",
    description:
      "fēnix 8 series - the ultimate smartwatch - the top choice for mountain climbing, trail running, skiing and other outdoor adventures. With either AMOLED or solar displays, torchlight, spectacular battery life, speaker and microphones and enhanced training features.",
    ...localizedSeo({ path: "/minisite/fenix-8", locale, indexedLocales: ROUTE_LOCALES["minisite:fenix-8"] }),
  };
}

export default async function Fenix8Page({ params }: PageProps<"/[lang]/minisite/fenix-8">) {
  await initPageLocale(params);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="f8-root flex-1 bg-black">
        <Fenix8Client />
      </main>
      <SiteFooter />
    </div>
  );
}
