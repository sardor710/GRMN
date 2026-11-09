import { footerColumns, legalLinks } from "@/lib/content";
import {
  GlobeIcon,
  FacebookIcon,
  XIcon,
  YouTubeIcon,
  PinterestIcon,
  InstagramIcon,
} from "@/components/icons";
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
  { label: "Facebook", href: "https://www.facebook.com/Garmin", Icon: FacebookIcon },
  { label: "X", href: "https://twitter.com/garmin", Icon: XIcon },
  { label: "YouTube", href: "https://www.youtube.com/garmin", Icon: YouTubeIcon },
  { label: "Pinterest", href: "https://www.pinterest.com/garmin/", Icon: PinterestIcon },
  { label: "Instagram", href: "https://www.instagram.com/garmin/", Icon: InstagramIcon },
];

export function HomeFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.main}>
        <div className={styles.columns}>
          {footerColumns.map((column) => (
            <div className={styles.column} key={column.heading}>
              <h2>{column.heading}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}><a href={liveLinks[link.label] ?? link.href}>{link.label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.lower}>
          <a className={styles.location} href="https://www.garmin.com/en-US/select-a-location/"><GlobeIcon aria-hidden="true" /> United States</a>
          <div className={styles.socials}>
            {socials.map(({ label, href, Icon }) => <a key={label} href={href} aria-label={label}><Icon aria-hidden="true" /></a>)}
          </div>
        </div>
      </div>
      <div className={styles.legal}>
        <span>© Garmin Ltd. or its subsidiaries. All rights reserved.</span>
        <ul>{legalLinks.map((link) => <li key={link.label}><a href={liveLinks[link.label] ?? link.href}>{link.label}</a></li>)}</ul>
      </div>
    </footer>
  );
}
