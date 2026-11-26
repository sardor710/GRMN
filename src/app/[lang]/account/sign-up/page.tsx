import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SignUpForm } from "@/components/account/SignUpForm";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

// Owner 2026-11-26: the one-page sign-up. Private like the account page (noindex,follow, no hreflang).
export async function generateMetadata({ params }: PageProps<"/[lang]/account/sign-up">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getMetaTranslations(params);
  return {
    title: t("signUpTitle"),
    ...localizedSeo({ path: "/account/sign-up", locale, indexedLocales: ROUTE_LOCALES.account }),
  };
}

export default async function SignUpPage({ params }: PageProps<"/[lang]/account/sign-up">) {
  await initPageLocale(params);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1 bg-neutral-50">
        <SignUpForm />
      </main>
      <SiteFooter />
    </div>
  );
}
