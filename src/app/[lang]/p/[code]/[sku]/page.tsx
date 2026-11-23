import type { Metadata } from "next";
import { decodeRouteParam } from "@/lib/route-params";
import { initPageLocale } from "@/i18n/page-locale";
import { ProductPageView, productPageMetadata } from "../product-page";

// Owner 2026-11-23: /p/{code}/{sku} — one variant's own page (an unknown or archived sku is a 404).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[lang]/p/[code]/[sku]">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  const { code, sku } = await params;
  return productPageMetadata(params, locale, decodeRouteParam(code), decodeRouteParam(sku));
}

export default async function ProductVariantPage({ params }: PageProps<"/[lang]/p/[code]/[sku]">) {
  const locale = await initPageLocale(params);
  const { code, sku } = await params;
  return <ProductPageView locale={locale} code={decodeRouteParam(code)} sku={decodeRouteParam(sku)} />;
}
