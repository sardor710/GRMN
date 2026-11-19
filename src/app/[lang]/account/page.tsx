import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AccountDashboard } from "@/components/AccountDashboard";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

// The dashboard reads only the signed-in session's records through /api/account/*; this page
// renders no customer data on the server and never touches shared CMS records.
export async function generateMetadata({ params }: PageProps<"/[lang]/account">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getMetaTranslations(params);
  return {
    title: t("accountTitle"),
    // Private page: noindex,follow and no hreflang (ROUTE_LOCALES.account is empty).
    ...localizedSeo({ path: "/account", locale, indexedLocales: ROUTE_LOCALES.account }),
  };
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
