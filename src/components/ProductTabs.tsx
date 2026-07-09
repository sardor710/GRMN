"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductDetail } from "@/types";

const TABS = ["Overview", "Specs", "In the Box", "Maps", "Compatible Devices"] as const;
type Tab = (typeof TABS)[number];

export function ProductTabs({ product }: { product: ProductDetail }) {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <section className="mt-8">
      {/* Tab bar */}
      <div className="sticky top-0 z-30 border-y border-neutral-200 bg-[#f2f2f2]">
        <div className="mx-auto flex max-w-[1280px] gap-8 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative whitespace-nowrap py-4 text-[14px] font-medium uppercase tracking-[0.06em] transition-colors ${
                tab === t ? "text-black" : "text-neutral-500 hover:text-black"
              }`}
            >
              {t}
              {tab === t && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black" />}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 py-12">
        {tab === "Overview" && <Overview product={product} />}
        {tab === "Specs" && <Specs product={product} />}
        {tab === "In the Box" && <InTheBox product={product} />}
        {tab === "Maps" && (
          <Placeholder text="Preloaded TopoActive maps plus support for downloadable outdoor, cycling and ski maps." />
        )}
        {tab === "Compatible Devices" && (
          <Placeholder text="Compatible with the Garmin Connect™ app and Connect IQ™ store on iPhone® and Android™ devices." />
        )}
      </div>
    </section>
  );
}

function Overview({ product }: { product: ProductDetail }) {
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
            <h2 className="g-heading text-[28px] text-black">{f.title}</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-neutral-700">{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Specs({ product }: { product: ProductDetail }) {
  return (
    <div>
      <h2 className="g-heading text-[26px] text-black">Specifications</h2>
      <dl className="mt-6 divide-y divide-neutral-200 border-t border-neutral-200">
        {product.specs.map((s) => (
          <div key={s.label} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-3">
            <dt className="text-[15px] font-medium text-black sm:col-span-1">{s.label}</dt>
            <dd className="text-[15px] text-neutral-700 sm:col-span-2">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InTheBox({ product }: { product: ProductDetail }) {
  return (
    <div>
      <h2 className="g-heading text-[26px] text-black">In the Box</h2>
      <ul className="mt-6 space-y-3">
        {product.inTheBox.map((item) => (
          <li key={item} className="flex items-center gap-3 text-[16px] text-neutral-700">
            <span className="h-1.5 w-1.5 rounded-full bg-black" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <p className="text-[16px] leading-relaxed text-neutral-700">{text}</p>;
}
