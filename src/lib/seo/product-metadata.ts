// Owner 2026-11-23: what a product page (/p/{code}) and a variant page (/p/{code}/{sku}) tell search engines — title,
// description, keywords, image and canonical path. Stored admin text wins; otherwise the generator (generate.ts)
// writes it from the localized name and option values. Pure: the page turns this into Next.js Metadata.
import type { Locale, ProductDetailDTO, ProductDetailVariantDTO } from "../../contracts/commerce.ts";
import { productPath } from "../catalog/product-url.ts";
import { generateProductSeo, generateVariantSeo, seoKind, type SeoLocale, type SeoSubject, type SeoText } from "./generate.ts";

export interface ProductPageSeo extends SeoText {
  /** Unprefixed canonical path: /p/{code} or /p/{code}/{sku} (stored-case SKU). */
  path: string;
  image: string | null;
  /** Record-level canonical URL; product page only. */
  canonicalOverride?: string;
  noIndex: boolean;
  /** Languages the product is translated into (others are noindex). */
  indexedLocales: Locale[];
}

const MAX_TITLE = 60;

/** The generator's view of a product (localized name and description, category kind). */
export function productSeoSubject(detail: ProductDetailDTO): SeoSubject {
  return {
    name: detail.name,
    family: detail.family ?? null,
    kind: seoKind((detail.breadcrumb ?? []).map((crumb) => crumb.slug)),
    categoryName: detail.breadcrumb?.at(-1)?.name ?? null,
    description: detail.description,
    specs: detail.specs,
  };
}

function generatedVariant(detail: ProductDetailDTO, variant: ProductDetailVariantDTO, locale: SeoLocale): SeoText {
  const optionValues = (variant.optionValues ?? Object.entries(variant.options).map(([key, value]) => ({ key, name: key, value }))).map(({ name, value }) => ({ name, value }));
  return generateVariantSeo(productSeoSubject(detail), { sku: variant.sku, optionValues }, locale);
}

/** `title` shortened on a word boundary so ` (SKU)` fits within the title limit. */
function withSku(title: string, sku: string): string {
  const room = MAX_TITLE - sku.length - 3;
  let base = title;
  if (base.length > room) {
    base = base.slice(0, room);
    const space = base.lastIndexOf(" ");
    if (space > room / 2) base = base.slice(0, space);
    base = base.replace(/[\s,–—\-|(]+$/u, "");
  }
  return `${base} (${sku})`;
}

/** A variant's SEO text: its stored override, else generated; a generated title shared with a sibling gets the SKU. */
export function variantSeoText(detail: ProductDetailDTO, variant: ProductDetailVariantDTO, locale: SeoLocale): SeoText {
  const generated = generatedVariant(detail, variant, locale);
  const own = variant.seo ?? {};
  let title = own.title?.trim() || generated.title;
  if (!own.title?.trim()) {
    const clash = detail.variants.some((other) => other.id !== variant.id && !other.seo?.title?.trim() && generatedVariant(detail, other, locale).title === generated.title);
    if (clash) title = withSku(generated.title, variant.sku);
  }
  return { title, description: own.description?.trim() || generated.description, keywords: generated.keywords };
}

/** The product page's SEO text: the admin's stored text for this language, else generated. */
export function productSeoText(detail: ProductDetailDTO, locale: SeoLocale): SeoText {
  const generated = generateProductSeo(productSeoSubject(detail), locale);
  return {
    title: detail.seoOverride?.title || generated.title,
    description: detail.seoOverride?.description || generated.description,
    keywords: generated.keywords,
  };
}

export function productPageSeo({ detail, locale, variant }: { detail: ProductDetailDTO; locale: Locale; variant?: ProductDetailVariantDTO }): ProductPageSeo {
  const noIndex = detail.noIndex === true || detail.seo?.noIndex === true;
  const indexedLocales = detail.translatedLocales ?? ["en"];
  if (variant) {
    return {
      ...variantSeoText(detail, variant, locale),
      path: productPath(detail.productCode, variant.sku),
      image: variant.gallery?.[0]?.url ?? detail.gallery[0]?.url ?? detail.seo?.image ?? null,
      noIndex,
      indexedLocales,
    };
  }
  return {
    ...productSeoText(detail, locale),
    path: productPath(detail.productCode),
    image: detail.seo?.image ?? detail.gallery[0]?.url ?? null,
    ...(detail.seo?.canonicalUrl ? { canonicalOverride: detail.seo.canonicalUrl } : {}),
    noIndex,
    indexedLocales,
  };
}
