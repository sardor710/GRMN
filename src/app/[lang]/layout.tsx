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
import { getPublicAnalyticsConfig } from "@/server/settings/public-analytics";
import { Analytics } from "@/components/analytics/Analytics";
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
  // Task 5.2: Search Console / Yandex Webmaster meta tags, only for the tokens set in Admin ▸ Settings (read at
  // request time, like the menu, so a saved token shows on the next page load).
  await connection();
  const { googleVerification, yandexVerification } = await getPublicAnalyticsConfig();
  const verification = {
    ...(googleVerification ? { google: googleVerification } : {}),
    ...(yandexVerification ? { yandex: yandexVerification } : {}),
  };
  return {
    metadataBase: new URL(SITE_URL),
    title: t("title"),
    description: t("description"),
    icons: siteIcons,
    ...(Object.keys(verification).length ? { verification } : {}),
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
  // Task 5.2: Google tags from Admin ▸ Settings (storefront only; the admin root layout renders none).
  const { ga4Id, gtmId } = await getPublicAnalyticsConfig();

  return (
    <html lang={lang} className={htmlClassName}>
      <body className={bodyClassName}>
        {/* First child of <body>: its effect sets up the tag queue before any page effect sends an event. */}
        <Analytics ga4Id={ga4Id} gtmId={gtmId} />
        <NextIntlClientProvider locale={lang} messages={clientMessages}>
          <MegaNavProvider items={menu}>
            <CartProvider>{children}</CartProvider>
          </MegaNavProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
