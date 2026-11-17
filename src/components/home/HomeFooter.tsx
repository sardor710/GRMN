"use client";

import { useState } from "react";
import { footerColumns, legalLinks } from "@/lib/content";
import {
  FooterChevronDownIcon,
  FooterFacebookIcon,
  FooterXIcon,
  FooterYouTubeIcon,
  FooterPinterestIcon,
  FooterInstagramIcon,
} from "./footer-icons";
import styles from "./HomeFooter.module.css";

const liveLinks: Record<string, string> = {
  "Support Center": "https://support.garmin.com/en-US/",
  "Contact Us": "https://support.garmin.com/en-US/ql/?focus=topics",
  "Shipping, Returns & Refunds": "https://www.garmin.com/en-US/shop/shipping/",
  "Order Support": "https://www.garmin.com/en-US/account/orderhistory/search/",
  "Warranty Information": "https://www.garmin.com/en-US/legal/consumer-limited-warranty/",
  "Data Management": "https://www.garmin.com/en-US/account/datamanagement/",
  "Deals & Promotions": "https://www.garmin.com/en-US/c/promotions/",
  "Find a Dealer": "https://www.garmin.com/en-US/dealerlocator",
  "About Us": "https://www.garmin.com/en-US/company/about-garmin/",
  "Investors": "https://www.garmin.com/en-US/investors/",
  "Newsroom": "https://www.garmin.com/en-US/newsroom/",
  "Retail Store": "https://www.garmin.com/en-US/company/locations/stores/",
  "Corporate Sustainability": "https://www.garmin.com/en-US/sustainability/overview/",
  "Career Opportunities": "https://www.garmin.com/en-US/careers/",
  "Early Careers": "https://www.garmin.com/en-US/careers/early-careers/",
  "Garmin Connect": "https://connect.garmin.com/",
  "Garmin Express": "https://www.garmin.com/en-US/software/express/windows/",
  "Connect IQ": "https://apps.garmin.com/en-US",
  "flyGarmin": "https://fly.garmin.com/fly-garmin/",
  "Garmin Explore": "https://explore.garmin.com/",
  "Navionics Chart Installer": "https://www.garmin.com/en-US/marine/update-now/third-party-marine-maps/#chart-installer",
  "Garmin Health": "https://www.garmin.com/en-US/health/",
  "Dealer Resource Center": "https://dealers.garmin.com/drc/login",
  "Developers": "https://developer.garmin.com/",
  "inReach Professional": "https://www.garmin.com/en-US/inreach-professional/",
  "Marine First Responder Solutions": "https://www.garmin.com/en-US/c/marine-first-responder-solutions/",
  "SeaStar® Information Service": "https://www.garmin.com/en-US/seastar/",
  "Automotive OEM": "https://www.garmin.com/en-US/aoem/",
  "RV OEM": "https://www.garmin.com/en-US/rv-oem/overview/",
  "Sensors": "https://www.garmin.com/en-US/c/sensors-and-boards/",
  "Ambassadors & Affiliates": "https://www.garmin.com/en-US/ambassadors-and-affiliates/",
  "Corporate Sponsorships": "https://www.garmin.com/en-US/forms/sponsorship/",
  "Site Map": "https://www.garmin.com/en-US/siteindex/",
  "Terms of Use": "https://www.garmin.com/en-US/legal/terms-of-use",
  "Privacy": "https://www.garmin.com/en-US/privacy/global/",
  "Security": "https://www.garmin.com/en-US/legal/security",
  "Digital Accessibility": "https://www.garmin.com/en-US/digital-accessibility/",
};

const socials = [
  { label: "Garmin on Facebook", href: "https://www.facebook.com/Garmin", Icon: FooterFacebookIcon, wide: false },
  { label: "Garmin on Twitter", href: "https://twitter.com/garmin", Icon: FooterXIcon, wide: false },
  { label: "Garmin on YouTube", href: "https://www.youtube.com/garmin", Icon: FooterYouTubeIcon, wide: true },
  { label: "Garmin on Pinterest", href: "https://www.pinterest.com/garmin/", Icon: FooterPinterestIcon, wide: false },
  { label: "Garmin on Instagram", href: "https://www.instagram.com/garmin/", Icon: FooterInstagramIcon, wide: false },
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
  const [open, setOpen] = useState<string | null>(null);

  return (
    <footer className={styles.footer} data-home="footer">
      <nav className={styles.nav} aria-label="Global Footer Navigation">
        <ul className={styles.columns}>
          {footerColumns.map((column) => {
            const expanded = open === column.heading;
            const panelId = `gf-${column.heading.toLowerCase().replace(/[^a-z]+/g, "-")}`;
            return (
              <li className={styles.column} key={column.heading} data-open={expanded || undefined}>
                <button
                  type="button"
                  className={styles.heading}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? null : column.heading)}
                >
                  <span>{column.heading}</span>
                  <FooterChevronDownIcon aria-hidden="true" className={styles.chevron} />
                </button>
                <ul className={styles.links} id={panelId}>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a href={liveLinks[link.label] ?? link.href}>{renderLabel(link.label)}</a>
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
          <a href="https://www.garmin.com/en-US/select-a-location/">United States</a>
        </div>
        <ul className={styles.socials}>
          {socials.map(({ label, href, Icon, wide }) => (
            <li key={label}>
              <a href={href} aria-label={label}>
                <Icon className={wide ? styles.wideIcon : undefined} />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.legal}>
        <div>
          <p>© Garmin Ltd. or its subsidiaries. All rights reserved.</p>
        </div>
        <ul>
          {legalLinks.map((link) => (
            <li key={link.label}>
              <a href={liveLinks[link.label] ?? link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
