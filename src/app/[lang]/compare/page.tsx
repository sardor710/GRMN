import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool } from "@/components/CompareTool";
import { initPageLocale } from "@/i18n/page-locale";

export const metadata: Metadata = {
  title: "Compare Smartwatches | Garmin",
};

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
