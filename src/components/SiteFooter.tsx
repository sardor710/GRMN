import { footerColumns, legalLinks } from "@/lib/content";
import {
  GlobeIcon,
  FacebookIcon,
  XIcon,
  YouTubeIcon,
  PinterestIcon,
  InstagramIcon,
} from "@/components/icons";

const socials = [
  { label: "Facebook", Icon: FacebookIcon },
  { label: "X", Icon: XIcon },
  { label: "YouTube", Icon: YouTubeIcon },
  { label: "Pinterest", Icon: PinterestIcon },
  { label: "Instagram", Icon: InstagramIcon },
];

export function SiteFooter() {
  return (
    <footer className="bg-black text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-12">
        {/* Link columns */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerColumns.map((col) => (
            <div key={col.heading}>
              <h3 className="g-heading mb-4 text-[15px] tracking-[0.06em] text-white">
                {col.heading}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[13px] text-neutral-300 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Locale + socials */}
        <div className="mt-12 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <button className="flex items-center gap-2 text-[13px] font-medium text-white">
            <GlobeIcon className="h-4 w-4" />
            United States
          </button>
          <div className="flex items-center gap-5">
            {socials.map(({ label, Icon }) => (
              <a key={label} href="#" aria-label={label} className="text-white transition-opacity hover:opacity-70">
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Legal bar */}
      <div className="border-t border-white/20">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-5 text-[12px] text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© Garmin Ltd. or its subsidiaries. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
