"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { footerColumns } from "@/lib/content";
import { FooterChevronDownIcon } from "./footer-icons";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import styles from "./HomeFooter.module.css";
import { useLocalizeHref } from "@/i18n/useLocalizeHref";

// Owner 2026-11-25: only the entries in footerColumns (src/lib/content.ts); the For Business column, the social
// icons and the legal links (all garmin.com or other outside sites) are gone. An entry without href is plain text.

// Live uses a "Superscripts-Roboto" face that draws ® as a small raised glyph.
function renderLabel(label: string) {
  const parts = label.split("®");
  if (parts.length === 1) return label;
  return parts.flatMap((part, index) =>
    index === 0 ? [part] : [<span key={index} className={styles.reg}>®</span>, part],
  );
}

export function HomeFooter() {
  const t = useTranslations();
  const localize = useLocalizeHref();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <footer className={styles.footer} data-home="footer">
      <nav className={styles.nav} aria-label={t("Footer.navLabel")}>
        <ul className={styles.columns}>
          {footerColumns.map((column) => {
            const expanded = open === column.id;
            const panelId = `gf-${column.id}`;
            return (
              <li className={styles.column} key={column.id} data-open={expanded || undefined}>
                <button
                  type="button"
                  className={styles.heading}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? null : column.id)}
                >
                  <span>{t(column.headingKey)}</span>
                  <FooterChevronDownIcon aria-hidden="true" className={styles.chevron} />
                </button>
                <ul className={styles.links} id={panelId}>
                  {column.links.map((link) => (
                    <li key={link.labelKey}>
                      {link.href
                        ? <a href={link.href.startsWith("/") ? localize(link.href) : link.href}>{renderLabel(t(link.labelKey))}</a>
                        : <span className={styles.plain}>{renderLabel(t(link.labelKey))}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={styles.company}>
        <div className={styles.locale}>
          <a href={localize("/select-a-location")}>{t("Footer.region")}</a>
          <LanguageSwitcher variant="footer" />
        </div>
      </div>
      <div className={styles.legal}>
        <div>
          <p>{t("Footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
