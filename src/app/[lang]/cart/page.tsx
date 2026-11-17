import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CartView, type CartCatalog } from "@/components/CartView";
import { getProductsFor } from "@/lib/cms/store";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export async function generateMetadata({ params }: PageProps<"/[lang]/cart">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getMetaTranslations(params);
  return {
    title: t("cartTitle"),
    ...localizedSeo({ path: "/cart", locale, indexedLocales: ROUTE_LOCALES.cart }),
  };
}

export default async function CartPage({ params }: PageProps<"/[lang]/cart">) {
  const locale = await initPageLocale(params);
  // Display-only lookup: stored cart lines keep their English snapshot; names are localized at render time.
  const catalog: CartCatalog = {};
  for (const p of getProductsFor(locale)) {
    catalog[p.id] = {
      name: p.name,
      variants: Object.fromEntries((p.variants ?? []).map((v) => [v.sku, v.title])),
    };
  }
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <CartView catalog={catalog} />
      </main>
      <SiteFooter />
    </div>
  );
}
