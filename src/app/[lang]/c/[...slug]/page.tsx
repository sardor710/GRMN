// Query-only hrefs keep the current (locale-prefixed) path, so plain next/link is locale-safe for them; category
// links use the locale-aware Link.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link as LocaleLink } from "@/i18n/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WearablesHero } from "@/components/WearablesHero";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { SectionHeading } from "@/components/SectionHeading";
import { catalogues, getCatalogue, getCategoryName, getCategoryView, type CategoryView } from "@/lib/products";
import { readOr } from "@/server/public-input";
import { decodeRouteParam } from "@/lib/route-params";
import { readCatalogueCompareSearch } from "@/lib/compare/compare-items";
import { searchCompareProducts } from "@/lib/compare/search";
import { ROUTE_LOCALES, localizedSeo } from "@/i18n/seo";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export function generateStaticParams() {
  return catalogues.map((c) => ({ slug: c.slug.split("/") }));
}

const slugOf = (segments: string[]) => segments.map(decodeRouteParam).join("/");

export async function generateMetadata({ params }: PageProps<"/[lang]/c/[...slug]">): Promise<Metadata> {
  const t = await getMetaTranslations(params);
  const tc = await getTranslations();
  const locale = await initPageLocale(params);
  const slug = slugOf((await params).slug);
  const def = getCatalogue(slug);
  // Legacy catalogues are named by their message; taxonomy categories by their stored name.
  const name = def ? tc(def.titleKey) : await readOr(getCategoryName(slug), () => null);
  return {
    title: name ? t("catalogueTitle", { title: name }) : "Garmin",
    ...(name ? localizedSeo({ path: `/c/${slug}`, locale, indexedLocales: ROUTE_LOCALES.category }) : {}),
  };
}

function pageHref(query: SearchParams, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key !== "page" && key !== "cursor") for (const v of [value ?? []].flat()) next.append(key, v);
  if (page > 1) next.set("page", String(page));
  const text = next.toString();
  return text ? `?${text}` : "?";
}

async function Hero({ view }: { view: CategoryView }) {
  const t = await getTranslations();
  if (view.hero === "families") return <WearablesHero />;
  if (!view.hero) return null;
  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative aspect-[1440/380] w-full">
        <Image src={view.hero.image} alt={t(view.hero.blurbKey)} fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/25" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[13px] font-medium uppercase tracking-[0.1em] text-white/90">{t(view.hero.labelKey)}</span>
          <p className="g-heading mt-2 text-[38px] text-white lg:text-[46px]">{t(view.hero.blurbKey)}</p>
        </div>
      </div>
    </section>
  );
}

export default async function CataloguePage({ params, searchParams }: PageProps<"/[lang]/c/[...slug]">) {
  const locale = await initPageLocale(params);
  const t = await getTranslations();
  const tGrid = await getTranslations("CatalogueGrid");
  const tPage = await getTranslations("CataloguePage");
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const view = await readOr(getCategoryView(slugOf(slug), query, locale), () => null);
  if (!view) notFound();
  const title = view.headingKey ? t(view.headingKey) : view.name;

  const crumbs = view.path.slice(0, -1);
  const legacyNext = view.nextCursor ? (() => { const next = new URLSearchParams(); for (const [k, v] of Object.entries(query)) for (const x of [v ?? []].flat()) next.append(k, x); next.set("cursor", view.nextCursor!); return `?${next}`; })() : null;
  // Task C-c: the compare bar's product search, the same bounded search as the compare page's "+" tile.
  const compareText = readCatalogueCompareSearch(query);
  const compareSearch = compareText ? await searchCompareProducts(compareText, locale) : null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <Hero view={view} />

        <div className="px-4 py-10">
          {crumbs.length > 0 && (
            <nav aria-label={tPage("breadcrumb")} className="mb-4 flex flex-wrap items-center justify-center text-[14px] leading-[14px] text-garmin-text-muted">
              {crumbs.map((c, i) => (
                <span key={c.slug} className="flex items-center">
                  {i > 0 && <span aria-hidden="true" className="mx-2">/</span>}
                  <LocaleLink href={`/c/${c.slug}`} className="underline">{c.name}</LocaleLink>
                </span>
              ))}
            </nav>
          )}
          <SectionHeading size="h1">{title}</SectionHeading>
          {view.description && <p className="mx-auto mt-3 max-w-[760px] text-center text-[16px] leading-[24px] text-black">{view.description}</p>}
        </div>

        {view.categoryTotal === 0 && !view.nextCursor ? (
          <section className="mx-auto max-w-[760px] px-4 py-16 text-center">
            <p className="text-[18px] leading-[27px] text-black">{tPage("emptyCategory", { name: title })}</p>
            <p className="mt-2 text-[16px] leading-[24px] text-black">{tPage("emptyCategoryHint")}</p>
            <LocaleLink href="/c/wearables-smartwatches" className="g-btn g-btn--lg g-btn--black mt-6 inline-flex">{tPage("shopAllSmartwatches")}</LocaleLink>
          </section>
        ) : (
          <>
            <CatalogueGrid products={view.items} facets={view.facets} sort={view.sort} sortOptions={view.sortOptions} total={view.total} hasPreset={view.hasPreset} compareSearch={compareSearch} />
            {view.pageCount > 1 && (
              <nav aria-label={tPage("pagination")} className="mx-auto mt-10 flex max-w-[1400px] flex-wrap items-center justify-center gap-2 px-4">
                {view.page > 1 && <Link href={pageHref(query, view.page - 1)} className="g-btn g-btn--sm g-btn--secondary">{tPage("previousPage")}</Link>}
                {Array.from({ length: view.pageCount }, (_, i) => i + 1).map(n => (
                  <Link key={n} href={pageHref(query, n)} aria-current={n === view.page ? "page" : undefined}
                    className={`min-w-10 border-2 px-3 py-2 text-center text-[14px] leading-[21px] ${n === view.page ? "border-black bg-black text-white" : "border-garmin-option text-black hover:border-black"}`}>{n}</Link>
                ))}
                {view.page < view.pageCount && <Link href={pageHref(query, view.page + 1)} className="g-btn g-btn--sm g-btn--secondary">{tPage("nextPage")}</Link>}
              </nav>
            )}
            {legacyNext && <Link className="g-btn g-btn--sm g-btn--secondary mx-auto mt-8 flex w-fit" href={legacyNext}>{tGrid("nextProducts")}</Link>}
          </>
        )}
        <div className="h-16" />
      </main>
      <SiteFooter />
    </div>
  );
}
