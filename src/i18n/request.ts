import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./config";
import { mergeMessages, type Messages } from "./messages";
import en from "../../messages/en.json";

async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === "en") return en;
  const overlay = (await import(`../../messages/${locale}.json`)).default as Messages;
  return mergeMessages(en, overlay);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = hasLocale(LOCALES, requested) ? requested : DEFAULT_LOCALE;
  return { locale, messages: await loadMessages(locale) };
});
