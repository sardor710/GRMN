import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CartView } from "@/components/CartView";
import { initPageLocale } from "@/i18n/page-locale";

export const metadata: Metadata = {
  title: "Shopping Cart | Garmin",
};

export default async function CartPage({ params }: PageProps<"/[lang]/cart">) {
  await initPageLocale(params);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <CartView />
      </main>
      <SiteFooter />
    </div>
  );
}
