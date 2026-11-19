"use client";

import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_LABEL, SWITCHER_ORDER, type Locale } from "@/i18n/config";
import styles from "./LanguageSwitcher.module.css";

export type LanguageSwitcherVariant = "header" | "footer" | "mobile";

function LanguageLinks({ variant, search }: { variant: LanguageSwitcherVariant; search: string }) {
  const t = useTranslations("Header");
  const current = useLocale() as Locale;
  const pathname = usePathname();
  const compact = variant === "header";
  const href = search ? `${pathname}?${search}` : pathname;

  return (
    <ul className={`${styles.list} ${styles[variant]}`} aria-label={t("language")}>
      {SWITCHER_ORDER.map((locale) => (
        <li key={locale}>
          <Link
            href={href}
            locale={locale}
            hrefLang={locale}
            lang={locale}
            className={styles.link}
            aria-current={locale === current ? "true" : undefined}
            aria-label={compact ? LOCALE_LABEL[locale] : undefined}
            title={compact ? LOCALE_LABEL[locale] : undefined}
          >
            {compact ? locale.toUpperCase() : LOCALE_LABEL[locale]}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Reads the query string client-side; the Suspense fallback below renders the same links without it. */
function LanguageLinksWithSearch({ variant }: { variant: LanguageSwitcherVariant }) {
  const search = useSearchParams().toString();
  return <LanguageLinks variant={variant} search={search} />;
}

/**
 * Real `<a>` links to the current page in every locale (crawlable). Following one sets the
 * NEXT_LOCALE cookie (next-intl `Link` with `locale`) and keeps the query string.
 */
export function LanguageSwitcher({ variant }: { variant: LanguageSwitcherVariant }) {
  return (
    <Suspense fallback={<LanguageLinks variant={variant} search="" />}>
      <LanguageLinksWithSearch variant={variant} />
    </Suspense>
  );
}
