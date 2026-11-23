// Owner 2026-11-23: Google's product variant structured data — a ProductGroup on /p/{code} with every variant as a
// Product with its own URL, and that variant's Product (isVariantOf the group) on /p/{code}/{sku}.
import assert from "node:assert/strict";
import test from "node:test";
import { productGroupJsonLd, variantProductJsonLd, organizationJsonLd, websiteJsonLd } from "../../src/lib/seo/product-jsonld.ts";

const SITE = "https://garmin.tigr.uz";
const money = (selling, compareAt) => ({ selling: { currency: "KZT", amountMinor: selling }, compareAt: compareAt ? { currency: "KZT", amountMinor: compareAt } : null, usdEquivalent: null });
const variant = (sku, color, extra = {}) => ({
  id: sku, sku, name: color, options: { "case-size": "43 mm", "model-color": color, edition: "Pro" }, availability: "available", price: money("18999000"),
  gallery: [{ url: `/media/${sku}.jpg`, alt: color, width: null, height: null }],
  optionValues: [{ key: "case-size", name: "Размер корпуса", value: "43 mm" }, { key: "model-color", name: "Модель/Цвет", value: color }, { key: "edition", name: "Издание", value: "Pro" }],
  ...extra,
});
const detail = () => ({
  id: "p1", publicKey: "k", productCode: "1953727", name: "fēnix® 9 Pro", description: "Смарт-часы.", family: "fēnix", image: null, badge: null,
  availability: "available", specs: [], features: [], inTheBox: [], gallery: [], compatibleProductKeys: [], translatedLocales: ["en", "ru"],
  breadcrumb: [{ slug: "wearables-smartwatches", name: "Смарт-часы" }], price: money("18999000"),
  options: [{ key: "case-size", name: "Case Size" }, { key: "model-color", name: "Model/Color" }, { key: "edition", name: "Edition" }],
  variants: [
    variant("010-04336-00", "черный", { barcode: "0753759000000" }),
    variant("010-04336-05", "белый", { availability: "out_of_stock", price: money("17999000", "18999000") }),
    variant("010-04336-09", "серый", { availability: "unavailable" }),
  ],
});

test("product page: ProductGroup with productGroupID, variesBy and one Product per variant on sale", () => {
  const ld = productGroupJsonLd(detail(), "ru", SITE);
  assert.equal(ld["@type"], "ProductGroup");
  assert.equal(ld.productGroupID, "1953727");
  assert.equal(ld.url, "https://garmin.tigr.uz/ru/p/1953727");
  assert.deepEqual(ld.variesBy, ["https://schema.org/size", "https://schema.org/color"]);
  assert.equal(ld.brand.name, "Garmin");
  assert.equal(ld.hasVariant.length, 2, "an unavailable variant is not listed");
  const [first, second] = ld.hasVariant;
  assert.equal(first["@type"], "Product");
  assert.equal(first.url, "https://garmin.tigr.uz/ru/p/1953727/010-04336-00");
  assert.equal(first.sku, "010-04336-00");
  assert.equal(first.mpn, "010-04336-00");
  assert.equal(first.gtin, "0753759000000");
  assert.equal(second.gtin, undefined);
  assert.equal(first.color, "черный");
  assert.equal(first.size, "43 mm");
  assert.deepEqual(first.additionalProperty, [{ "@type": "PropertyValue", name: "Издание", value: "Pro" }]);
  assert.equal(first.image[0], "https://garmin.tigr.uz/media/010-04336-00.jpg");
  assert.deepEqual(first.offers, { "@type": "Offer", url: first.url, price: "189990.00", priceCurrency: "KZT", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition" });
  assert.equal(second.offers.availability, "https://schema.org/OutOfStock");
  assert.equal(second.offers.price, "179990.00");
  assert.doesNotMatch(ld.name, /®/);
});

test("variant page: that variant's Product, isVariantOf the group", () => {
  const d = detail();
  const ld = variantProductJsonLd(d, d.variants[1], "kk", SITE);
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.url, "https://garmin.tigr.uz/kz/p/1953727/010-04336-05");
  assert.equal(ld.isVariantOf["@type"], "ProductGroup");
  assert.equal(ld.isVariantOf.productGroupID, "1953727");
  assert.equal(ld.isVariantOf.url, "https://garmin.tigr.uz/kz/p/1953727");
  assert.equal(ld.inLanguage, "kk");
});

test("site: Organization and WebSite", () => {
  assert.deepEqual(organizationJsonLd(SITE), { "@context": "https://schema.org", "@type": "Organization", name: "Garmin", url: SITE, logo: `${SITE}/seo/apple-touch-icon.png` });
  const site = websiteJsonLd("ru", SITE);
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.url, `${SITE}/ru`);
  assert.equal(site.inLanguage, "ru");
});
