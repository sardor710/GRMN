import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool, type CompareColumn } from "@/components/CompareTool";
import { catalogues } from "@/lib/products";
import { COMPARE_MAX_ITEMS, buildCompareRows, parseCompareItems, readCompareSearch, renderedQuery } from "@/lib/compare/compare-items";
import { getCompareItems, type CompareItem } from "@/lib/compare/server";
import { searchCompareProducts } from "@/lib/compare/search";
import { VARIANT_PARAM } from "@/lib/catalog/variant-selection";
import { cmsBackend } from "@/server/cms/source";
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
 * The Shop link for one column: the product page with the compared size selected. PostgreSQL product pages read
 * `?variant=<sku>`; the legacy JSON product page reads `?sku=<sku>`. A product without variants links plainly.
 */
function shopHref(item: Pick<CompareItem, "productId" | "sku" | "variants">, skuParam: string): string {
  const path = `/p/${encodeURIComponent(item.productId)}`;
  return item.variants.length ? `${path}?${new URLSearchParams({ [skuParam]: item.sku })}` : path;
}

/** A column for the client: the compare read without its spec content (the rows carry it), plus the Shop link. */
function toColumn(item: CompareItem, skuParam: string): CompareColumn {
  const { productId, sku, name, image, price, compareAt, unconverted, variants } = item;
  return { productId, sku, name, image, price, ...(compareAt ? { compareAt } : {}), ...(unconverted ? { unconverted } : {}), variants, href: shopHref(item, skuParam) };
}

export default async function ComparePage({ params, searchParams }: PageProps<"/[lang]/compare">) {
  const locale = await initPageLocale(params);
  const tc = await getTranslations("Compare");
  const query = await searchParams;
  // `item=<id>~<sku>` (repeated, max 5); old `selected=<id>` links keep working.
  const items = await getCompareItems(parseCompareItems(query), locale);
  const groups = buildCompareRows(items.map((item) => item.content), tc("specs"));
  const skuParam = cmsBackend() === "postgres" ? VARIANT_PARAM : "sku";
  const searchText = readCompareSearch(query);
  const search = searchText && items.length < COMPARE_MAX_ITEMS ? await searchCompareProducts(searchText, locale) : null;
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <CompareTool
          items={items.map((item) => toColumn(item, skuParam))}
          groups={groups}
          search={search}
          catalogueHref={CATALOGUE_HREF}
          renderedFor={renderedQuery(query)}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
