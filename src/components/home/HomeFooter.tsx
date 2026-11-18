"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { footerColumns, legalLinks } from "@/lib/content";
import {
  FooterChevronDownIcon,
  FooterFacebookIcon,
  FooterXIcon,
  FooterYouTubeIcon,
  FooterPinterestIcon,
  FooterInstagramIcon,
} from "./footer-icons";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import styles from "./HomeFooter.module.css";
import { useLocalizeHref } from "@/i18n/useLocalizeHref";

/** garmin.com destinations, keyed by the link's message key. */
const liveLinks: Record<string, string> = {
  "Footer.links.supportCenter": "https://support.garmin.com/en-US/",
  "Footer.links.contactUs": "https://support.garmin.com/en-US/ql/?focus=topics",
  "Footer.links.shippingReturnsRefunds": "https://www.garmin.com/en-US/shop/shipping/",
  "Footer.links.orderSupport": "https://www.garmin.com/en-US/account/orderhistory/search/",
  "Footer.links.warrantyInformation": "https://www.garmin.com/en-US/legal/consumer-limited-warranty/",
  "Footer.links.dataManagement": "https://www.garmin.com/en-US/account/datamanagement/",
  "Footer.links.dealsPromotions": "https://www.garmin.com/en-US/c/promotions/",
  "Footer.links.findADealer": "https://www.garmin.com/en-US/dealerlocator",
  "Footer.links.aboutUs": "https://www.garmin.com/en-US/company/about-garmin/",
  "Footer.links.investors": "https://www.garmin.com/en-US/investors/",
  "Footer.links.newsroom": "https://www.garmin.com/en-US/newsroom/",
  "Footer.links.retailStore": "https://www.garmin.com/en-US/company/locations/stores/",
  "Footer.links.corporateSustainability": "https://www.garmin.com/en-US/sustainability/overview/",
  "Footer.links.careerOpportunities": "https://www.garmin.com/en-US/careers/",
  "Footer.links.earlyCareers": "https://www.garmin.com/en-US/careers/early-careers/",
  "Footer.links.garminConnect": "https://connect.garmin.com/",
  "Footer.links.garminExpress": "https://www.garmin.com/en-US/software/express/windows/",
  "Footer.links.connectIq": "https://apps.garmin.com/en-US",
  "Footer.links.flygarmin": "https://fly.garmin.com/fly-garmin/",
  "Footer.links.garminExplore": "https://explore.garmin.com/",
  "Footer.links.navionicsChartInstaller": "https://www.garmin.com/en-US/marine/update-now/third-party-marine-maps/#chart-installer",
  "Footer.links.garminHealth": "https://www.garmin.com/en-US/health/",
  "Footer.links.dealerResourceCenter": "https://dealers.garmin.com/drc/login",
  "Footer.links.developers": "https://developer.garmin.com/",
  "Footer.links.inreachProfessional": "https://www.garmin.com/en-US/inreach-professional/",
  "Footer.links.marineFirstResponderSolutions": "https://www.garmin.com/en-US/c/marine-first-responder-solutions/",
  "Footer.links.seastarInformationService": "https://www.garmin.com/en-US/seastar/",
  "Footer.links.automotiveOem": "https://www.garmin.com/en-US/aoem/",
  "Footer.links.rvOem": "https://www.garmin.com/en-US/rv-oem/overview/",
  "Footer.links.sensors": "https://www.garmin.com/en-US/c/sensors-and-boards/",
  "Footer.links.ambassadorsAffiliates": "https://www.garmin.com/en-US/ambassadors-and-affiliates/",
  "Footer.links.corporateSponsorships": "https://www.garmin.com/en-US/forms/sponsorship/",
  "Footer.legal.siteMap": "https://www.garmin.com/en-US/siteindex/",
  "Footer.legal.termsOfUse": "https://www.garmin.com/en-US/legal/terms-of-use",
  "Footer.legal.privacy": "https://www.garmin.com/en-US/privacy/global/",
  "Footer.legal.security": "https://www.garmin.com/en-US/legal/security",
  "Footer.legal.digitalAccessibility": "https://www.garmin.com/en-US/digital-accessibility/",
};

const socials = [
  { network: "Facebook", href: "https://www.facebook.com/Garmin", Icon: FooterFacebookIcon, wide: false },
  { network: "Twitter", href: "https://twitter.com/garmin", Icon: FooterXIcon, wide: false },
  { network: "YouTube", href: "https://www.youtube.com/garmin", Icon: FooterYouTubeIcon, wide: true },
  { network: "Pinterest", href: "https://www.pinterest.com/garmin/", Icon: FooterPinterestIcon, wide: false },
  { network: "Instagram", href: "https://www.instagram.com/garmin/", Icon: FooterInstagramIcon, wide: false },
];

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
                      <a href={localize(liveLinks[link.labelKey] ?? link.href)}>{renderLabel(t(link.labelKey))}</a>
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
          <a href="https://www.garmin.com/en-US/select-a-location/">{t("Footer.region")}</a>
          <LanguageSwitcher variant="footer" />
        </div>
        <ul className={styles.socials}>
          {socials.map(({ network, href, Icon, wide }) => (
            <li key={network}>
              <a href={href} aria-label={t("Footer.social", { network })}>
                <Icon className={wide ? styles.wideIcon : undefined} />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.legal}>
        <div>
          <p>{t("Footer.copyright")}</p>
        </div>
        <ul>
          {legalLinks.map((link) => (
            <li key={link.labelKey}>
              <a href={localize(liveLinks[link.labelKey] ?? link.href)}>{t(link.labelKey)}</a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
