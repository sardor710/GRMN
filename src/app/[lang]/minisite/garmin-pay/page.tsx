import type { Metadata } from "next";
import "./garmin-pay.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { GarminPayClient } from "@/components/garmin-pay/GarminPayClient";
import { initPageLocale } from "@/i18n/page-locale";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/minisite/garmin-pay">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  return {
    title: "Garmin Pay | Garmin Singapore",
    description:
      "Your Garmin device is already an important part of your everyday life, but with the Garmin Pay contactless payment solution, you’ll have more uses for it than ever before. It’s the faster, safer, convenient way to pay.",
    ...localizedSeo({ path: "/minisite/garmin-pay", locale, indexedLocales: ROUTE_LOCALES["minisite:garmin-pay"] }),
  };
}

export default async function GarminPayMinisitePage({ params }: PageProps<"/[lang]/minisite/garmin-pay">) {
  await initPageLocale(params);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="gp-root flex-1 bg-white">
        <GarminPayClient />
      </main>
      <SiteFooter />
    </div>
  );
}
