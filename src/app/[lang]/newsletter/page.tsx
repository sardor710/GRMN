import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { initPageLocale } from "@/i18n/page-locale";

export const metadata: Metadata = {
  title: "Sign Up for News | Garmin",
  description: "Get Garmin product news and promotions based on your preferences.",
};

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
