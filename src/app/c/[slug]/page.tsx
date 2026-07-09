import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WearablesHero } from "@/components/WearablesHero";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { SectionHeading } from "@/components/SectionHeading";
import { products, catalogueMeta } from "@/lib/products";

export function generateStaticParams() {
  return Object.keys(catalogueMeta).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = catalogueMeta[slug];
  return {
    title: meta ? `${meta.title} | Garmin` : "Garmin",
  };
}

export default async function CataloguePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = catalogueMeta[slug];
  if (!meta) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <WearablesHero />
        <div className="py-10">
          <SectionHeading>{meta.heading}</SectionHeading>
        </div>
        <CatalogueGrid products={products} />
        <div className="h-16" />
      </main>
      <SiteFooter />
    </div>
  );
}
