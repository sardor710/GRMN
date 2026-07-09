"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ProductDetail } from "@/types";
import { useCart } from "@/lib/cart";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

export function ProductTop({ product }: { product: ProductDetail }) {
  const [mainIdx, setMainIdx] = useState(0);
  const [caseSize, setCaseSize] = useState(product.defaultCaseSize);
  const [version, setVersion] = useState(product.defaultVersion);
  const [colorIdx, setColorIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const { add } = useCart();

  const handleAdd = () => {
    add({
      id: product.id,
      name: product.title,
      price: product.price,
      image: product.gallery[0]?.src,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
        {product.breadcrumb.map((b, i) => (
          <span key={b.label} className="flex items-center gap-2">
            {i > 0 && <span>/</span>}
            <Link href={b.href} className="uppercase tracking-[0.04em] hover:text-black">
              {b.label}
            </Link>
          </span>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <div className="flex gap-4">
          <div className="flex flex-col gap-2">
            <button
              aria-label="Previous"
              onClick={() => setMainIdx((i) => Math.max(0, i - 1))}
              className="grid h-8 place-items-center bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            >
              <ChevronLeftIcon className="h-4 w-4 rotate-90" />
            </button>
            {product.gallery.map((g, i) => (
              <button
                key={g.view}
                onClick={() => setMainIdx(i)}
                className={`relative h-16 w-16 border ${
                  i === mainIdx ? "border-black" : "border-neutral-200"
                }`}
              >
                <Image src={g.src} alt={g.view} fill sizes="64px" className="object-contain p-1" />
              </button>
            ))}
            <button
              aria-label="Next"
              onClick={() => setMainIdx((i) => Math.min(product.gallery.length - 1, i + 1))}
              className="grid h-8 place-items-center bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            >
              <ChevronRightIcon className="h-4 w-4 rotate-90" />
            </button>
          </div>
          <div className="relative flex-1">
            <div className="relative aspect-square w-full">
              <Image
                src={product.gallery[mainIdx].src}
                alt={product.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-contain"
              />
            </div>
          </div>
        </div>

        {/* Buy box */}
        <div>
          <h1 className="g-heading text-[32px] leading-tight text-black">{product.title}</h1>
          <p className="mt-2 text-[16px] text-neutral-700">{product.subtitle}</p>
          <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.06em] text-neutral-500">
            Part Number {product.partNumber}
          </p>

          {product.badge && (
            <span className="mt-4 inline-block bg-[#5bc2e7] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-white">
              {product.badge}
            </span>
          )}

          <p className="mt-4 text-[28px] font-medium text-black">
            ${product.price.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD
          </p>
          <p className="mt-2 text-[14px] text-neutral-600">
            Starting at $69/mo or 0% APR with <span className="font-semibold">affirm</span>.{" "}
            <a href="#" className="underline">See if you qualify</a>
          </p>
          <p className="mt-1 text-[14px] text-neutral-600">
            HSA/FSA eligible for qualified customers. <a href="#" className="underline">Learn more</a>
          </p>

          {/* Case size */}
          <Selector
            label="Case Size"
            options={product.caseSizes}
            value={caseSize}
            onChange={setCaseSize}
          />
          {/* Version */}
          <Selector
            label="Version"
            options={product.versions}
            value={version}
            onChange={setVersion}
          />

          {/* Model / Color */}
          <div className="mt-6">
            <p className="text-[14px] font-medium text-black">Model/Color</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.colors.map((c, i) => (
                <button
                  key={c.label}
                  aria-label={c.label}
                  onClick={() => {
                    setColorIdx(i);
                    setMainIdx(0);
                  }}
                  className={`relative h-16 w-16 border ${
                    i === colorIdx ? "border-2 border-black" : "border-neutral-200"
                  }`}
                >
                  <Image src={c.src} alt={c.label} fill sizes="64px" className="object-contain p-1" />
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-[14px] text-neutral-700">Available to ship in 1–3 business days.</p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleAdd}
              className="g-btn bg-[#5bc2e7] text-black transition-colors hover:bg-[#37b4dc]"
            >
              {added ? "Added ✓" : "Add to Cart"}
            </button>
            <button className="g-btn g-btn--outline-dark">Customize</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Selector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-6">
      <p className="text-[14px] font-medium text-black">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`border px-4 py-2 text-[13px] uppercase tracking-[0.04em] transition-colors ${
              o === value
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white text-black hover:border-black"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
