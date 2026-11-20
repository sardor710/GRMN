"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { AccessoryItem } from "@/types";
import { useCart } from "@/lib/cart";
import { Price } from "@/components/ui/price";
import { useAppLocale } from "@/i18n/useAppLocale";

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
      <div className="rounded border border-neutral-200 bg-neutral-50 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-[17px] font-bold text-black">{t("quickFitHeading")}</h3>
            <p className="mt-1 text-[14px] text-neutral-600">
              {t.rich("quickFitBody", { b: (chunks) => <strong>{chunks}</strong> })}
            </p>
          </div>
          <span className="shrink-0 self-start rounded bg-black px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-white md:self-center">
            {t("toolFree")}
          </span>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-full px-4 py-2 text-[13px] font-medium tracking-wide transition-all ${
              selectedCategory === cat
                ? "bg-black text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:border-black hover:text-black"
            }`}
          >
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Accessories Grid */}
      {filteredAccessories.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">{t("empty")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAccessories.map((acc) => (
            <div
              key={acc.id}
              className="group flex flex-col justify-between rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-all hover:border-black hover:shadow-md"
            >
              <div>
                <div className="relative aspect-square w-full overflow-hidden rounded bg-neutral-50 p-2">
                  <Image
                    src={acc.image}
                    alt={acc.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-contain p-2"
                  />
                  {acc.badge && (
                    <span className="absolute left-2 top-2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      {acc.badge}
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    {categoryLabel(acc.category)}
                  </span>
                  <h4 className="mt-1 line-clamp-2 text-[15px] font-bold leading-tight text-black">
                    {acc.name}
                  </h4>
                  <p className="mt-1 text-[12px] text-neutral-500">{t("partNumber", { partNumber: acc.partNumber })}</p>
                  {acc.description && (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-neutral-600">
                      {acc.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-neutral-100 pt-4">
                <div className="flex items-baseline justify-between">
                  <Price className="text-[18px] font-bold text-black" locale={locale} amount={{ major: acc.price }} unconverted={acc.currency === "USD"} />
                  <span className="text-[12px] text-neutral-500">{t("currency")}</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddToCart(acc)}
                  className={`mt-3 w-full rounded py-2.5 text-[13px] font-semibold uppercase tracking-wider transition-colors ${
                    addedId === acc.id
                      ? "bg-green-600 text-white"
                      : "bg-black text-white hover:bg-neutral-800"
                  }`}
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
