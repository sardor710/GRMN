"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ProductDetail } from "@/types";
import { ProductOverview } from "@/components/product/ProductOverview";
import { ProductAccessories } from "@/components/product/ProductAccessories";
import overviewStyles from "@/components/product/CmsOverview.module.css";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useProductVariant } from "@/components/product/ProductVariantContext";
import { ownsEmptyOverview, variantTabContent } from "@/lib/catalog/variant-selection";

/** Tab ids in garmin.com's order (ProductTabs.spec.md); labels are `ProductTabs.tabs.<id>` messages. */
const TABS = ["overview", "specs", "inTheBox", "maps", "accessories", "compatible"] as const;
type Tab = (typeof TABS)[number];


/** Tab label type (ProductTabs.spec.md): 14/21, 600, uppercase, .28px tracking. */
const tabType = "text-[14px] font-semibold uppercase leading-[21px] tracking-[0.28px] text-black";

export function ProductTabs({ product: base }: { product: ProductDetail }) {
  const t = useTranslations("ProductTabs");
  const [tab, setTab] = useState<Tab>("overview");
  // Below 1024 garmin.com closes the open accordion row when it is tapped again; the desktop bar always shows a tab.
  const [collapsed, setCollapsed] = useState(false);
  // The open tab's body is rendered exactly once: after its accordion row below 1024, in the desktop panel from 1024.
  // Mobile-first until hydrated (matches the server render); the lg: classes keep the right chrome visible meanwhile.
  const isDesktop = useMediaQuery("(min-width:1024px)");
  const openTab = (id: Tab) => { setTab(id); setCollapsed(false); };
  // Task 2.4: Specs, Overview and In the box follow the selected variant (the open tab stays open on a switch).
  const { selectedVariantId } = useProductVariant();
  const product = useMemo<ProductDetail>(() => {
    const content = variantTabContent(base, selectedVariantId);
    return { ...base, specs: content.specs, inTheBox: content.inTheBox, specGroups: content.specGroups, overviewHtml: content.overviewHtml };
  }, [base, selectedVariantId]);

  // Overviews imported with garmin.com's layout blocks (banners, sections) run edge to edge like garmin.com;
  // older imports are plain flowing HTML and keep the narrow reading column.
  const fullBleedHtml = /class="ov-(?:banner|section)/.test(product.overviewHtml || "");
  // A variant that owns an empty overview shows nothing (no fallback to the product's features).
  const emptyOverview = ownsEmptyOverview(product);
  const isRichOverview = tab === "overview" && !emptyOverview && ((product.id === "1228429" && !product.overviewHtml) || fullBleedHtml);

  const panelClass = isRichOverview ? "w-full" : "mx-auto w-full max-w-[1280px] px-4 py-12";
  const body = (
    <>
      {tab === "overview" && !emptyOverview && (
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
        <div className="mx-auto max-w-[711px]">
          <Specs product={product} />
        </div>
      )}
      {tab === "inTheBox" && (
        <div className="mx-auto max-w-[711px]">
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
    </>
  );

  return (
    <section className="mt-8">
      {/* Tab bar (≥1024): #E5E5E5, items centred, 4px black underline on the active and hovered tab; not sticky */}
      <nav data-product-tabs aria-label={t("label")} className="hidden bg-garmin-tab lg:block">
        <ul className="m-0 flex list-none justify-center px-14">
          {TABS.map((id) => (
            <li key={id} className="mx-4">
              <button
                type="button"
                aria-current={tab === id ? "true" : undefined}
                onClick={() => openTab(id)}
                className={`${tabType} whitespace-nowrap border-black px-[14px] py-7 transition-colors active:text-garmin-black-hover ${
                  tab === id ? "border-b-4" : "hover:border-b-4"
                }`}
              >
                {t(`tabs.${id}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {/* The desktop panel (≥1024) follows the tab bar. */}
      {isDesktop && <div id="product-tab-panel" className={panelClass}>{body}</div>}

      {/* Below 1024 every tab is an accordion row (50px, #DCDCDC rule, chevron). Final review M14 (WCAG 2.4.3): the
          open panel is rendered directly after its row in DOM order, so focus and reading order follow the layout. */}
      <div className="border-b border-[#DCDCDC] lg:hidden">
        {TABS.map((id) => {
          const open = tab === id && !collapsed;
          return (
            <Fragment key={id}>
              <button
                id={`product-tab-row-${id}`}
                type="button"
                aria-expanded={open}
                aria-controls={open && !isDesktop ? "product-tab-panel" : undefined}
                onClick={() => (open ? setCollapsed(true) : openTab(id))}
                className={`${tabType} flex h-[50px] w-full items-center justify-between border-t border-[#DCDCDC] px-7 py-[14px] text-left`}
              >
                {t(`tabs.${id}`)}
                <svg viewBox="0 0 18.2 11.2" aria-hidden="true" className={`h-[9px] w-[14px] shrink-0 fill-black ${open ? "rotate-180" : ""}`}>
                  <path d="M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z" />
                </svg>
              </button>
              {open && !isDesktop && <div id="product-tab-panel" role="region" aria-labelledby={`product-tab-row-${id}`} className={panelClass}>{body}</div>}
            </Fragment>
          );
        })}
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
            <h2 className="g-heading g-h2 text-black">{f.title}</h2>
            <p className="mt-4 text-[16px] leading-[24px] text-black">{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Specs table (ProductTabs.spec.md): one table per group, 50/50 columns, grey 12px uppercase labels, centred values. */
function SpecTable({ title, rows }: { title?: string; rows: { label: string; value: string }[] }) {
  return (
    <table className="mb-4 w-full table-fixed border-collapse text-[12px] leading-[18px]">
      {title && (
        <thead>
          <tr>
            <td colSpan={2} className="border-b border-[#DDDDDD] bg-white p-0">
              <h3 className="g-heading g-h4 m-0 mb-4 text-left text-black">{title}</h3>
            </td>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((s, i) => (
          <tr key={`${s.label}-${i}`}>
            <th scope="row" className="w-1/2 border-y border-garmin-control bg-[#F2F2F2] px-4 py-2 text-left font-bold uppercase tracking-[-0.2px] text-black">
              {s.label}
            </th>
            <td className="w-1/2 border-y border-garmin-control bg-white p-4 text-center font-light text-black">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Specs({ product }: { product: ProductDetail }) {
  const t = useTranslations("ProductTabs");
  return (
    <div>
      <h2 className="sr-only">{t("tabs.specs")}</h2>
      {product.specGroups?.length
        ? product.specGroups.map((group) => <SpecTable key={group.title} title={group.title} rows={group.items} />)
        : <SpecTable rows={product.specs} />}
    </div>
  );
}

function InTheBox({ product }: { product: ProductDetail }) {
  const t = useTranslations("ProductTabs");
  return (
    <div>
      <h2 className="sr-only">{t("tabs.inTheBox")}</h2>
      <ul className="m-0 list-disc space-y-2 pl-5 text-[16px] leading-[24px] text-black">
        {product.inTheBox.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <p className="text-[16px] leading-[24px] text-black">{text}</p>;
}
