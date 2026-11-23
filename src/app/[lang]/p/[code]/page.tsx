import type { Metadata } from "next";
import { decodeRouteParam } from "@/lib/route-params";
import { initPageLocale } from "@/i18n/page-locale";
import { ProductPageView, productPageMetadata } from "./product-page";

// Owner 2026-11-23: /p/{code} — the product page (default variant). Variants live at /p/{code}/{sku}.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[lang]/p/[code]">): Promise<Metadata> {
  const locale = await initPageLocale(params);
  return productPageMetadata(params, locale, decodeRouteParam((await params).code), null);
}

export default async function ProductPage({ params }: PageProps<"/[lang]/p/[code]">) {
  const locale = await initPageLocale(params);
  return <ProductPageView locale={locale} code={decodeRouteParam((await params).code)} sku={null} />;
}
