import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool } from "@/components/CompareTool";

export const metadata: Metadata = {
  title: "Compare Smartwatches | Garmin",
};

export const dynamic="force-dynamic";
import {catalogueProducts,catalogues,getProductsByKeys} from "@/lib/products";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readOr } from "@/server/public-input";
export default async function ComparePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams,selected=[params.selected??[]].flat().slice(0,4),search=typeof params.search==="string"?params.search:undefined,cursor=typeof params.cursor==="string"?params.cursor:undefined;
  const page=await readOr(catalogueProducts(catalogues[0],{search,cursor}),notFound),chosen=await readOr(getProductsByKeys(selected),()=>[]);
  const next=new URLSearchParams();selected.forEach(id=>next.append("selected",id));if(search)next.set("search",search);if(page.nextCursor)next.set("cursor",page.nextCursor);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <form className="mx-auto max-w-md p-4"><label>Search watches<input name="search" defaultValue={search} className="m-2 border p-2" /></label>{selected.map(id=><input key={id} type="hidden" name="selected" value={id}/>)}<button className="g-btn">Search</button></form><CompareTool products={page.items} selectedProducts={chosen} />{page.nextCursor&&<Link className="block p-6 text-center underline" href={"?"+next}>Next models</Link>}
      </main>
      <SiteFooter />
    </div>
  );
}
