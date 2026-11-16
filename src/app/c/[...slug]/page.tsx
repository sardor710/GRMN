import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WearablesHero } from "@/components/WearablesHero";
import { CatalogueGrid } from "@/components/CatalogueGrid";
import { SectionHeading } from "@/components/SectionHeading";
import { catalogues, getCatalogue, catalogueProducts } from "@/lib/products";
import { readOr } from "@/server/public-input";

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
  params, searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const { slug } = await params;
  const def = getCatalogue(slug.join("/"));
  if (!def) notFound();

  const query=await searchParams,one=(k:string)=>typeof query[k]==="string"?query[k] as string:undefined,many=(k:string)=>[query[k]??[]].flat();
  const sorts={featured:"newest","price-asc":"price_asc","price-desc":"price_desc",name:"name_asc"} as const;
  const page = await readOr(catalogueProducts(def,{cursor:one("cursor"),search:one("search"),activities:many("activities"),levels:many("levels") as import("@/contracts/commerce").ProductQuery["levels"],caseSizes:many("caseSizes") as import("@/contracts/commerce").ProductQuery["caseSizes"],sort:sorts[(one("sort")??"featured") as keyof typeof sorts]??"name_asc"}), notFound);
  const next=new URLSearchParams();Object.entries(query).forEach(([key,value])=>[value??[]].flat().forEach(v=>next.append(key,v)));if(page.nextCursor)next.set("cursor",page.nextCursor);
  const items = page.items;

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
        {page.nextCursor&&<Link className="mx-auto block w-fit p-6 underline" href={"?"+next}>Next products</Link>}
        <div className="h-16" />
      </main>
      <SiteFooter />
    </div>
  );
}
