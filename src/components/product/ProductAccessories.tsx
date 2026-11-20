"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { AccessoryItem } from "@/types";
import { useCart } from "@/lib/cart";
import { Price } from "@/components/ui/price";
import { useAppLocale } from "@/i18n/useAppLocale";
import { GarminBadge } from "@/components/GarminBadge";

/** Accessory categories (data values) and their `ProductAccessories.categories.*` message keys. */
const CATEGORY_KEYS: Record<string, string> = {
  All: "all",
  "Bands & Straps": "bands",
  "Heart Rate & Sensors": "sensors",
  "Cables & Power": "power",
  "Mounts & Protection": "protection",
  "Satellite & Navigation": "navigation",
};

const CATEGORIES = ["All", "Bands & Straps", "Heart Rate & Sensors", "Cables & Power", "Satellite & Navigation"] as const;

export function ProductAccessories({ accessories = [] }: { accessories?: AccessoryItem[] }) {
  const t = useTranslations("ProductAccessories");
  const locale = useAppLocale();
  const categoryLabel = (category: string) => (CATEGORY_KEYS[category] ? t(`categories.${CATEGORY_KEYS[category]}`) : category);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [addedId, setAddedId] = useState<string | null>(null);
  const { add } = useCart();

  const filteredAccessories =
    selectedCategory === "All"
      ? accessories
      : accessories.filter((acc) => acc.category === selectedCategory);

  const handleAddToCart = (acc: AccessoryItem) => {
    add({
      id: acc.id,
      name: acc.name,
      price: acc.price,
      image: acc.image,
      ...(acc.currency === "USD" ? { unconverted: true } : {}),
    });
    setAddedId(acc.id);
    setTimeout(() => setAddedId(null), 2000);
  };

  return (
    <div className="space-y-10">
      {/* QuickFit Compatibility Notice */}
      <div className="bg-muted p-6">
        <h3 className="g-heading g-h4 m-0 text-black">{t("quickFitHeading")}</h3>
        <p className="mt-2 text-[16px] leading-[24px] text-black">
          {t.rich("quickFitBody", { b: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      {/* Category filter: garmin.com option buttons (2px #CCC, black when chosen) */}
      <div className="flex flex-wrap gap-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            className={`h-[39px] border-2 px-[17.5px] py-[7px] text-[14px] leading-[21px] transition-colors ${
              selectedCategory === cat
                ? "border-black bg-black text-white"
                : "border-garmin-option bg-white text-black hover:border-black"
            }`}
          >
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Accessories Grid */}
      {filteredAccessories.length === 0 ? (
        <div className="py-12 text-center text-[16px] leading-[24px] text-black">{t("empty")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAccessories.map((acc) => (
            <div
              key={acc.id}
              className="flex flex-col justify-between bg-white px-4 pb-6 pt-4 shadow-garmin-card"
            >
              <div>
                <div className="relative aspect-square w-full overflow-hidden">
                  <Image
                    src={acc.image}
                    alt={acc.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-contain mix-blend-multiply"
                  />
                  {acc.badge && <GarminBadge badge={acc.badge} variant="ribbon" className="left-0 top-0" />}
                </div>

                <div className="mt-4">
                  <span className="text-[14px] leading-[21px] text-garmin-text-muted">
                    {categoryLabel(acc.category)}
                  </span>
                  <h4 className="g-heading g-h4 mt-2 line-clamp-2 text-black">
                    {acc.name}
                  </h4>
                  <p className="mt-2 text-[14px] leading-[21px] text-black">{t("partNumber", { partNumber: acc.partNumber })}</p>
                  {acc.description && (
                    <p className="mt-2 line-clamp-2 text-[14px] leading-[21px] text-garmin-card-text">
                      {acc.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <Price size="card" locale={locale} amount={{ major: acc.price }} unconverted={acc.currency === "USD"} />

                <button
                  type="button"
                  onClick={() => handleAddToCart(acc)}
                  className="g-btn g-btn--black mt-4 w-full"
                >
                  {addedId === acc.id ? t("added") : t("addToCart")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
