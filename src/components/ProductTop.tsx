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
import type { ProductOptionDTO } from "@/contracts/catalog-browse";
import { Price } from "@/components/ui/price";
import { badgeClass } from "@/components/ui/badge";
import { isKztSale, toMinor, type KztAmount } from "@/lib/money";
import { useAppLocale } from "@/i18n/useAppLocale";
import { COMPARE_MAX_ITEMS } from "@/lib/compare/compare-items";
import { findVariantEntry, isSelectionFull, selectionHref, toggleVariant, type CompareSelectionItem } from "@/lib/compare/selection";
import { useCompareSelection } from "@/lib/compare/use-compare-selection";

const COMPARE_LIMIT_ID = "pdp-compare-limit";

type CommerceModel = { options: ProductOption[]; variants: ProductVariant[] };

/**
 * Applies the product's stored option definitions (display type, order, swatch colour and photo) to the picker
 * model built from the variants. Options without a definition keep the model's own guess.
 */
function withOptionDefinitions(model: CommerceModel | undefined, definitions: readonly ProductOptionDTO[] | undefined): CommerceModel | undefined {
  if (!model || !definitions?.length) return model;
  const definitionOf = (option: ProductOption) => definitions.find((d) => d.name === option.name || d.key === option.name);
  const rank = (option: ProductOption) => {
    const index = definitions.findIndex((d) => d.name === option.name || d.key === option.name);
    return index < 0 ? definitions.length : index;
  };
  const options = model.options.map((option) => {
    const definition = definitionOf(option);
    if (!definition) return option;
    const values = option.values.map((value) => {
      const meta = definition.values.find((v) => v.label === value.label);
      return meta ? { ...value, ...(meta.swatchColor ? { swatchColor: meta.swatchColor } : {}), ...(meta.swatchImage ? { swatchImage: meta.swatchImage } : {}) } : value;
    });
    return { ...option, display: definition.display, values };
  });
  return { ...model, options: [...options].sort((a, b) => rank(a) - rank(b)) };
}

export function ProductTop({ product:initial }: { product: ProductDetail }) {
  const t = useTranslations("ProductTop");
  const badgeText = useTranslations("ProductBadge");
  const tc = useTranslations("CompareBar");
  const locale = useAppLocale();
  // Task 2.4: shared with ProductTabs; the server picked the initial variant from `?variant=<sku>`.
  const { selectedVariantId: variantId, setSelectedVariantId: setVariantId } = useProductVariant();
  const variant=initial.commerce?.variants.find(v=>v.id===variantId);
  // PostgreSQL products get the same garmin.com pickers as JSON CMS products (no plain dropdown).
  // Option display (buttons / swatch / dropdown) and swatch colours and photos come from the product's option
  // definitions (migration 0024) when it has them.
  const commerceModel = useMemo(
    () => (initial.commerce ? withOptionDefinitions(commerceVariantModel(initial.commerce) as CommerceModel | undefined, initial.commerce.options) : undefined),
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
  const { items: compareItems, update: updateCompare } = useCompareSelection();
  // The live status speaks only after the shopper used the control, not when the stored selection loads.
  const [compareActed, setCompareActed] = useState(false);
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

  // Task 5a.2: every price is tenge in the page locale through <Price> (never USD). Backend amounts are exact
  // minor-unit strings, so the sale test compares minor units (isKztSale), never JS numbers.
  // Computed before the memo below so the React Compiler sees no later use of its dependencies.
  const salePrice = cmsVariant?.price ?? product.price;
  const priceAmount: KztAmount | null = variant
    ? { minor: variant.price.selling.amountMinor }
    : salePrice !== undefined && salePrice !== "" && toMinor({ major: salePrice }) !== null ? { major: salePrice } : null;
  const compareAtAmount: KztAmount | null = variant?.price.compareAt
    ? { minor: variant.price.compareAt.amountMinor }
    : cmsVariant?.originalPrice !== undefined ? { major: cmsVariant.originalPrice } : null;
  const onSale = isKztSale(compareAtAmount, priceAmount);
  // A legacy price with no KZT-per-USD rate (src/lib/legacy-prices.ts) is shown without a currency sign.
  const unconverted = product.currency === "USD";
  // Task C-c: "Add to comparison" adds the size on screen: the PostgreSQL variant from ProductVariantContext, or
  // the legacy JSON variant picked here. Another size of the same product is its own comparison column.
  // Computed before the memo below, like the prices above, for the React Compiler.
  const compareSku = variant?.sku ?? cmsVariant?.sku;
  const compareRef = { productId: initial.id, ...(compareSku ? { sku: compareSku } : {}) };
  // A catalogue card adds a product without a SKU; that entry counts as this product being compared (no duplicate).
  const compareEntryFound = findVariantEntry(compareItems, compareRef);
  const inComparison = compareEntryFound !== null;
  const exactInComparison = compareEntryFound?.exact === true;
  const compareBlocked = !inComparison && isSelectionFull(compareItems);
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
  const partNumber = cmsVariant?.sku || product.partNumber;

  // Server cart (Task 13A): the selected variant's real availability decides; the server prices it.
  // In the browser-only cart a JSON CMS variant must be active and in stock.
  const serverCart = mode === "server" && !!initial.commerce;
  // Add to cart is disabled only when the selected variant has no free stock (or the browser-only cart cannot sell it).
  const sellable = serverCart ? variant?.availability === "available" : !initial.commerce && product.purchasable !== false && isPurchasable(cmsVariant);
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
        ...(unconverted ? { unconverted: true } : {}),
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : t("addFailed")); return; }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };
  const toggleComparison = () => {
    if (compareBlocked) return;
    const entry: CompareSelectionItem = { ...compareRef, name: product.title, ...(gallery[0]?.src ? { image: gallery[0].src } : {}) };
    setCompareActed(true);
    updateCompare((items) => toggleVariant(items, entry));
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
    <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-[15px] lg:px-0 lg:pt-[18px]">
      {/* Below 1024 garmin.com puts the breadcrumb above the gallery (15px under the header, 16px before the photos);
          from 1024 it heads the buy box. One of the two navs is display:none at any width. */}
      <nav aria-label={t("breadcrumb")} className="mb-4 flex flex-wrap items-center text-[14px] leading-[14px] text-garmin-text-muted lg:hidden">
            {product.breadcrumb.map((b, i) => (
              <span key={b.label} className="flex items-center">
                {i > 0 && <span aria-hidden className="mx-2">/</span>}
                <Link href={b.href} className="underline">
                  {b.label}
                </Link>
              </span>
            ))}
      </nav>
      {/* garmin.com layout (ProductBuyBox.spec.md, 1440): gallery column, then the buy box at x 743, 566px wide
          (max-width 720, margin 0 16 16, padding-right 115.2). Below 1024 the buy box follows the gallery. */}
      <div className="grid grid-cols-1 lg:grid-cols-[727px_minmax(0,1fr)]">
        {/* Gallery: 80px thumbnails in a column (1.6px #ccc frame, black when shown) beside a square photo */}
        <div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end lg:gap-[5px] lg:pr-[46px]">
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

        {/* Buy box (ProductBuyBox.spec.md) */}
        <div data-buy-box className="text-black lg:mx-4 lg:mb-4 lg:max-w-[720px] lg:pr-[115.2px]">
          <nav aria-label={t("breadcrumb")} className="mb-4 hidden flex-wrap items-center text-[14px] leading-[14px] text-garmin-text-muted lg:flex">
            {product.breadcrumb.map((b, i) => (
              <span key={b.label} className="flex items-center">
                {i > 0 && <span aria-hidden className="mx-2">/</span>}
                <Link href={b.href} className="underline">
                  {b.label}
                </Link>
              </span>
            ))}
          </nav>
          <h1 className="g-heading g-h1 mb-1 text-black">
            {product.title}
          </h1>
          <p className="text-[14px] leading-[21px] text-black">{t("partNumber", { partNumber })}</p>

          {product.badge && product.badge !== "NONE" ? (
            <div className="mt-2 mb-4 flex">
              <GarminBadge badge={product.badge} variant="pill" className="mr-[12.8px]" labels={{ new: badgeText("new"), sale: badgeText("sale") }} />
            </div>
          ) : onSale ? (
            <div className="mt-2 mb-4 flex">
              <span className={badgeClass({ className: "mr-[12.8px]" })}>{t("sale")}</span>
            </div>
          ) : null}

          {priceAmount ? (
            <Price
              size="pdp"
              locale={locale}
              amount={priceAmount}
              compareAt={onSale ? compareAtAmount : null}
              unconverted={unconverted}
              saveLabel={(amount) => t("save", { amount })}
            />
          ) : (
            <p className="mt-4 mb-1 text-[20px] font-bold leading-[24px] text-black">{price}</p>
          )}
          {/* garmin.com shows US financing and HSA/FSA lines here; they do not apply in Kazakhstan (Task 5a.3). */}
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
          <div className="my-4">
            <p className="mb-2 text-[14px] font-bold leading-[21px] text-black">
              {t("modelColor")}
              {product.colors[colorIdx] && <span className="font-normal"> - {product.colors[colorIdx].label}</span>}
            </p>
            <div className="flex max-w-[570px] flex-wrap gap-[10.8px]">
              {product.colors.map((c, i) => (
                <button
                  key={c.label}
                  aria-label={c.label}
                  aria-pressed={i === colorIdx}
                  onClick={() => {
                    setColorIdx(i);
                    setMainIdx(0);
                  }}
                  className={`relative h-16 w-16 border-2 bg-white transition-[border-color] duration-500 lg:h-[84px] lg:w-[84px] ${
                    i === colorIdx ? "border-black" : "border-garmin-option hover:border-black"
                  }`}
                >
                  <span className="relative block h-full w-full">
                    <Image src={c.src} alt="" fill sizes="80px" className="object-contain" />
                  </span>
                </button>
              ))}
            </div>
          </div>
          </>}

          {/* garmin.com CTAs (Buttons.spec.md): large candy-blue buy button and large secondary buttons, 8px apart */}
          <div className="mt-4 mb-2 flex max-w-[570px] flex-wrap items-center gap-2">
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
          {/* Task C-c: Garmin-style text actions under the buy buttons; the buy box layout above is unchanged. */}
          <div data-compare-action className="flex max-w-[570px] flex-wrap items-center gap-x-6 text-[14px] leading-[21px] text-black">
            <button
              type="button"
              onClick={toggleComparison}
              aria-disabled={compareBlocked || undefined}
              aria-describedby={compareBlocked ? COMPARE_LIMIT_ID : undefined}
              className="g-btn g-btn--text text-[14px] underline hover:no-underline focus:no-underline aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              {exactInComparison ? tc("removeFromComparison") : inComparison ? tc("compareThisSize") : tc("add")}
            </button>
            {inComparison && (
              <Link href={selectionHref(compareItems)} className="g-btn g-btn--text text-[14px] underline hover:no-underline focus:no-underline">
                {tc("viewComparison")}
              </Link>
            )}
            {compareBlocked && <p id={COMPARE_LIMIT_ID} className="py-[10px]">{tc("limit", { max: COMPARE_MAX_ITEMS })}</p>}
            <p role="status" className="sr-only">{compareActed ? tc("status", { count: compareItems.length, max: COMPARE_MAX_ITEMS }) : ""}</p>
          </div>
          <p className="mt-4 mb-4 text-[14px] leading-[21px] text-black">
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
          {notice && <p role="status" className="mb-4 text-[14px] leading-[21px] text-black">{notice}</p>}
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
    <div className="my-4">
      <p className="mb-2 text-[14px] font-bold leading-[21px] text-black">
        {label}
        {value && <span className="font-normal"> - {value}</span>}
      </p>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className={`h-[39px] border-2 px-[17.5px] py-[7px] text-[14px] leading-[21px] transition-colors ${
              o === value
                ? "border-black bg-black text-white"
                : "border-garmin-option bg-white text-black hover:border-black"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
