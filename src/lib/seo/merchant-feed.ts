// Owner 2026-11-23: Google Merchant Center feed (/feeds/google/{en,ru,kz}.xml), one <item> per active variant of each
// indexable product, in the feed's language. Pure: the route handler loads the products and serves the XML.
import type { ProductDetailDTO, ProductDetailVariantDTO } from "../../contracts/commerce.ts";
import { localizedUrl, absoluteUrl } from "../../i18n/seo-core.js";
import { productPath } from "../catalog/product-url.ts";
import { minorToMajor } from "../money.ts";
import { seoKind } from "./generate.ts";
import { variantSeoText } from "./product-metadata.ts";

export type FeedLocale = "en" | "ru" | "kk";

export interface MerchantItem {
  productCode: string;
  sku: string;
  title: string;
  description: string;
  /** Absolute variant URL in the feed's language. */
  link: string;
  /** Absolute. */
  imageLink: string | null;
  /** Absolute, max 10. */
  additionalImageLinks: string[];
  /** KZT minor units. */
  priceMinor: string;
  salePriceMinor?: string;
  availability: "in_stock" | "out_of_stock";
  brand: string;
  gtin?: string;
  color?: string;
  size?: string;
  googleProductCategory: string;
  productType?: string;
}

/**
 * Google product taxonomy ids (taxonomy-with-ids.en-US.txt, version 2021-09-21). The taxonomy has no "Smart Watches"
 * node; smartwatches belong under Watches.
 */
export const GOOGLE_CATEGORY = {
  /** Apparel & Accessories > Jewelry > Watches */
  watch: "201",
  /** Apparel & Accessories > Jewelry > Watch Accessories > Watch Bands */
  watchBand: "5123",
  /** Apparel & Accessories > Jewelry > Watch Accessories */
  watchAccessory: "5122",
} as const;

const MAX_ADDITIONAL_IMAGES = 10;
const BAND_TOKENS = new Set(["band", "bands", "strap", "straps", "bracelet", "bracelets"]);
const COLOR = /^(?:colou?r|model[\s_-]*colou?r|цвет|түс)$/iu;
const SIZE = /^(?:case[\s_-]*size|size|размер|өлшем)$/iu;
// XML 1.0 forbids C0 controls except tab/newline/CR, plus U+FFFE/U+FFFF; DEL and C1 controls are discouraged.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F￾￿]/g;
const GTIN = /^(?:[0-9]{8}|[0-9]{12,14})$/;

function googleCategory(slugs: readonly string[]): string {
  if (seoKind(slugs) === "device") return GOOGLE_CATEGORY.watch;
  const band = slugs.some((slug) => slug.toLowerCase().replace(/smart[\s_-]+band/g, "smartband").split(/[^a-z0-9]+/).some((token) => BAND_TOKENS.has(token)));
  return band ? GOOGLE_CATEGORY.watchBand : GOOGLE_CATEGORY.watchAccessory;
}

function optionValue(variant: ProductDetailVariantDTO, pattern: RegExp): string | undefined {
  const values = variant.optionValues ?? Object.entries(variant.options).map(([key, value]) => ({ key, name: key, value }));
  const hit = values.find(({ key, name }) => pattern.test(key.trim()) || pattern.test(name.trim()));
  return hit?.value.trim() || undefined;
}

function isHigher(compareAt: string, selling: string): boolean {
  try {
    return BigInt(compareAt) > BigInt(selling);
  } catch {
    return false;
  }
}

/** The feed items of one product, read from its detail in the feed's language. Empty when the product is not indexable there. */
export function merchantItemsFor(detail: ProductDetailDTO, locale: FeedLocale, siteUrl: string): MerchantItem[] {
  if (detail.noIndex === true || detail.seo?.noIndex === true) return [];
  if (locale !== "en" && !(detail.translatedLocales ?? ["en"]).includes(locale)) return [];
  const crumbs = detail.breadcrumb ?? [];
  const googleProductCategory = googleCategory(crumbs.map((crumb) => crumb.slug));
  const productType = crumbs.map((crumb) => crumb.name.trim()).filter(Boolean).join(" > ") || undefined;
  const single = detail.variants.length === 1;
  return detail.variants
    .filter((variant) => variant.availability !== "unavailable")
    .map((variant) => {
      const text = variantSeoText(detail, variant, locale);
      // A product sold in one variant only is titled by its name, unless the admin stored a variant title.
      const title = single && !variant.seo?.title?.trim() ? detail.name : text.title;
      const images = [...new Set((variant.gallery?.length ? variant.gallery : detail.gallery).map((media) => media.url.trim()).filter(Boolean))].map((url) => absoluteUrl(url, siteUrl));
      const { selling, compareAt } = variant.price;
      const sale = compareAt && isHigher(compareAt.amountMinor, selling.amountMinor);
      const barcode = variant.barcode?.trim();
      const color = optionValue(variant, COLOR);
      const size = optionValue(variant, SIZE);
      return {
        productCode: detail.productCode,
        sku: variant.sku,
        title,
        description: text.description,
        link: localizedUrl(productPath(detail.productCode, variant.sku), locale, siteUrl),
        imageLink: images[0] ?? null,
        additionalImageLinks: images.slice(1, 1 + MAX_ADDITIONAL_IMAGES),
        priceMinor: sale ? compareAt.amountMinor : selling.amountMinor,
        ...(sale ? { salePriceMinor: selling.amountMinor } : {}),
        availability: variant.availability === "available" ? "in_stock" : "out_of_stock",
        brand: "Garmin",
        ...(barcode && GTIN.test(barcode) ? { gtin: barcode } : {}),
        ...(color ? { color } : {}),
        ...(size ? { size } : {}),
        googleProductCategory,
        ...(productType ? { productType } : {}),
      } satisfies MerchantItem;
    });
}

/** XML text: control characters removed, & < > " ' escaped. */
export function xmlText(value: string): string {
  return value
    .replace(CONTROL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const money = (minor: string): string => `${minorToMajor(minor)} KZT`;
const DESCRIPTION: Record<FeedLocale, string> = {
  en: "Garmin products for Google Merchant Center (English)",
  ru: "Товары Garmin для Google Merchant Center (русский)",
  kk: "Google Merchant Center үшін Garmin тауарлары (қазақша)",
};

function itemXml(item: MerchantItem): string {
  const fields: [string, string | undefined][] = [
    ["g:id", item.sku],
    ["g:item_group_id", item.productCode],
    ["g:title", item.title],
    ["g:description", item.description],
    ["g:link", item.link],
    ["g:image_link", item.imageLink ?? undefined],
    ...item.additionalImageLinks.slice(0, MAX_ADDITIONAL_IMAGES).map((url): [string, string] => ["g:additional_image_link", url]),
    ["g:availability", item.availability],
    ["g:price", money(item.priceMinor)],
    ["g:sale_price", item.salePriceMinor ? money(item.salePriceMinor) : undefined],
    ["g:brand", item.brand],
    ["g:gtin", item.gtin],
    ["g:mpn", item.sku],
    ["g:identifier_exists", "yes"],
    ["g:condition", "new"],
    ["g:color", item.color],
    ["g:size", item.size],
    ["g:google_product_category", item.googleProductCategory],
    ["g:product_type", item.productType],
  ];
  const body = fields.flatMap(([tag, value]) => (value === undefined ? [] : [`      <${tag}>${xmlText(value)}</${tag}>`]));
  return `    <item>\n${body.join("\n")}\n    </item>`;
}

/** RSS 2.0 Merchant feed (`g:` namespace) of `items` in `opts.locale`. */
export function buildMerchantFeed(items: readonly MerchantItem[], opts: { locale: FeedLocale; siteUrl: string; title: string }): string {
  const head = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
    `  <channel>`,
    `    <title>${xmlText(opts.title)}</title>`,
    `    <link>${xmlText(localizedUrl("/", opts.locale, opts.siteUrl))}</link>`,
    `    <description>${xmlText(DESCRIPTION[opts.locale])}</description>`,
  ];
  return [...head, ...items.map(itemXml), `  </channel>`, `</rss>`, ""].join("\n");
}
