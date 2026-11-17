import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, type Locale } from "./config";

/** Awaits the `[lang]` param, 404s on an unknown locale and enables static next-intl rendering. */
export async function initPageLocale(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  setRequestLocale(lang);
  return lang;
}

/** `Meta` translator for a page's `generateMetadata` (titles and descriptions per locale). */
export async function getMetaTranslations(params: Promise<{ lang: string }>) {
  const locale = await initPageLocale(params);
  return getTranslations({ locale, namespace: "Meta" });
}
