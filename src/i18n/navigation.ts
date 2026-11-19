import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES } from "./config";

/**
 * next-intl routing. Locale detection and redirects are owned by `src/proxy.ts`
 * (`decideLocaleRedirect`), so next-intl only localizes links and navigation.
 */
export const intlRouting = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Kazakh links use the public /kz segment (the proxy maps /kz to the internal kk route).
  localePrefix: { mode: "always", prefixes: { kk: "/kz" } },
  localeDetection: false,
  localeCookie: { name: LOCALE_COOKIE, maxAge: 60 * 60 * 24 * 365 },
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(intlRouting);
