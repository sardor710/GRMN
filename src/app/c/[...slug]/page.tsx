import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WearablesHero } from "@/components/WearablesHero";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { SectionHeading } from "@/components/SectionHeading";
import { catalogues, getCatalogue, catalogueProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return catalogues.map((c) => ({ slug: c.slug.split("/") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const def = getCatalogue(slug.join("/"));
  return { title: def ? `${def.title} | Garmin` : "Garmin" };
}

export default async function CataloguePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const def = getCatalogue(slug.join("/"));
  if (!def) notFound();

  const items = catalogueProducts(def);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        {def.showFamilies ? (
          <WearablesHero />
        ) : def.hero ? (
          <section className="relative w-full overflow-hidden">
            <div className="relative aspect-[1440/380] w-full">
              <Image src={def.hero.image} alt={def.hero.blurb} fill priority sizes="100vw" className="object-cover object-center" />
              <div className="absolute inset-0 bg-black/25" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[13px] font-medium uppercase tracking-[0.1em] text-white/90">
                  {def.hero.label}
                </span>
                <h1 className="g-heading mt-2 text-[38px] text-white lg:text-[46px]">{def.hero.blurb}</h1>
              </div>
            </div>
          </section>
        ) : null}

        <div className="py-10">
          <SectionHeading>{def.heading}</SectionHeading>
        </div>
        <CatalogueGrid products={items} />
        <div className="h-16" />
      </main>
      <SiteFooter />
    </div>
  );
}
