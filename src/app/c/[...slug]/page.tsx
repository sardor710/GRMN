import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WearablesHero } from "@/components/WearablesHero";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { catalogues, getCategoryView, type CategoryView } from "@/lib/products";
import { readOr } from "@/server/public-input";
import { decodeRouteParam } from "@/lib/route-params";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export function generateStaticParams() {
  return catalogues.map((c) => ({ slug: c.slug.split("/") }));
}

const slugOf = (segments: string[]) => segments.map(decodeRouteParam).join("/");

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const view = await readOr(getCategoryView(slugOf((await params).slug), {}), () => null);
  return { title: view ? `${view.name} | Garmin` : "Garmin" };
}

function pageHref(query: SearchParams, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key !== "page" && key !== "cursor") for (const v of [value ?? []].flat()) next.append(key, v);
  if (page > 1) next.set("page", String(page));
  const text = next.toString();
  return text ? `?${text}` : "?";
}

function Hero({ view }: { view: CategoryView }) {
  if (view.hero === "families") return <WearablesHero />;
  if (!view.hero) return null;
  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative aspect-[1440/380] w-full">
        <Image src={view.hero.image} alt={view.hero.blurb} fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/25" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[13px] font-medium uppercase tracking-[0.1em] text-white/90">{view.hero.label}</span>
          <p className="g-heading mt-2 text-[38px] text-white lg:text-[46px]">{view.hero.blurb}</p>
        </div>
      </div>
    </section>
  );
}

export default async function CataloguePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const view = await readOr(getCategoryView(slugOf(slug), query), () => null);
  if (!view) notFound();

  const crumbs = view.path.slice(0, -1);
  const legacyNext = view.nextCursor ? (() => { const next = new URLSearchParams(); for (const [k, v] of Object.entries(query)) for (const x of [v ?? []].flat()) next.append(k, x); next.set("cursor", view.nextCursor!); return `?${next}`; })() : null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <Hero view={view} />

        <div className="mx-auto max-w-[1400px] px-4 pb-8 pt-6">
          {crumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
              {crumbs.map((c, i) => (
                <span key={c.slug} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  <Link href={`/c/${c.slug}`} className="uppercase tracking-[0.04em] hover:text-black">{c.name}</Link>
                </span>
              ))}
            </nav>
          )}
          <h1 className="g-heading text-center text-[30px] uppercase tracking-[0.04em] text-black lg:text-[36px]">{view.name}</h1>
          {view.description && <p className="mx-auto mt-3 max-w-[760px] text-center text-[16px] text-neutral-700">{view.description}</p>}
        </div>

        {view.categoryTotal === 0 && !view.nextCursor ? (
          <section className="mx-auto max-w-[760px] px-4 py-16 text-center">
            <p className="text-[18px] text-black">There are no products in {view.name} yet.</p>
            <p className="mt-2 text-[15px] text-neutral-600">New products are added regularly. In the meantime, browse all smartwatches.</p>
            <Link href="/c/wearables-smartwatches" className="g-btn g-btn--solid mt-6 inline-flex">Shop all smartwatches</Link>
          </section>
        ) : (
          <>
            <CatalogueGrid products={view.items} facets={view.facets} sort={view.sort} sortOptions={view.sortOptions} total={view.total} hasPreset={view.hasPreset} />
            {view.pageCount > 1 && (
              <nav aria-label="Pagination" className="mx-auto mt-10 flex max-w-[1400px] items-center justify-center gap-2 px-4">
                {view.page > 1 && <Link href={pageHref(query, view.page - 1)} className="border border-neutral-300 px-4 py-2 text-[14px] hover:border-black">Previous</Link>}
                {Array.from({ length: view.pageCount }, (_, i) => i + 1).map(n => (
                  <Link key={n} href={pageHref(query, n)} aria-current={n === view.page ? "page" : undefined}
                    className={`min-w-10 border px-3 py-2 text-center text-[14px] ${n === view.page ? "border-black bg-black text-white" : "border-neutral-300 hover:border-black"}`}>{n}</Link>
                ))}
                {view.page < view.pageCount && <Link href={pageHref(query, view.page + 1)} className="border border-neutral-300 px-4 py-2 text-[14px] hover:border-black">Next</Link>}
              </nav>
            )}
            {legacyNext && <Link className="mx-auto block w-fit p-6 underline" href={legacyNext}>Next products</Link>}
          </>
        )}
        <div className="h-16" />
      </main>
      <SiteFooter />
    </div>
  );
}
