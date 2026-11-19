import { notFound } from "next/navigation";
import { decodeRouteParam } from "@/lib/route-params";
import { readOr } from "@/server/public-input";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ProductTop } from "@/components/ProductTop";
import { ProductTabs } from "@/components/ProductTabs";
import { RelatedProducts } from "@/components/RelatedProducts";
import { getProductDetail, getAllProducts, getCMSProduct, getRawCMSProduct } from "@/lib/products";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { getMetaTranslations, initPageLocale } from "@/i18n/page-locale";
import { localizedSeo, localizedUrl } from "@/i18n/seo";
import { resolveSeoText, translatedLocales } from "@/i18n/translate-record";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return (await getAllProducts()).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/p/[id]">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const t = await getMetaTranslations(params);
  const id = decodeRouteParam((await params).id);
  const detail = await readOr(getProductDetail(id, locale), () => undefined);
  // Legacy CMS records carry translations; the PostgreSQL detail brings its own SEO block (English only).
  const rawProduct = detail?.commerce ? undefined : await getRawCMSProduct(id);
  const cmsProduct = detail?.commerce ? undefined : await getCMSProduct(id, locale);

  if (!detail && !cmsProduct) {
    return { title: t("productFallbackTitle") };
  }

  const commerceSeo = detail?.commerce?.seo;
  const name = cmsProduct?.name || detail?.title || t("productFallbackName");
  const title =
    commerceSeo?.title || resolveSeoText(rawProduct, locale, ["seoTitle", "name"]) || t("productTitle", { name });
  const description =
    commerceSeo?.description ||
    resolveSeoText(rawProduct, locale, ["seoDescription", "description"]) ||
    cmsProduct?.description ||
    detail?.subtitle ||
    t("productDescription", { name });
  const image =
    commerceSeo?.image || cmsProduct?.ogImage || cmsProduct?.image || detail?.gallery[0]?.src || "/images/products/1228429.jpg";
  const seo = localizedSeo({
    path: `/p/${id}`,
    locale,
    // Same record the page renders: without a translated overlay (or on PostgreSQL) only en is indexed.
    indexedLocales: translatedLocales(rawProduct ?? {}, ["name", "description"]),
    canonicalOverride: commerceSeo?.canonicalUrl || cmsProduct?.canonicalUrl || undefined,
    noIndex: commerceSeo?.noIndex || cmsProduct?.noIndex,
  });

  return {
    title,
    description,
    keywords: cmsProduct?.focusKeywords?.join(", "),
    alternates: seo.alternates,
    robots: seo.robots,
    openGraph: {
      title,
      description,
      ...seo.openGraph,
      siteName: "Garmin",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/[lang]/p/[id]">) {
  const locale = await initPageLocale(params);
  const id = decodeRouteParam((await params).id);
  const detail = await readOr(getProductDetail(id, locale), () => undefined);
  if (!detail) notFound();

  const rawProduct = detail.commerce ? undefined : await getRawCMSProduct(id);
  const cmsProduct = rawProduct ? await getCMSProduct(id, locale) : undefined;
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
    stockManaged:false,
    status: "published" as const,
    specs: detail.specs || [],
    inTheBox: detail.inTheBox || [],
    compatibleAccessories: [],
    createdAt: new Date().toISOString(),
  };

  const breadcrumbs = [
    { name: "Garmin", url: localizedUrl("/", locale) },
    { name: "Smartwatches", url: localizedUrl("/c/wearables-smartwatches", locale) },
    { name: fullProduct.name, url: localizedUrl(`/p/${fullProduct.id}`, locale) },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Google Structured Data */}
      <ProductJsonLd
        product={detail.commerce ?? fullProduct}
        url={localizedUrl(`/p/${id}`, locale)}
        locale={locale}
        description={
          resolveSeoText(rawProduct, locale, ["seoDescription", "description"]) ||
          (detail.commerce ? undefined : fullProduct.seoDescription || fullProduct.description)
        }
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <SiteHeader />
      <main className="flex-1">
        <ProductTop product={detail} />
        <ProductTabs product={detail} />
        <RelatedProducts ids={detail.related} locale={locale} />
      </main>
      <SiteFooter />
    </div>
  );
}
