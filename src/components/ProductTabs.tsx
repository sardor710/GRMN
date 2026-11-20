"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ProductDetail } from "@/types";
import { ProductOverview } from "@/components/product/ProductOverview";
import { ProductAccessories } from "@/components/product/ProductAccessories";
import overviewStyles from "@/components/product/CmsOverview.module.css";
import { useProductVariant } from "@/components/product/ProductVariantContext";
import { variantTabContent } from "@/lib/catalog/variant-selection";

/** Tab ids; labels are `ProductTabs.tabs.<id>` messages. */
const TABS = ["overview", "specs", "inTheBox", "accessories", "maps", "compatible"] as const;
type Tab = (typeof TABS)[number];

export function ProductTabs({ product: base }: { product: ProductDetail }) {
  const t = useTranslations("ProductTabs");
  const [tab, setTab] = useState<Tab>("overview");
  // Task 2.4: Specs, Overview and In the box follow the selected variant (the open tab stays open on a switch).
  const { selectedVariantId } = useProductVariant();
  const product = useMemo<ProductDetail>(() => {
    const content = variantTabContent(base, selectedVariantId);
    return { ...base, specs: content.specs, inTheBox: content.inTheBox, specGroups: content.specGroups, overviewHtml: content.overviewHtml };
  }, [base, selectedVariantId]);

  // Overviews imported with garmin.com's layout blocks (banners, sections) run edge to edge like garmin.com;
  // older imports are plain flowing HTML and keep the narrow reading column.
  const fullBleedHtml = /class="ov-(?:banner|section)/.test(product.overviewHtml || "");
  const isRichOverview = tab === "overview" && ((product.id === "1228429" && !product.overviewHtml) || fullBleedHtml);

  return (
    <section className="mt-8">
      {/* Tab bar — garmin.com: centered, #e5e5e5, 4px black underline on the active tab */}
      <div className="sticky top-0 z-30 bg-[#e5e5e5]">
        <div className="mx-auto flex max-w-[1280px] overflow-x-auto px-4 lg:justify-center">
          {TABS.map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`mx-4 whitespace-nowrap border-b-4 px-[14px] pb-6 pt-7 text-[14px] font-semibold uppercase leading-[21px] tracking-[0.28px] text-black transition-colors ${
                tab === id ? "border-black" : "border-transparent hover:border-neutral-400"
              }`}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className={isRichOverview ? "w-full" : "mx-auto max-w-[1280px] px-4 py-12"}>
        {tab === "overview" && (
          product.id === "1228429" && !product.overviewHtml ? (
            <ProductOverview product={product} />
          ) : fullBleedHtml ? (
            /* overviewHtml is sanitized with an allowlist on import and on every admin save */
            <div className={overviewStyles.overview} dangerouslySetInnerHTML={{ __html: product.overviewHtml || "" }} />
          ) : product.overviewHtml ? (
            <div className="mx-auto max-w-[1080px] py-8">
              {/* overviewHtml is sanitized with an allowlist on import and on every admin save */}
              <div className={overviewStyles.overview} dangerouslySetInnerHTML={{ __html: product.overviewHtml }} />
            </div>
          ) : (
            <div className="mx-auto max-w-[1080px] py-8">
              <DefaultOverview product={product} />
            </div>
          )
        )}
        {tab === "specs" && (
          <div className="mx-auto max-w-[1080px]">
            <Specs product={product} />
          </div>
        )}
        {tab === "inTheBox" && (
          <div className="mx-auto max-w-[1080px]">
            <InTheBox product={product} />
          </div>
        )}
        {tab === "accessories" && (
          <div className="mx-auto max-w-[1280px]">
            <ProductAccessories accessories={product.accessories} />
          </div>
        )}
        {tab === "maps" && (
          <div className="mx-auto max-w-[1080px]">
            <Placeholder text={t("mapsText")} />
          </div>
        )}
        {tab === "compatible" && (
          <div className="mx-auto max-w-[1080px]">
            <Placeholder text={t("compatibleText")} />
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
  const t = useTranslations("ProductTabs");
  if (product.specGroups?.length) {
    return (
      <div>
        <h2 className="g-heading text-[32px] md:text-[38px] uppercase tracking-wide text-black">{t("specifications")}</h2>
        {product.specGroups.map((group) => (
          <section key={group.title} className="mt-8">
            <h3 className="g-heading text-[20px] uppercase tracking-[0.04em] text-black">{group.title}</h3>
            <dl className="mt-3 divide-y divide-neutral-200 border-t border-neutral-200">
              {group.items.map((s, i) => (
                <div key={`${s.label}-${i}`} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3">
                  <dt className="text-[15px] font-semibold text-black sm:col-span-1">{s.label}</dt>
                  <dd className="text-[15px] leading-relaxed text-neutral-700 sm:col-span-2">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div>
      <h2 className="g-heading text-[32px] md:text-[38px] uppercase tracking-wide text-black">{t("specifications")}</h2>
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
  const t = useTranslations("ProductTabs");
  return (
    <div>
      <h2 className="g-heading text-[32px] md:text-[38px] uppercase tracking-wide text-black">{t("tabs.inTheBox")}</h2>
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
