// Owner 2026-11-23: Google product-variant structured data. The product page (/p/{code}) describes a ProductGroup whose
// hasVariant lists every variant on sale as a Product with its own URL; a variant page (/p/{code}/{sku}) describes that
// variant's Product, isVariantOf the group. Pure: the page serializes the result (components/seo/JsonLd.tsx).
import type { Locale, ProductDetailDTO, ProductDetailVariantDTO } from "../../contracts/commerce.ts";
import { absoluteUrl, localizedUrl } from "../../i18n/seo-core.js";
import { minorToMajor } from "../money.ts";
import { productPath } from "../catalog/product-url.ts";
import { variantSeoText } from "./product-metadata.ts";
import { generateProductSeo } from "./generate.ts";
import { productSeoSubject } from "./product-metadata.ts";

type Json = Record<string, unknown>;

const COLOR = /(^|[-\s/])(colou?r|цвет|түс)/i;
const SIZE = /(^|[-\s])(size|размер|өлшем)/i;

/** schema.org property an option varies by (color / size); null for any other option. */
function variesByProperty(option: { key: string; name: string }): "color" | "size" | null {
  const text = `${option.key} ${option.name}`;
  if (COLOR.test(text)) return "color";
  if (SIZE.test(text)) return "size";
  return null;
}

const strip = (text: string) => text.replace(/[®™]/g, "").replace(/\s{2,}/g, " ").trim();
const brand = { "@type": "Brand", name: "Garmin" } as const;

const AVAILABILITY: Record<string, string> = {
  available: "https://schema.org/InStock",
  out_of_stock: "https://schema.org/OutOfStock",
};

/** Variants a page lists: on sale (in stock or sold out); never ones that cannot be bought at all. */
const listed = (detail: ProductDetailDTO) => detail.variants.filter((v) => v.availability !== "unavailable");

function variantProduct(detail: ProductDetailDTO, variant: ProductDetailVariantDTO, locale: Locale, siteUrl: string): Json {
  const url = localizedUrl(productPath(detail.productCode, variant.sku), locale, siteUrl);
  const values = variant.optionValues ?? Object.entries(variant.options).map(([key, value]) => ({ key, name: key, value }));
  const typed: Json = {};
  const additional: Json[] = [];
  for (const option of values) {
    const property = variesByProperty(option);
    if (property && typed[property] === undefined) typed[property] = option.value;
    else additional.push({ "@type": "PropertyValue", name: option.name, value: option.value });
  }
  const images = (variant.gallery?.length ? variant.gallery : detail.gallery).map((m) => absoluteUrl(m.url, siteUrl));
  return {
    "@type": "Product",
    name: variantSeoText(detail, variant, locale).title,
    url,
    sku: variant.sku,
    mpn: variant.sku,
    ...(variant.barcode ? { gtin: variant.barcode } : {}),
    ...(images.length ? { image: images } : {}),
    ...typed,
    ...(additional.length ? { additionalProperty: additional } : {}),
    offers: {
      "@type": "Offer",
      url,
      price: minorToMajor(variant.price.selling.amountMinor),
      priceCurrency: "KZT",
      ...(AVAILABILITY[variant.availability] ? { availability: AVAILABILITY[variant.availability] } : {}),
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

function groupCore(detail: ProductDetailDTO, locale: Locale, siteUrl: string): Json {
  const seo = generateProductSeo(productSeoSubject(detail), locale);
  const variesBy = [...new Set((detail.options ?? []).map(variesByProperty).filter((p): p is "color" | "size" => p !== null))];
  return {
    "@type": "ProductGroup",
    name: strip(detail.name),
    description: detail.seoOverride?.description || seo.description,
    url: localizedUrl(productPath(detail.productCode), locale, siteUrl),
    brand,
    productGroupID: detail.productCode,
    ...(variesBy.length ? { variesBy: variesBy.map((p) => `https://schema.org/${p}`) } : {}),
  };
}

/** /p/{code}: the ProductGroup with every listed variant as a Product. */
export function productGroupJsonLd(detail: ProductDetailDTO, locale: Locale, siteUrl: string): Json {
  return {
    "@context": "https://schema.org",
    ...groupCore(detail, locale, siteUrl),
    inLanguage: locale,
    hasVariant: listed(detail).map((v) => variantProduct(detail, v, locale, siteUrl)),
  };
}

/** /p/{code}/{sku}: that variant's Product, isVariantOf the group. */
export function variantProductJsonLd(detail: ProductDetailDTO, variant: ProductDetailVariantDTO, locale: Locale, siteUrl: string): Json {
  return {
    "@context": "https://schema.org",
    ...variantProduct(detail, variant, locale, siteUrl),
    description: variantSeoText(detail, variant, locale).description,
    brand,
    inLanguage: locale,
    isVariantOf: groupCore(detail, locale, siteUrl),
  };
}

export function organizationJsonLd(siteUrl: string): Json {
  return { "@context": "https://schema.org", "@type": "Organization", name: "Garmin", url: siteUrl, logo: `${siteUrl}/seo/apple-touch-icon.png` };
}

export function websiteJsonLd(locale: Locale, siteUrl: string): Json {
  return { "@context": "https://schema.org", "@type": "WebSite", name: "Garmin", url: localizedUrl("/", locale, siteUrl), inLanguage: locale };
}
