import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AccountDashboard } from "@/components/AccountDashboard";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export async function generateMetadata({ params }: PageProps<"/[lang]/account">): Promise<Metadata> {
  const t = await getMetaTranslations(params);
  return { title: t("accountTitle") };
}

export default async function AccountPage({ params }: PageProps<"/[lang]/account">) {
  await initPageLocale(params);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1 bg-neutral-50">
        <AccountDashboard />
      </main>
      <SiteFooter />
    </div>
  );
}
