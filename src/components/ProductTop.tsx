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
import { useProductVariant } from "@/components/product/ProductVariantContext";
import { withVariantParam } from "@/lib/catalog/variant-selection";
import { isPurchasable, selectValue } from "@/lib/cms/product-variants";
import { commerceVariantModel } from "@/lib/cms/commerce-variant-model";
import type { ProductOption, ProductVariant } from "@/lib/cms/types";
import { Price } from "@/components/ui/price";
import { badgeClass } from "@/components/ui/badge";
import { toMinor } from "@/lib/money";
import { useAppLocale } from "@/i18n/useAppLocale";

export function ProductTop({ product:initial }: { product: ProductDetail }) {
  const t = useTranslations("ProductTop");
  const locale = useAppLocale();
  // Task 2.4: shared with ProductTabs; the server picked the initial variant from `?variant=<sku>`.
  const { selectedVariantId: variantId, setSelectedVariantId: setVariantId } = useProductVariant();
  const variant=initial.commerce?.variants.find(v=>v.id===variantId);
  // PostgreSQL products get the same garmin.com pickers as JSON CMS products (no plain dropdown).
  const commerceModel = useMemo(
    () => (initial.commerce ? (commerceVariantModel(initial.commerce) as { options: ProductOption[]; variants: ProductVariant[] } | undefined) : undefined),
    [initial.commerce],
  );
  const commerceSelections = commerceModel?.variants.find((v) => v.id === variantId)?.selections;
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

  const chooseCommerceValue = (optionId: string, valueId: string) => {
    if (!commerceModel) return;
    const next = selectValue(commerceModel.variants, commerceSelections || {}, optionId, valueId);
    if (!next) return;
    setVariantId(next.id);
    setMainIdx(0);
    // Keep the choice in the URL (reload or a shared link shows the same variant); no navigation, no scroll.
    if (next.sku) window.history.replaceState(window.history.state, "", withVariantParam(window.location.href, next.sku));
  };

  const price = cmsVariant?.price ?? product.price;
  const compareAt = cmsVariant?.originalPrice;
  const partNumber = cmsVariant?.sku || product.partNumber;
  // garmin.com imports are converted to tenge (sourcePrice keeps the USD original). Only legacy products still show the US financing lines below.
  const isKzt = Boolean(cmsVariant?.sourcePrice?.rateKztPerUsd);
  // Task 5a.2: every price is tenge in the page locale through <Price> (never USD); the stored amount is shown as is.
  const priceAmount = price !== undefined && price !== "" && toMinor({ major: price }) !== null ? { major: price } : null;
  const onSale = typeof price === "number" && compareAt !== undefined && compareAt > price;

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
    <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-4 lg:px-0">
      {/* garmin.com layout (measured at 1440px): gallery column ≈ 700px, buy box 561px starting 32px after it */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,701px)_minmax(0,561px)]">
        {/* Gallery: 80px thumbnails in a column (1.6px #ccc frame, black when shown) beside a square photo */}
        <div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end lg:gap-[5px]">
          <div className="flex items-center gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            <button
              aria-label={t("previousImage")}
              onClick={() => setMainIdx((i) => Math.max(0, i - 1))}
              disabled={safeIdx === 0}
              className="hidden h-4 w-20 place-items-center bg-[#e5e5e5] text-black disabled:opacity-40 lg:grid"
            >
              <ChevronLeftIcon className="h-3 w-3 rotate-90" />
            </button>
            <div className="flex gap-2 lg:max-h-[464px] lg:flex-col lg:overflow-y-auto lg:[scrollbar-width:none]">
              {gallery.map((g, i) => (
                <button
                  key={`${g.view}-${i}`}
                  onClick={() => setMainIdx(i)}
                  aria-label={g.view}
                  aria-current={i === safeIdx}
                  className={`relative h-20 w-20 shrink-0 border-[1.6px] bg-white ${i === safeIdx ? "border-black" : "border-[#ccc] hover:border-black"}`}
                >
                  <Image src={g.src} alt="" fill sizes="80px" unoptimized={g.src.startsWith("http")} className="object-contain" />
                </button>
              ))}
            </div>
            <button
              aria-label={t("nextImage")}
              onClick={() => setMainIdx((i) => Math.min(gallery.length - 1, i + 1))}
              disabled={safeIdx >= gallery.length - 1}
              className="hidden h-4 w-20 place-items-center bg-[#e5e5e5] text-black disabled:opacity-40 lg:grid"
            >
              <ChevronRightIcon className="h-3 w-3 rotate-90" />
            </button>
          </div>
          <div className="relative aspect-square w-full lg:w-[483px]">
            {gallery[safeIdx] && (
              <Image
                src={gallery[safeIdx].src}
                alt={product.title}
                fill
                priority
                unoptimized={gallery[safeIdx].src.startsWith("http")}
                sizes="(max-width: 1024px) 100vw, 483px"
                className="object-contain"
              />
            )}
          </div>
        </div>

        {/* Buy box */}
        <div>
          <nav className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-black">
            {product.breadcrumb.map((b, i) => (
              <span key={b.label} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden>/</span>}
                <Link href={b.href} className="underline hover:no-underline">
                  {b.label}
                </Link>
              </span>
            ))}
          </nav>
          <h1 className="g-heading text-[32px] normal-case leading-[40px] tracking-[0.8px] text-black lg:text-[40px] lg:leading-[50px]">
            {product.title}
          </h1>
          <p className="mt-1 text-[14px] leading-[21px] text-black">{t("partNumber", { partNumber })}</p>

          {product.badge && product.badge !== "NONE" ? (
            <div className="mt-3">
              <GarminBadge badge={product.badge} variant="pill" />
            </div>
          ) : onSale ? (
            <span className={badgeClass({ className: "mt-3" })}>{t("sale")}</span>
          ) : null}

          {priceAmount ? (
            <Price
              size="pdp"
              locale={locale}
              amount={priceAmount}
              compareAt={onSale ? { major: compareAt as number } : null}
              saveLabel={(amount) => t("save", { amount })}
            />
          ) : (
            <p className="mt-4 mb-1 text-[20px] font-bold leading-[24px] text-black">{price}</p>
          )}
          {product.currency !== "KZT" && !isKzt && (
            <>
              <p className="mt-1 text-[14px] text-black">
                {t.rich("financing", { brand: (chunks) => <span className="font-semibold">{chunks}</span> })}{" "}
                <a href="#" className="underline">{t("qualify")}</a>
              </p>
              <p className="text-[14px] text-black">
                {t("hsa")} <a href="#" className="underline">{t("learnMore")}</a>
              </p>
            </>
          )}
          {product.commerce && commerceModel && commerceSelections && (
            <VariantPicker
              options={commerceModel.options}
              variants={commerceModel.variants}
              selections={commerceSelections}
              onSelect={chooseCommerceValue}
            />
          )}
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
          <div className="mt-4">
            <p className="text-[14px] font-bold leading-[21px] text-black">
              {t("modelColor")}
              {product.colors[colorIdx] && <span className="font-normal"> - {product.colors[colorIdx].label}</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-[10.8px]">
              {product.colors.map((c, i) => (
                <button
                  key={c.label}
                  aria-label={c.label}
                  aria-pressed={i === colorIdx}
                  onClick={() => {
                    setColorIdx(i);
                    setMainIdx(0);
                  }}
                  className={`relative h-[83px] w-[83px] border-[1.6px] bg-white ${
                    i === colorIdx ? "border-black" : "border-[#ccc] hover:border-black"
                  }`}
                >
                  <Image src={c.src} alt="" fill sizes="80px" className="object-contain" />
                </button>
              ))}
            </div>
          </div>
          </>}

          {/* garmin.com CTAs (Buttons.spec.md): large candy-blue buy button and large secondary buttons, 8px apart */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              disabled={!sellable} onClick={handleAdd}
              className="g-btn g-btn--lg g-btn--primary w-full md:w-auto"
            >
              {addLabel}
            </button>
            <button className="g-btn g-btn--lg g-btn--secondary w-full md:w-auto">
              {t("customize")}
            </button>
            {mode === "server" && (
              <button
                type="button" onClick={handleWishlist} disabled={wish === "saving"}
                className="g-btn g-btn--lg g-btn--secondary w-full md:w-auto"
              >
                {wish === "saved" ? t("savedToWishlist") : t("saveToWishlist")}
              </button>
            )}
          </div>
          <p className="mt-4 text-[14px] leading-[21px] text-black">
            {/* PostgreSQL catalog: report real stock only — no delivery promise the server has not made */}
            {product.commerce
              ? variant?.availability === "available"
                ? t("inStock")
                : variant?.availability === "out_of_stock"
                  ? t("availabilityOutOfStock")
                  : t("availabilityUnknown")
              : cmsVariant && cmsVariant.stock <= 0
                ? t("outOfStockNote")
                : t("shipsIn")}
          </p>
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
    <div className="mt-4">
      <p className="text-[14px] font-bold leading-[21px] text-black">
        {label}
        {value && <span className="font-normal"> - {value}</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-[10.8px]">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className={`h-[38px] min-w-[82px] border-[1.6px] px-[17.5px] text-[14px] leading-[21px] transition-colors ${
              o === value
                ? "border-black bg-black text-white"
                : "border-[#ccc] bg-white text-black hover:border-black"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
