// Owner 2026-11-23: garmin.com-style product pages. /p/{code} shows the product on its default (or first in-stock)
// variant; /p/{code}/{sku} is that variant's own page. Old /p/<uuid> keys and ?variant= links are not supported (404).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readOr } from "@/server/public-input";
import { cmsBackend } from "@/server/cms/source";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ProductTop } from "@/components/ProductTop";
import { ProductTabs } from "@/components/ProductTabs";
import { RelatedProducts } from "@/components/RelatedProducts";
import { ProductVariantProvider } from "@/components/product/ProductVariantContext";
import { resolvePageVariant } from "@/lib/catalog/variant-selection";
import { isProductCode, productPath } from "@/lib/catalog/product-url";
import { initialVariantId as pickInitialVariant } from "@/lib/variant-availability";
import { getProductDetail, getCMSProduct, getRawCMSProduct } from "@/lib/products";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { getMetaTranslations } from "@/i18n/page-locale";
import { localizedSeo, localizedUrl } from "@/i18n/seo";
import { resolveSeoText, translatedLocales } from "@/i18n/translate-record";
import type { Locale } from "@/i18n/config";
import type { ProductDetail } from "@/types";
import type { ProductDetailVariantDTO } from "@/contracts/commerce";

interface PageTarget {
  detail: ProductDetail;
  /** The variant of a /p/{code}/{sku} page; undefined on the product page. */
  variant?: ProductDetailVariantDTO;
  /** Canonical path of this page (stored-case SKU). */
  path: string;
}

/**
 * The product (and variant) a page shows, or null for a 404. PostgreSQL pages are keyed by product code only; the
 * legacy JSON CMS keeps its record ids and has no variant pages.
 */
async function loadTarget(code: string, locale: Locale, sku: string | null): Promise<PageTarget | null> {
  const postgres = cmsBackend() === "postgres";
  if (postgres && !isProductCode(code)) return null;
  const detail = await readOr(getProductDetail(code, locale), () => undefined);
  if (!detail) return null;
  if (sku === null) return { detail, path: productPath(detail.productCode ?? detail.id) };
  const variant = detail.commerce && detail.productCode ? resolvePageVariant(detail.commerce.variants, sku) : null;
  if (!variant || !detail.productCode) return null;
  return { detail, variant, path: productPath(detail.productCode, variant.sku) };
}

export async function productPageMetadata(params: Promise<{ lang: string }>, locale: Locale, code: string, sku: string | null): Promise<Metadata> {
  const t = await getMetaTranslations(params);
  const target = await loadTarget(code, locale, sku);
  // Legacy CMS records carry translations; the PostgreSQL detail is already localized (product_translations).
  const detail = target?.detail;
  const rawProduct = detail && !detail.commerce ? await getRawCMSProduct(detail.id) : undefined;
  const cmsProduct = detail && !detail.commerce ? await getCMSProduct(detail.id, locale) : undefined;
  if (!target || !detail) return { title: t("productFallbackTitle") };

  const commerceSeo = detail.commerce?.seo;
  const name = cmsProduct?.name || detail.title || t("productFallbackName");
  const title = commerceSeo?.title || resolveSeoText(rawProduct, locale, ["seoTitle", "name"]) || t("productTitle", { name });
  const description =
    commerceSeo?.description ||
    resolveSeoText(rawProduct, locale, ["seoDescription", "description"]) ||
    cmsProduct?.description ||
    detail.subtitle ||
    t("productDescription", { name });
  const image =
    target.variant?.gallery?.[0]?.url || commerceSeo?.image || cmsProduct?.ogImage || cmsProduct?.image || detail.gallery[0]?.src || "/images/products/1228429.jpg";
  const seo = localizedSeo({
    path: target.path,
    locale,
    // Same record the page renders: a language is indexed once its name and description are translated.
    indexedLocales: detail.commerce?.translatedLocales ?? translatedLocales(rawProduct ?? {}, ["name", "description"]),
    canonicalOverride: target.variant ? undefined : commerceSeo?.canonicalUrl || cmsProduct?.canonicalUrl || undefined,
    noIndex: commerceSeo?.noIndex || cmsProduct?.noIndex,
  });

  return {
    title,
    description,
    keywords: cmsProduct?.focusKeywords?.join(", "),
    alternates: seo.alternates,
    robots: seo.robots,
    openGraph: { title, description, ...seo.openGraph, siteName: "Garmin", type: "website", images: [{ url: image, width: 1200, height: 630, alt: name }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export async function ProductPageView({ locale, code, sku }: { locale: Locale; code: string; sku: string | null }) {
  const target = await loadTarget(code, locale, sku);
  if (!target) notFound();
  const { detail, variant, path } = target;
  // The product page opens on the default variant when it is in stock, else on the first in-stock one; a variant
  // page opens on its own variant (even when it is out of stock).
  const initialVariantId = variant?.id ?? (detail.commerce
    ? pickInitialVariant(detail.commerce.variants, { defaultId: detail.commerce.selectedVariantId ?? detail.commerce.defaultVariantId }) ?? ""
    : "");

  const rawProduct = detail.commerce ? undefined : await getRawCMSProduct(detail.id);
  const cmsProduct = rawProduct ? await getCMSProduct(detail.id, locale) : undefined;
  const fullProduct = cmsProduct || {
    id: detail.id,
    name: detail.title,
    sku: detail.partNumber || `GRM-${detail.id}`,
    price: Number(detail.price),
    description: detail.subtitle,
    image: detail.gallery[0]?.src || "/images/products/1228429.jpg",
    family: "Smartwatches",
    category: "Smartwatches & Wearables",
    subCategory: "Multisport GPS",
    activities: ["Running", "Hiking"],
    level: "Premium" as const,
    caseSize: "Medium" as const,
    stock: 0,
    stockManaged: false,
    status: "published" as const,
    specs: detail.specs || [],
    inTheBox: detail.inTheBox || [],
    compatibleAccessories: [],
    createdAt: new Date().toISOString(),
  };

  // Structured breadcrumbs follow the visible ones (the primary category path for PostgreSQL products).
  const trail = detail.breadcrumb.filter((crumb) => crumb.href && crumb.href !== "/");
  const breadcrumbs = [
    { name: "Garmin", url: localizedUrl("/", locale) },
    ...(trail.length
      ? trail.map((crumb) => ({ name: crumb.label, url: localizedUrl(crumb.href, locale) }))
      : [{ name: "Smartwatches", url: localizedUrl("/c/wearables-smartwatches", locale) }]),
    { name: fullProduct.name, url: localizedUrl(path, locale) },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Google Structured Data */}
      <ProductJsonLd
        // Task 5a.2: the offer uses the storefront price (legacy USD already converted to tenge in products.ts);
        // an unconverted legacy price ("USD", no rate) gets no offer price at all rather than a USD claim.
        product={detail.commerce ?? { ...fullProduct, price: Number(detail.price), currency: detail.currency === "USD" ? ("USD" as const) : ("KZT" as const) }}
        url={localizedUrl(path, locale)}
        locale={locale}
        description={
          resolveSeoText(rawProduct, locale, ["seoDescription", "description"]) ||
          (detail.commerce ? undefined : fullProduct.seoDescription || fullProduct.description)
        }
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <SiteHeader />
      <main className="flex-1">
        <ProductVariantProvider initialVariantId={initialVariantId}>
          <ProductTop product={detail} />
          <ProductTabs product={detail} />
        </ProductVariantProvider>
        <RelatedProducts ids={detail.related} locale={locale} />
      </main>
      <SiteFooter />
    </div>
  );
}
