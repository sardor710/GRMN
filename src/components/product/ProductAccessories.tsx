"use client";

import { useState } from "react";
import Image from "next/image";
import type { AccessoryItem } from "@/types";
import { useCart } from "@/lib/cart";

const CATEGORIES = [
  "All",
  "Bands & Straps",
  "Heart Rate & Sensors",
  "Cables & Power",
  "Satellite & Navigation",
] as const;

export function ProductAccessories({ accessories = [] }: { accessories?: AccessoryItem[] }) {
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
            <h3 className="text-[17px] font-bold text-black">QuickFit® Watch Band Compatibility</h3>
            <p className="mt-1 text-[14px] text-neutral-600">
              The fēnix® 8 series supports QuickFit bands: <strong>20 mm</strong> for 43 mm models,{" "}
              <strong>22 mm</strong> for 47 mm models, and <strong>26 mm</strong> for 51 mm models. Swap in seconds
              with no tools required.
            </p>
          </div>
          <span className="shrink-0 self-start rounded bg-black px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-white md:self-center">
            Tool-Free Swap
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
            {cat}
          </button>
        ))}
      </div>

      {/* Accessories Grid */}
      {filteredAccessories.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">No accessories found in this category.</div>
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
                    {acc.category}
                  </span>
                  <h4 className="mt-1 line-clamp-2 text-[15px] font-bold leading-tight text-black">
                    {acc.name}
                  </h4>
                  <p className="mt-1 text-[12px] text-neutral-500">Part Number {acc.partNumber}</p>
                  {acc.description && (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-neutral-600">
                      {acc.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-neutral-100 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[18px] font-bold text-black">${acc.price.toFixed(2)}</span>
                  <span className="text-[12px] text-neutral-500">USD</span>
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
                  {addedId === acc.id ? "Added to Cart ✓" : "Add to Cart"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
