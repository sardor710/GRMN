"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {minorToMajor,catalogPriceLabel} from "@/lib/public-catalog";
import type { ProductDetail } from "@/types";
import { useCart } from "@/lib/cart";
import { CartRequestError, createCartClient } from "@/lib/cart-client";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { GarminBadge } from "@/components/GarminBadge";
import { VariantPicker } from "@/components/product/VariantPicker";
import { isPurchasable, selectValue } from "@/lib/cms/product-variants";
import { CommerceVariantPicker } from "@/components/product/CommerceVariantPicker";
import { chooseOptionValue, initialVariantId, isAvailable, optionValueStates, stockStateText } from "@/lib/variant-availability";

// Same price format the storefront used before variants (site-wide currency display is a separate follow-up).
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;

/**
 * `selectedVariantId` / `onSelectVariant` let the page share the chosen variant with the tabs (Accessories);
 * without them the buy box keeps its own selection.
 */
export function ProductTop({ product:initial, selectedVariantId, onSelectVariant }: { product: ProductDetail; selectedVariantId?: string; onSelectVariant?: (variantId: string) => void }) {
  const commerce=initial.commerce;
  // M4.5: open on the default variant only when it is in stock, else on the first in-stock variant.
  const [localVariantId,setLocalVariantId]=useState(()=>commerce?initialVariantId(commerce.variants,{defaultId:commerce.selectedVariantId??commerce.defaultVariantId})??"":"");
  const variantId=selectedVariantId??localVariantId;
  const setVariantId=(id:string)=>{setLocalVariantId(id);onSelectVariant?.(id);};
  const variant=commerce?.variants.find(v=>v.id===variantId);
  const product:ProductDetail=variant?{...initial,price:minorToMajor(variant.price.selling.amountMinor),priceLabel:catalogPriceLabel(variant.price,"KZT"),partNumber:variant.sku,gallery:(variant.gallery??[]).map(m=>({view:m.alt||variant.name,src:m.url}))}:initial;
  const [mainIdx, setMainIdx] = useState(0);
  const [caseSize, setCaseSize] = useState(product.defaultCaseSize);
  const [version, setVersion] = useState(product.defaultVersion);
  const [colorIdx, setColorIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const { add, mode } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  const [wish, setWish] = useState<"idle" | "saving" | "saved">("idle");

  // ---- legacy CMS variant model (JSON CMS products with options) ----
  const vm = product.variantModel;
  const defaultCmsVariant = vm ? vm.variants.find((v) => v.isDefault) || vm.variants[0] : undefined;
  const [cmsVariantId, setCmsVariantId] = useState(defaultCmsVariant?.id);
  const cmsVariant = vm?.variants.find((v) => v.id === cmsVariantId) || defaultCmsVariant;

  // Postgres products: the ?sku= deep link is resolved on the server (ProductView); a choice updates the URL.
  const chooseCommerceVariant = (id: string) => {
    const next = commerce?.variants.find(v => v.id === id);
    if (!next) return;
    setVariantId(next.id);
    setMainIdx(0);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("sku", next.sku);
      window.history.replaceState(null, "", url);
    }
  };

  // Deep link: /p/<id>?sku=<variant sku>
  useEffect(() => {
    if (!vm) return;
    const sku = new URLSearchParams(window.location.search).get("sku");
    // Only active variants are reachable by link (drafts/archived are not for sale).
    const match = sku
      ? vm.variants.find((v) => v.status === "active" && v.sku.toLowerCase() === sku.toLowerCase())
      : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL after hydration
    if (match) setCmsVariantId(match.id);
  }, [vm]);

  // Plain derivation (the React Compiler memoizes it); a manual useMemo could not be preserved once the
  // commerce variant helpers receive the product's nested data.
  const gallery = (() => {
    if (!vm || !cmsVariant) return product.gallery;
    const byId = new Map(vm.images.map((img) => [img.id, img]));
    const own = cmsVariant.imageIds.map((id) => byId.get(id)).filter((img): img is NonNullable<typeof img> => Boolean(img));
    return own.length ? own.map((img, i) => ({ view: `${img.alt || product.title} ${i + 1}`, src: img.src })) : product.gallery;
  })();
  const safeIdx = Math.max(0, Math.min(mainIdx, gallery.length - 1));

  const chooseValue = (optionId: string, valueId: string) => {
    if (!vm) return;
    const next = selectValue(vm.variants, cmsVariant?.selections || {}, optionId, valueId);
    if (!next) return;
    setCmsVariantId(next.id);
    setMainIdx(0);
    const url = new URL(window.location.href);
    url.searchParams.set("sku", next.sku);
    window.history.replaceState(null, "", url);
  };

  const price = cmsVariant?.price ?? product.price;
  const compareAt = cmsVariant?.originalPrice;
  const partNumber = cmsVariant?.sku || product.partNumber;

  // Server cart (Task 13A): the selected variant's real availability decides; the server prices it.
  // In the browser-only cart a JSON CMS variant must be active and in stock.
  const serverCart = mode === "server" && !!initial.commerce;
  // Add to cart is disabled only when the selected variant has no free stock (or the browser-only cart cannot sell it).
  const sellable = serverCart ? isAvailable(variant) : !initial.commerce && product.purchasable !== false && isPurchasable(cmsVariant);
  const addLabel = !sellable
    ? (serverCart && variant?.availability === "out_of_stock") || (!serverCart && cmsVariant && !isPurchasable(cmsVariant)) ? "Out of stock" : "Purchasing unavailable"
    : added ? "Added ✓" : "Add to Cart";
  const handleAdd = async () => {
    if(!sellable||(!serverCart&&typeof price!=="number"))return;
    setNotice(null);
    try {
      await add({
        id: product.id,
        name: product.title,
        price: typeof price === "number" ? price : 0,
        image: gallery[0]?.src,
        ...(variant ? { variantId: variant.id } : {}),
        ...(cmsVariant ? { sku: cmsVariant.sku, variantLabel: cmsVariant.title } : {}),
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : "This item could not be added"); return; }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };
  const handleWishlist = async () => {
    setWish("saving"); setNotice(null);
    try { await createCartClient((url, init) => fetch(url, { ...init, credentials: "same-origin" })).saveToWishlist(product.id); setWish("saved"); }
    catch (error) {
      setWish("idle");
      setNotice(error instanceof CartRequestError && error.status === 401 ? "Sign in to save items to your wishlist." : error instanceof Error ? error.message : "This item could not be saved");
    }
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
            {/* Imported galleries can hold hundreds of images: the thumbnail strip scrolls. */}
            <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto">
            {gallery.map((g, i) => (
              <button
                key={`${g.view}-${i}`}
                onClick={() => setMainIdx(i)}
                className={`relative h-16 w-16 shrink-0 border ${
                  i === safeIdx ? "border-black" : "border-neutral-200"
                }`}
              >
                <Image src={g.src} alt={g.view} fill sizes="64px" unoptimized={g.src.startsWith("http")} className="object-contain p-1" />
              </button>
            ))}
            </div>
            <button
              aria-label="Next"
              onClick={() => setMainIdx((i) => Math.min(gallery.length - 1, i + 1))}
              className="grid h-8 place-items-center bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            >
              <ChevronRightIcon className="h-4 w-4 rotate-90" />
            </button>
          </div>
          <div className="relative flex-1">
            <div className="relative aspect-square w-full">
              {gallery[safeIdx]&&<Image
                src={gallery[safeIdx].src}
                alt={product.title}
                fill
                priority
                unoptimized={gallery[safeIdx].src.startsWith("http")}
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-contain"
              />}
            </div>
          </div>
        </div>

        {/* Buy box */}
        <div>
          <h1 className="g-heading text-[32px] leading-tight text-black">{product.title}</h1>
          <p className="mt-2 text-[16px] text-neutral-700">{product.subtitle}</p>
          <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.06em] text-neutral-500">
            Part Number {partNumber}
          </p>

          {product.badge && product.badge !== "NONE" && (
            <div className="mt-3">
              <GarminBadge badge={product.badge} variant="pill" />
            </div>
          )}

          {cmsVariant && <p className="mt-1 text-[14px] text-neutral-700">{cmsVariant.title}</p>}

          <p className="mt-4 text-[28px] font-medium text-black">
            {product.priceLabel ?? (typeof price === "number" ? money(price) : price)}
            {typeof price === "number" && compareAt !== undefined && compareAt > price && (
              <span className="ml-3 align-middle text-[18px] font-normal text-neutral-500 line-through">{money(compareAt)}</span>
            )}
          </p>
          {product.currency!=="KZT"&&<><p className="mt-2 text-[14px] text-neutral-600">
            Starting at $69/mo or 0% APR with <span className="font-semibold">affirm</span>.{" "}
            <a href="#" className="underline">See if you qualify</a>
          </p>
          <p className="mt-1 text-[14px] text-neutral-600">
            HSA/FSA eligible for qualified customers. <a href="#" className="underline">Learn more</a>
          </p>

          </>}
          {commerce&&commerce.options?.length?<>
            <CommerceVariantPicker groups={optionValueStates(commerce.options,commerce.variants,variant)} onSelect={(key,label)=>{const next=chooseOptionValue(commerce.variants,variant,key,label);if(next)chooseCommerceVariant(next.id);}} />
            <p role="status" className={`mt-6 text-[14px] font-medium ${isAvailable(variant)?"text-black":"text-[#5b5b5b]"}`}>{stockStateText(variant?.availability)}</p>
          </>:commerce&&commerce.variants.length>1?<label className="mt-6 block">Variant<select aria-label="Variant" value={variantId} onChange={e=>chooseCommerceVariant(e.target.value)} className="mt-2 block w-full border p-3">{commerce.variants.map(v=><option key={v.id} value={v.id}>{v.name||v.sku} {Object.values(v.options).join(" / ")}{isAvailable(v)?"":" (out of stock)"}</option>)}</select><span>{stockStateText(variant?.availability)}</span></label>
          // A single-SKU product has nothing to choose: show only its stock state.
          :commerce&&<p role="status" className={`mt-6 text-[14px] font-medium ${isAvailable(variant)?"text-black":"text-[#5b5b5b]"}`}>{stockStateText(variant?.availability)}</p>}
          {!product.commerce && vm && cmsVariant && (
            <VariantPicker options={vm.options} variants={vm.variants} selections={cmsVariant.selections} onSelect={chooseValue} />
          )}
          {!product.commerce && !(vm && cmsVariant) && <>
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
          </>}

          {!product.commerce && (
            <p className="mt-6 text-[14px] text-neutral-700">
              {cmsVariant && cmsVariant.stock <= 0 ? "Currently out of stock." : "Available to ship in 1–3 business days."}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              disabled={!sellable} onClick={handleAdd}
              className="g-btn bg-[#5bc2e7] text-black transition-colors hover:bg-[#37b4dc] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
            >
              {addLabel}
            </button>
            <button className="g-btn g-btn--outline-dark">Customize</button>
            {mode === "server" && (
              <button type="button" onClick={handleWishlist} disabled={wish === "saving"} className="g-btn g-btn--outline-dark disabled:opacity-50">
                {wish === "saved" ? "Saved to Wishlist ✓" : "Save to Wishlist"}
              </button>
            )}
          </div>
          {notice && <p role="status" className="mt-3 text-[13px] text-neutral-700">{notice}</p>}
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
