"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { productPath } from "@/lib/catalog/product-url";
import type { CompatibleAccessoryDTO } from "@/contracts/catalog-browse";
import { accessoriesForVariant, accessoryTabs, VIEW_ALL_TAB } from "@/lib/catalog-facets";
import { Price } from "@/components/ui/price";
import { useAppLocale } from "@/i18n/useAppLocale";

/** garmin.com accessory tab slugs and their `ProductAccessories.tabs.*` message keys; other groups show their own name. */
const TAB_KEYS: Record<string, string> = {
  apps: "apps",
  "subscription-plans": "servicePlans",
  bands: "bands",
  "dive-bands": "diveBands",
  "marq-straps-bracelets": "marqStraps",
  "cables-chargers": "cablesChargers",
  "sports-fitness/cycling-biking-accessories": "cycling",
  "heart-rate-monitors": "heartRateMonitors",
  sensors: "sensors",
  [VIEW_ALL_TAB]: "viewAll",
};

/** English names the seeded accessory groups start with (taxonomy-seed.ts / menu labels). */
const SEED_NAMES: Record<string, string> = {
  apps: "Apps", "subscription-plans": "Service Plans", bands: "Bands", "dive-bands": "Dive Bands", "marq-straps-bracelets": "MARQ Straps & Bracelets",
  "cables-chargers": "Cables & Chargers", "sports-fitness/cycling-biking-accessories": "Cycling Accessories", "heart-rate-monitors": "Heart Rate Monitors", sensors: "Sensors",
};

/**
 * garmin.com PDP "Accessories" tab for PostgreSQL products (re-checked on the fēnix 9 page, 2026-11-22): a side list of
 * groups (Apps, Service Plans, Bands, … View All) beside a grid. Until a group is chosen the grid shows one card per
 * group (image + name, like garmin.com); choosing a group shows its accessory cards. Only accessories that fit the
 * currently selected variant are shown; switching variants re-filters without a request.
 */
export function ProductAccessories({ accessories, variantId }: { accessories: readonly CompatibleAccessoryDTO[]; variantId?: string | null }) {
  const t = useTranslations("ProductAccessories");
  const locale = useAppLocale();
  const fitting = accessoriesForVariant(accessories, variantId);
  const tabs = accessoryTabs(fitting);
  const [chosen, setChosen] = useState<string | null>(null);
  const active = tabs.find(tab => tab.slug === chosen) ?? null;
  // The page's translation of a seeded group while the category keeps its original English name; once it is renamed
  // (or translated) in Admin ▸ Categories, the server's localized name is shown (owner 2026-11-22, rule C5).
  const label = (tab: { slug: string; label: string }) =>
    tab.slug === VIEW_ALL_TAB || (TAB_KEYS[tab.slug] && tab.label === SEED_NAMES[tab.slug]) ? t(`tabs.${TAB_KEYS[tab.slug]}`) : tab.label;

  if (fitting.length === 0 || tabs.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[16px] leading-[24px] text-black">{t("noneForModel")}</p>
        <p className="mt-1 text-[14px] leading-[21px] text-garmin-text-muted">{t("chooseAnotherModel")}</p>
      </div>
    );
  }

  // garmin.com card: raised shadow (two layers), 14px padding, 130px image, Oswald 20/25 name.
  const card = "group flex flex-col items-center bg-white p-[14px] pb-6 text-center shadow-garmin-raised hover:shadow-garmin-raised-hover";
  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <nav aria-label={t("categoriesLabel")} className="w-full shrink-0 md:w-[286px]">
        <ul className="flex flex-row flex-wrap gap-1 md:flex-col md:gap-0">
          {tabs.map(tab => (
            <li key={tab.slug}>
              <button type="button" aria-pressed={tab.slug === active?.slug} onClick={() => setChosen(tab.slug)}
                className={`w-full px-4 py-[9.75px] text-left text-[15px] font-medium leading-[22.5px] transition-colors md:pl-[37.5px] ${tab.slug === active?.slug ? "bg-black text-white" : "text-black hover:bg-[#f2f2f2]"}`}>
                {label(tab)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid flex-1 grid-cols-1 content-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {active === null
          ? tabs.filter(tab => tab.slug !== VIEW_ALL_TAB).map(tab => {
            const image = tab.items.find(item => item.image)?.image ?? null;
            return (
              <button key={tab.slug} type="button" data-group-card onClick={() => setChosen(tab.slug)} className={card}>
                <span className="relative block h-[130px] w-[130px]">
                  {image && <Image src={image.url} alt="" fill sizes="130px" className="object-contain" />}
                </span>
                <span className="g-heading g-h4 mt-4 text-black group-hover:underline">{label(tab)}</span>
              </button>
            );
          })
          : active.items.map(item => {
            const href = productPath(item.productCode, item.sku);
            const soldOut = item.availability !== "available";
            return (
              <Link key={`${item.publicKey}:${item.sku ?? ""}`} href={href} className={card}>
                <div className="relative h-[130px] w-[130px]">
                  {item.image && <Image src={item.image.url} alt={item.image.alt || item.name} fill sizes="130px" className="object-contain" />}
                </div>
                <h3 className="g-heading g-h4 mt-4 line-clamp-3 text-black group-hover:underline">{item.name}</h3>
                <div className="mt-auto pt-3 text-[14px] leading-[21px] text-black">
                  <Price size="inline" locale={locale} amount={{ minor: item.price.selling.amountMinor }} compareAt={item.price.compareAt ? { minor: item.price.compareAt.amountMinor } : null} />
                </div>
                {soldOut && <p className="mt-1 text-[14px] leading-[21px] text-garmin-text-muted">{t("outOfStock")}</p>}
              </Link>
            );
          })}
      </div>
    </div>
  );
}
