import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool, type CompareColumn } from "@/components/CompareTool";
import { catalogues } from "@/lib/products";
import { COMPARE_MAX_ITEMS, buildCompareRows, parseCompareItems, readCompareSearch, renderedQuery } from "@/lib/compare/compare-items";
import { getCompareItems, type CompareItem } from "@/lib/compare/server";
import { searchCompareProducts } from "@/lib/compare/search";
import { productPath } from "@/lib/catalog/product-url";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export const dynamic = "force-dynamic";

const CATALOGUE_HREF = `/c/${catalogues[0].slug}`;

export async function generateMetadata({ params }: PageProps<"/[lang]/compare">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getMetaTranslations(params);
  // Canonical is always /compare: the compared items never make a separate indexable page.
  return {
    title: t("compareTitle"),
    ...localizedSeo({ path: "/compare", locale, indexedLocales: ROUTE_LOCALES.compare }),
  };
}

/**
 * The Shop link for one column: the compared variant's own page /p/{code}/{sku} (owner 2026-11-23), or the product
 * page for a product without variants and for legacy JSON products.
 */
function shopHref(item: Pick<CompareItem, "productId" | "productCode" | "sku" | "variants">): string {
  return item.productCode ? productPath(item.productCode, item.variants.length ? item.sku : null) : productPath(item.productId);
}

/** A column for the client: the compare read without its spec content (the rows carry it), plus the Shop link. */
function toColumn(item: CompareItem): CompareColumn {
  const { productId, sku, name, image, price, compareAt, unconverted, variants } = item;
  return { productId, sku, name, image, price, ...(compareAt ? { compareAt } : {}), ...(unconverted ? { unconverted } : {}), variants, href: shopHref(item) };
}

export default async function ComparePage({ params, searchParams }: PageProps<"/[lang]/compare">) {
  const locale = await initPageLocale(params);
  const tc = await getTranslations("Compare");
  const query = await searchParams;
  // `item=<id>~<sku>` (repeated, max 5); old `selected=<id>` links keep working.
  // Products whose read failed are passed on, so the stored selection keeps them (they are not gone).
  const { items, unavailable } = await getCompareItems(parseCompareItems(query), locale);
  const groups = buildCompareRows(items.map((item) => item.content), tc("specs"));
  const searchText = readCompareSearch(query);
  const search = searchText && items.length < COMPARE_MAX_ITEMS ? await searchCompareProducts(searchText, locale) : null;
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <CompareTool
          items={items.map((item) => toColumn(item))}
          groups={groups}
          search={search}
          catalogueHref={CATALOGUE_HREF}
          renderedFor={renderedQuery(query)}
          unavailable={unavailable}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
