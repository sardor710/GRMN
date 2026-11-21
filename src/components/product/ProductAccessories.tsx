"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { CompatibleAccessoryDTO } from "@/contracts/catalog-browse";
import { accessoriesForVariant, accessoryTabs } from "@/lib/catalog-facets";
import { catalogPriceLabel } from "@/lib/public-catalog";

/**
 * garmin.com PDP "Accessories" tab: a vertical category list (Apps, Service Plans, Bands, … View All) beside a
 * card grid. Only accessories that fit the currently selected variant are shown; the per-variant mapping comes
 * with the page data, so switching variants re-filters without a request.
 */
export function ProductAccessories({ accessories, variantId }: { accessories: readonly CompatibleAccessoryDTO[]; variantId?: string | null }) {
  const fitting = accessoriesForVariant(accessories, variantId);
  const tabs = accessoryTabs(fitting);
  const [chosen, setChosen] = useState<string | null>(null);
  const active = tabs.find(tab => tab.slug === chosen) ?? tabs[0];

  if (fitting.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[16px] text-black">No accessories are listed for this model yet.</p>
        <p className="mt-1 text-[14px] text-neutral-600">Choose another size or version to see the accessories that fit it.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <nav aria-label="Accessory categories" className="w-full shrink-0 md:w-[240px]">
        <ul className="flex flex-row flex-wrap gap-1 md:flex-col md:gap-0">
          {tabs.map(tab => (
            <li key={tab.slug}>
              <button type="button" aria-pressed={tab.slug === active.slug} onClick={() => setChosen(tab.slug)}
                className={`w-full px-4 py-3 text-left text-[14px] font-medium uppercase tracking-[0.04em] transition-colors ${tab.slug === active.slug ? "bg-black text-white" : "text-black hover:bg-neutral-100"}`}>
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {active.items.map(item => {
          const href = `/p/${encodeURIComponent(item.publicKey)}${item.sku ? `?sku=${encodeURIComponent(item.sku)}` : ""}`;
          const soldOut = item.availability !== "available";
          return (
            <Link key={`${item.publicKey}:${item.sku ?? ""}`} href={href} className="group flex flex-col items-center border border-neutral-200 bg-white p-6 text-center transition-shadow hover:shadow-lg">
              <div className="relative h-[130px] w-[130px]">
                {item.image && <Image src={item.image.url} alt={item.image.alt || item.name} fill sizes="130px" className="object-contain" />}
              </div>
              <h3 className="g-heading mt-4 text-[18px] leading-tight text-black">{item.name}</h3>
              <p className="mt-2 text-[15px] font-medium text-black">{catalogPriceLabel(item.price, "KZT")}</p>
              {soldOut && <p className="mt-1 text-[13px] font-medium text-[#5b5b5b]">Out of stock</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
