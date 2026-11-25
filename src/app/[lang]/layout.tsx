import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import "../garmin-fonts.css";
import { connection } from "next/server";
import { CartProvider } from "@/lib/cart";
import { MegaNavProvider } from "@/components/home/MegaNavProvider";
import { getMegaNav } from "@/server/catalog/mega-nav-runtime";
import { LOCALES } from "@/i18n/config";
import { SITE_URL } from "@/i18n/seo";
import { bodyClassName, htmlClassName, siteIcons } from "../fonts";
import { PageViewTracker } from "@/components/traffic/PageViewTracker";
import { CookieNotice } from "@/components/traffic/CookieNotice";

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
  "CookieNotice",
  "Footer",
  "Header",
  "HomeFeatured",
  "HomeHero",
  "HomeSignup",
  "Locations",
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

  // Owner 2026-11-22: the top menu comes from Admin ▸ Categories, so every page renders at request time.
  await connection();
  const t = await getTranslations({ locale: lang });
  const menu = await getMegaNav(lang, (key) => t(key as Parameters<typeof t>[0]));
  const messages = await getMessages();
  const clientMessages = Object.fromEntries(
    Object.entries(messages).filter(([namespace]) => CLIENT_NAMESPACES.includes(namespace)),
  );

  return (
    <html lang={lang} className={htmlClassName}>
      <body className={bodyClassName}>
        <NextIntlClientProvider locale={lang} messages={clientMessages}>
          <MegaNavProvider items={menu}>
            <CartProvider>{children}</CartProvider>
            {/* Owner 2026-11-25: Admin ▸ Traffic page views. */}
            <PageViewTracker />
            <CookieNotice />
          </MegaNavProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
