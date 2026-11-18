"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {minorToMajor,catalogPriceLabel} from "@/lib/public-catalog";
import { INTL_LOCALE } from "@/i18n/config";
import type { ProductDetail } from "@/types";
import { useCart } from "@/lib/cart";
import { CartRequestError, createCartClient } from "@/lib/cart-client";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { GarminBadge } from "@/components/GarminBadge";
import { VariantPicker } from "@/components/product/VariantPicker";
import { isPurchasable, selectValue } from "@/lib/cms/product-variants";
import { formatMoney } from "@/i18n/format";
import { useAppLocale } from "@/i18n/useAppLocale";

export function ProductTop({ product:initial }: { product: ProductDetail }) {
  const t = useTranslations("ProductTop");
  const locale = useAppLocale();
  // Currency stays USD (plan L9); only the number format follows the locale.
  const money = (n: number) => t("price", { price: formatMoney(n, locale) });
  const [variantId,setVariantId]=useState(initial.commerce?.selectedVariantId??initial.commerce?.variants[0]?.id??"");
  const variant=initial.commerce?.variants.find(v=>v.id===variantId);
  const product:ProductDetail=variant?{...initial,price:minorToMajor(variant.price.selling.amountMinor),priceLabel:catalogPriceLabel(variant.price,"KZT",INTL_LOCALE[locale]),partNumber:variant.sku,gallery:(variant.gallery??[]).map(m=>({view:m.alt||variant.name,src:m.url}))}:initial;
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

  const gallery = useMemo(() => {
    if (!vm || !cmsVariant) return product.gallery;
    const byId = new Map(vm.images.map((img) => [img.id, img]));
    const own = cmsVariant.imageIds.map((id) => byId.get(id)).filter((img): img is NonNullable<typeof img> => Boolean(img));
    return own.length ? own.map((img, i) => ({ view: `${img.alt || product.title} ${i + 1}`, src: img.src })) : product.gallery;
  }, [vm, cmsVariant, product.gallery, product.title]);
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
  const sellable = serverCart ? variant?.availability === "available" : product.purchasable !== false && isPurchasable(cmsVariant);
  const addLabel = !sellable
    ? (serverCart && variant?.availability === "out_of_stock") || (!serverCart && cmsVariant && !isPurchasable(cmsVariant)) ? t("availabilityOutOfStock") : t("purchasingUnavailable")
    : added ? t("added") : t("addToCart");
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
    } catch (error) { setNotice(error instanceof Error ? error.message : t("addFailed")); return; }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };
  const handleWishlist = async () => {
    setWish("saving"); setNotice(null);
    try { await createCartClient((url, init) => fetch(url, { ...init, credentials: "same-origin" })).saveToWishlist(product.id); setWish("saved"); }
    catch (error) {
      setWish("idle");
      setNotice(error instanceof CartRequestError && error.status === 401 ? t("wishlistSignIn") : error instanceof Error ? error.message : t("wishlistFailed"));
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
              aria-label={t("previousImage")}
              onClick={() => setMainIdx((i) => Math.max(0, i - 1))}
              className="grid h-8 place-items-center bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            >
              <ChevronLeftIcon className="h-4 w-4 rotate-90" />
            </button>
            {gallery.map((g, i) => (
              <button
                key={`${g.view}-${i}`}
                onClick={() => setMainIdx(i)}
                className={`relative h-16 w-16 border ${
                  i === safeIdx ? "border-black" : "border-neutral-200"
                }`}
              >
                <Image src={g.src} alt={g.view} fill sizes="64px" unoptimized={g.src.startsWith("http")} className="object-contain p-1" />
              </button>
            ))}
            <button
              aria-label={t("nextImage")}
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
            {t("partNumber", { partNumber })}
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
            {t.rich("financing", { brand: (chunks) => <span className="font-semibold">{chunks}</span> })}{" "}
            <a href="#" className="underline">{t("qualify")}</a>
          </p>
          <p className="mt-1 text-[14px] text-neutral-600">
            {t("hsa")} <a href="#" className="underline">{t("learnMore")}</a>
          </p>

          </>}
          {product.commerce&&<label className="mt-6 block">{t("variant")}<select aria-label={t("variant")} value={variantId} onChange={e=>{setVariantId(e.target.value);setMainIdx(0);}} className="mt-2 block w-full border p-3">{product.commerce.variants.map(v=><option key={v.id} value={v.id}>{v.name} {Object.values(v.options).join(" / ")}</option>)}</select><span>{variant?.availability==="available"?t("inStock"):variant?.availability==="out_of_stock"?t("availabilityOutOfStock"):t("availabilityUnknown")}</span></label>}
          {!product.commerce && vm && cmsVariant && (
            <VariantPicker options={vm.options} variants={vm.variants} selections={cmsVariant.selections} onSelect={chooseValue} />
          )}
          {!product.commerce && !(vm && cmsVariant) && <>
          {/* Case size */}
          <Selector
            label={t("caseSize")}
            options={product.caseSizes}
            value={caseSize}
            onChange={setCaseSize}
          />
          {/* Version */}
          <Selector
            label={t("version")}
            options={product.versions}
            value={version}
            onChange={setVersion}
          />

          {/* Model / Color */}
          <div className="mt-6">
            <p className="text-[14px] font-medium text-black">{t("modelColor")}</p>
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
              {cmsVariant && cmsVariant.stock <= 0 ? t("outOfStockNote") : t("shipsIn")}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              disabled={!sellable} onClick={handleAdd}
              className="g-btn bg-[#5bc2e7] text-black transition-colors hover:bg-[#37b4dc] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
            >
              {addLabel}
            </button>
            <button className="g-btn g-btn--outline-dark">{t("customize")}</button>
            {mode === "server" && (
              <button type="button" onClick={handleWishlist} disabled={wish === "saving"} className="g-btn g-btn--outline-dark disabled:opacity-50">
                {wish === "saved" ? t("savedToWishlist") : t("saveToWishlist")}
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
