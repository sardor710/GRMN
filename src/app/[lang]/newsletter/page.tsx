import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export async function generateMetadata({ params }: PageProps<"/[lang]/newsletter">): Promise<Metadata> {
  const t = await getMetaTranslations(params);
  return { title: t("newsletterTitle"), description: t("newsletterDescription") };
}

export default async function NewsletterPage({ params }: PageProps<"/[lang]/newsletter">) {
  await initPageLocale(params);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <NewsletterSignup />
      </main>
      <SiteFooter />
    </div>
  );
}
