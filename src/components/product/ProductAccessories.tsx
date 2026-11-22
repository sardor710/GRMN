"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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

/**
 * garmin.com PDP "Accessories" tab for PostgreSQL products: a vertical category list (Apps, Service Plans, Bands,
 * … View All) beside a card grid. Only accessories that fit the currently selected variant are shown; the
 * per-variant mapping comes with the page data, so switching variants re-filters without a request.
 */
export function ProductAccessories({ accessories, variantId }: { accessories: readonly CompatibleAccessoryDTO[]; variantId?: string | null }) {
  const t = useTranslations("ProductAccessories");
  const locale = useAppLocale();
  const fitting = accessoriesForVariant(accessories, variantId);
  const tabs = accessoryTabs(fitting);
  const [chosen, setChosen] = useState<string | null>(null);
  const active = tabs.find(tab => tab.slug === chosen) ?? tabs[0];

  if (fitting.length === 0 || !active) {
    return (
      <div className="py-12 text-center">
        <p className="text-[16px] leading-[24px] text-black">{t("noneForModel")}</p>
        <p className="mt-1 text-[14px] leading-[21px] text-garmin-text-muted">{t("chooseAnotherModel")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <nav aria-label={t("categoriesLabel")} className="w-full shrink-0 md:w-[240px]">
        <ul className="flex flex-row flex-wrap gap-1 md:flex-col md:gap-0">
          {tabs.map(tab => (
            <li key={tab.slug}>
              <button type="button" aria-pressed={tab.slug === active.slug} onClick={() => setChosen(tab.slug)}
                className={`w-full px-4 py-3 text-left text-[14px] font-semibold uppercase leading-[21px] tracking-[0.28px] transition-colors ${tab.slug === active.slug ? "bg-black text-white" : "text-black hover:bg-[#f2f2f2]"}`}>
                {TAB_KEYS[tab.slug] ? t(`tabs.${TAB_KEYS[tab.slug]}`) : tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.items.map(item => {
          const href = `/p/${encodeURIComponent(item.publicKey)}${item.sku ? `?sku=${encodeURIComponent(item.sku)}` : ""}`;
          const soldOut = item.availability !== "available";
          return (
            <Link key={`${item.publicKey}:${item.sku ?? ""}`} href={href} className="group flex flex-col items-center bg-white px-4 pb-6 pt-4 text-center shadow-garmin-card">
              <div className="relative h-[130px] w-[130px]">
                {item.image && <Image src={item.image.url} alt={item.image.alt || item.name} fill sizes="130px" className="object-contain" />}
              </div>
              <h3 className="g-heading g-h4 mt-4 line-clamp-2 text-black group-hover:underline">{item.name}</h3>
              <div className="mt-2">
                <Price size="card" locale={locale} amount={{ minor: item.price.selling.amountMinor }} compareAt={item.price.compareAt ? { minor: item.price.compareAt.amountMinor } : null} />
              </div>
              {soldOut && <p className="mt-1 text-[14px] leading-[21px] text-garmin-text-muted">{t("outOfStock")}</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
