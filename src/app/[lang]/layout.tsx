import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import "../garmin-fonts.css";
import { CartProvider } from "@/lib/cart";
import { LOCALES } from "@/i18n/config";
import { SITE_URL } from "@/i18n/seo";
import { bodyClassName, htmlClassName, siteIcons } from "../fonts";

/** Message namespaces that client components read. Server-only namespaces stay off the client. */
const CLIENT_NAMESPACES: readonly string[] = [
  "Account",
  "AccountPortal",
  "BlogExplorer",
  "Cart",
  "Checkout",
  "CatalogueGrid",
  "Compare",
  "CompareBar",
  "Footer",
  "Header",
  "HomeFeatured",
  "HomeHero",
  "HomeSignup",
  "Newsletter",
  "OrderDetails",
  "ProductAccessories",
  "ProductBadge",
  "ProductCard",
  "ProductTabs",
  "ProductTop",
];

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(LOCALES, lang)) return {};
  const t = await getTranslations({ locale: lang, namespace: "Meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("title"),
    description: t("description"),
    icons: siteIcons,
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(LOCALES, lang)) notFound();
  setRequestLocale(lang);

  const messages = await getMessages();
  const clientMessages = Object.fromEntries(
    Object.entries(messages).filter(([namespace]) => CLIENT_NAMESPACES.includes(namespace)),
  );

  return (
    <html lang={lang} className={htmlClassName}>
      <body className={bodyClassName}>
        <NextIntlClientProvider locale={lang} messages={clientMessages}>
          <CartProvider>{children}</CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
