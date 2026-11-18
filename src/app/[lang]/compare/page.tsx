import type { Metadata } from "next";
// Query-only hrefs keep the current (locale-prefixed) path, so plain next/link is locale-safe here.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool } from "@/components/CompareTool";
import { catalogueProducts, catalogues, getProductsByKeys } from "@/lib/products";
import { readOr } from "@/server/public-input";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[lang]/compare">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getMetaTranslations(params);
  return {
    title: t("compareTitle"),
    ...localizedSeo({ path: "/compare", locale, indexedLocales: ROUTE_LOCALES.compare }),
  };
}

export default async function ComparePage({ params, searchParams }: PageProps<"/[lang]/compare">) {
  const locale = await initPageLocale(params);
  const tc = await getTranslations("Compare");
  const query = await searchParams;
  const selected = [query.selected ?? []].flat().slice(0, 4);
  const search = typeof query.search === "string" ? query.search : undefined;
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const page = await readOr(catalogueProducts(catalogues[0], { search, cursor }, locale), notFound);
  const chosen = await readOr(getProductsByKeys(selected, locale), () => []);
  const next = new URLSearchParams();
  selected.forEach((id) => next.append("selected", id));
  if (search) next.set("search", search);
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <form className="mx-auto max-w-md p-4">
          <label>
            {tc("searchLabel")}
            <input name="search" defaultValue={search} className="m-2 border p-2" />
          </label>
          {selected.map((id) => (
            <input key={id} type="hidden" name="selected" value={id} />
          ))}
          <button className="g-btn">{tc("searchButton")}</button>
        </form>
        <CompareTool products={page.items} selectedProducts={chosen} />
        {page.nextCursor && (
          <Link className="block p-6 text-center underline" href={"?" + next}>
            {tc("nextModels")}
          </Link>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
