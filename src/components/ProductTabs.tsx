"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductDetail } from "@/types";
import { ProductOverview } from "@/components/product/ProductOverview";
import { ProductAccessories } from "@/components/product/ProductAccessories";
import { CompatibleDevices } from "@/components/product/CompatibleDevices";
import { OverviewContent } from "@/components/product/OverviewContent";

const TABS = ["Overview", "Specs", "In the Box", "Accessories", "Maps", "Compatible Devices"] as const;
type Tab = (typeof TABS)[number];

/** `selectedVariantId`: the variant chosen in the buy box; the Accessories tab lists what fits it. */
export function ProductTabs({ product, selectedVariantId }: { product: ProductDetail; selectedVariantId?: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const accessories = product.commerce?.compatibleAccessories ?? [];
  const devices = product.commerce?.compatibleDevices ?? [];
  // Accessories and Compatible Devices come from product_compatibility; a tab without links is hidden.
  // An empty in-the-box list hides its tab (no preset contents, plan #7).
  const tabs = TABS.filter(t => (t !== "Accessories" || accessories.length > 0) && (t !== "Compatible Devices" || devices.length > 0) && (t !== "In the Box" || product.inTheBox.length > 0));
  const variantId = selectedVariantId ?? product.commerce?.selectedVariantId;

  const isRichOverview = tab === "Overview" && product.id === "1228429" && !product.overviewHtml;

  return (
    <section className="mt-8">
      {/* Tab bar */}
      <div className="sticky top-0 z-30 border-y border-neutral-200 bg-[#f2f2f2]">
        <div className="mx-auto flex max-w-[1280px] gap-8 overflow-x-auto px-4">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative whitespace-nowrap py-4 text-[14px] font-medium uppercase tracking-[0.06em] transition-colors ${
                tab === t ? "text-black" : "text-neutral-500 hover:text-black"
              }`}
            >
              {t}
              {tab === t && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black" />}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className={isRichOverview ? "w-full" : "mx-auto max-w-[1280px] px-4 py-12"}>
        {tab === "Overview" && (
          product.id === "1228429" && !product.overviewHtml ? (
            <ProductOverview product={product} />
          ) : product.overviewHtml ? (
            <div className="mx-auto max-w-[1080px] py-8">
              {/* overviewHtml is sanitized with an allowlist on import, on every admin save and on read */}
              <OverviewContent html={product.overviewHtml} />
            </div>
          ) : (
            <div className="mx-auto max-w-[1080px] py-8">
              <DefaultOverview product={product} />
            </div>
          )
        )}
        {tab === "Specs" && (
          <div className="mx-auto max-w-[1080px]">
            <Specs product={product} />
          </div>
        )}
        {tab === "In the Box" && (
          <div className="mx-auto max-w-[1080px]">
            <InTheBox product={product} />
          </div>
        )}
        {tab === "Accessories" && accessories.length > 0 && (
          <div className="mx-auto max-w-[1280px]">
            <ProductAccessories accessories={accessories} variantId={variantId} />
          </div>
        )}
        {tab === "Maps" && (
          <div className="mx-auto max-w-[1080px]">
            <Placeholder text="Preloaded TopoActive maps plus support for downloadable outdoor, cycling and ski maps." />
          </div>
        )}
        {tab === "Compatible Devices" && devices.length > 0 && (
          <div className="mx-auto max-w-[1080px]">
            <CompatibleDevices devices={devices} />
          </div>
        )}
      </div>
    </section>
  );
}

function DefaultOverview({ product }: { product: ProductDetail }) {
  return (
    <div className="space-y-16">
      {product.features.map((f, i) => (
        <div
          key={f.title}
          className={`flex flex-col items-center gap-8 md:flex-row ${
            i % 2 === 1 ? "md:flex-row-reverse" : ""
          }`}
        >
          {f.image ? (
            <div className="relative aspect-[4/3] w-full md:w-1/2">
              <Image src={f.image} alt={f.title} fill sizes="(max-width:768px) 100vw, 520px" className="object-cover" />
            </div>
          ) : (
            <div className="hidden md:block md:w-1/2" />
          )}
          <div className="w-full md:w-1/2">
            <h2 className="g-heading text-[28px] text-black">{f.title}</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-neutral-700">{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Specs({ product }: { product: ProductDetail }) {
  if (product.specGroups?.length) {
    // Grouped tables like garmin.com: a heading row per group, then label/value rows.
    return (
      <div>
        <h2 className="g-heading text-[32px] md:text-[38px] uppercase tracking-wide text-black">Specifications</h2>
        {product.specGroups.map((group, index) => (
          <table key={`${group.title}-${index}`} className="mt-8 w-full border-collapse text-left">
            {group.title && (
              <caption className="g-heading pb-3 text-left text-[20px] uppercase tracking-[0.04em] text-black">{group.title}</caption>
            )}
            <tbody className="border-t border-neutral-200">
              {group.items.map((s, i) => (
                <tr key={`${s.label}-${i}`} className="border-b border-neutral-200 align-top">
                  <th scope="row" className="w-1/2 py-3 pr-4 text-[15px] font-semibold text-black sm:w-1/3">{s.label}</th>
                  <td className="py-3 text-[15px] leading-relaxed text-neutral-700 sm:w-2/3">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    );
  }
  return (
    <div>
      <h2 className="g-heading text-[32px] md:text-[38px] uppercase tracking-wide text-black">Specifications</h2>
      <dl className="mt-6 divide-y divide-neutral-200 border-t border-neutral-200">
        {product.specs.map((s) => (
          <div key={s.label} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-[16px] font-semibold text-black sm:col-span-1">{s.label}</dt>
            <dd className="text-[16px] leading-relaxed text-neutral-700 sm:col-span-2">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InTheBox({ product }: { product: ProductDetail }) {
  const items = product.inTheBoxItems?.filter((item) => item.label.trim()) ?? [];
  if (items.some((item) => item.image)) {
    // Image tiles when the product (or its garmin.com import) has photos of the box contents.
    return (
      <div>
        <h2 className="g-heading text-[32px] md:text-[38px] uppercase tracking-wide text-black">In the Box</h2>
        <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="text-center">
              <div className="relative flex aspect-square items-center justify-center bg-white">
                {item.image ? (
                  <Image src={item.image} alt="" fill sizes="(max-width:640px) 45vw, (max-width:1024px) 30vw, 250px" className="object-contain" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-black" aria-hidden="true" />
                )}
              </div>
              <p className="mt-3 text-[15px] leading-snug text-neutral-700">{item.label}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div>
      <h2 className="g-heading text-[32px] md:text-[38px] uppercase tracking-wide text-black">In the Box</h2>
      <ul className="mt-6 space-y-3">
        {product.inTheBox.map((item) => (
          <li key={item} className="flex items-center gap-3 text-[16px] text-neutral-700">
            <span className="h-1.5 w-1.5 rounded-full bg-black" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <p className="text-[16px] leading-relaxed text-neutral-700">{text}</p>;
}
