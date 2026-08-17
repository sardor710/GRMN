import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ProductTop } from "@/components/ProductTop";
import { ProductTabs } from "@/components/ProductTabs";
import { RelatedProducts } from "@/components/RelatedProducts";
import { getProductDetail, getAllProducts, getCMSProduct } from "@/lib/products";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getAllProducts().map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cmsProduct = getCMSProduct(id);
  const detail = getProductDetail(id);

  if (!detail && !cmsProduct) {
    return { title: "Garmin Smartwatches & GPS Devices" };
  }

  const name = cmsProduct?.name || detail?.title || "Garmin Product";
  const title = cmsProduct?.seoTitle || `${name} | Official Garmin Smartwatch`;
  const description =
    cmsProduct?.seoDescription ||
    cmsProduct?.description ||
    detail?.subtitle ||
    `Discover ${name} with advanced GPS tracking, health metrics, and long battery life.`;
  const image = cmsProduct?.ogImage || cmsProduct?.image || detail?.gallery[0]?.src || "/images/products/1228429.jpg";
  const url = `https://www.garmin.com/p/${id}`;

  return {
    title,
    description,
    keywords: cmsProduct?.focusKeywords?.join(", "),
    alternates: {
      canonical: cmsProduct?.canonicalUrl || url,
    },
    robots: cmsProduct?.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      title,
      description,
      url,
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

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = getProductDetail(id);
  if (!detail) notFound();

  const cmsProduct = getCMSProduct(id);
  const fullProduct = cmsProduct || {
    id: detail.id,
    name: detail.title,
    sku: detail.partNumber || `GRM-${detail.id}`,
    price: detail.price,
    description: detail.subtitle,
    image: detail.gallery[0]?.src || "/images/products/1228429.jpg",
    family: "Smartwatches",
    category: "Smartwatches & Wearables",
    subCategory: "Multisport GPS",
    activities: ["Running", "Hiking"],
    level: "Premium" as const,
    caseSize: "Medium" as const,
    stock: 50,
    status: "published" as const,
    specs: detail.specs || [],
    inTheBox: detail.inTheBox || [],
    compatibleAccessories: [],
    createdAt: new Date().toISOString(),
  };

  const breadcrumbs = [
    { name: "Garmin", url: "https://www.garmin.com" },
    { name: "Smartwatches", url: "https://www.garmin.com/c/wearables-smartwatches" },
    { name: fullProduct.name, url: `https://www.garmin.com/p/${fullProduct.id}` },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Google Structured Data */}
      <ProductJsonLd product={fullProduct} url={`https://www.garmin.com/p/${id}`} />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <SiteHeader />
      <main className="flex-1">
        <ProductTop product={detail} />
        <ProductTabs product={detail} />
        <RelatedProducts ids={detail.related} />
      </main>
      <SiteFooter />
    </div>
  );
}
