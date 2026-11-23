// Owner 2026-11-23: product and variant pages get their own title, description, image and canonical.
import assert from "node:assert/strict";
import test from "node:test";
import { productPageSeo } from "../../src/lib/seo/product-metadata.ts";
import { buildAlternates } from "../../src/i18n/seo-core.js";

const variant = (sku, value, extra = {}) => ({
  id: sku, sku, name: value, options: { "case-size": "43 mm", color: value }, availability: "available",
  price: { selling: { currency: "KZT", amountMinor: "50000000" }, compareAt: null, usdEquivalent: null },
  gallery: [{ url: `/media/${sku}.jpg`, alt: value, width: null, height: null }],
  optionValues: [{ key: "case-size", name: "Размер корпуса", value: "43 mm" }, { key: "color", name: "Цвет", value }],
  ...extra,
});
const detail = (over = {}) => ({
  id: "p1", publicKey: "k", productCode: "1953727", name: "fēnix® 9 Pro", description: "Премиальные мультиспортивные смарт-часы.",
  family: "fēnix", image: null, badge: null, availability: "available", specs: [], features: [], inTheBox: [], gallery: [{ url: "/media/p.jpg", alt: "", width: null, height: null }],
  compatibleProductKeys: [], breadcrumb: [{ slug: "wearables-smartwatches", name: "Смарт-часы" }], translatedLocales: ["en", "ru"],
  price: { selling: { currency: "KZT", amountMinor: "50000000" }, compareAt: null, usdEquivalent: null },
  seo: { title: "fēnix® 9 Pro", description: "x", canonicalUrl: null, noIndex: false, image: null },
  variants: [variant("010-04336-00", "черный"), variant("010-04336-05", "белый")],
  ...over,
});

test("variant page: own path, title with its option values, own image, no canonical override", () => {
  const d = detail({ seo: { title: "x", description: "y", canonicalUrl: "https://elsewhere.test/a", noIndex: false, image: null } });
  const seo = productPageSeo({ detail: d, locale: "ru", variant: d.variants[0] });
  assert.equal(seo.path, "/p/1953727/010-04336-00");
  assert.match(seo.title, /черный/);
  assert.match(seo.title, /43 mm/);
  assert.equal(seo.image, "/media/010-04336-00.jpg");
  assert.equal(seo.canonicalOverride, undefined);
  assert.deepEqual(seo.indexedLocales, ["en", "ru"]);
  const { canonical, languages } = buildAlternates({ path: seo.path, locale: "ru", indexedLocales: seo.indexedLocales }, "https://garmin.tigr.uz");
  assert.match(canonical, /\/ru\/p\/1953727\/010-04336-00$/);
  assert.ok(Object.values(languages).every(url => url.endsWith("/p/1953727/010-04336-00")));
  assert.ok(seo.description.length >= 120 && seo.description.length <= 160);
});

test("product page: path /p/{code}, admin override wins, canonical override applies here only", () => {
  const d = detail({ seoOverride: { title: "Мой заголовок" }, seo: { title: "x", description: "y", canonicalUrl: "https://elsewhere.test/a", noIndex: false, image: null } });
  const seo = productPageSeo({ detail: d, locale: "ru" });
  assert.equal(seo.path, "/p/1953727");
  assert.equal(seo.title, "Мой заголовок");
  assert.equal(seo.canonicalOverride, "https://elsewhere.test/a");
  assert.equal(seo.image, "/media/p.jpg");
  const generated = productPageSeo({ detail: detail(), locale: "ru" });
  assert.notEqual(generated.title, "fēnix® 9 Pro", "without an override the title is generated, not the bare name");
  assert.doesNotMatch(generated.title, /®/);
});

test("variant override wins over the generated text", () => {
  const d = detail();
  d.variants[0] = variant("010-04336-00", "черный", { seo: { title: "Свой титул", description: "Своё описание" } });
  const seo = productPageSeo({ detail: d, locale: "ru", variant: d.variants[0] });
  assert.equal(seo.title, "Свой титул");
  assert.equal(seo.description, "Своё описание");
});

test("noIndex product: variant pages are noindex too", () => {
  const d = detail({ noIndex: true, seo: { title: "x", description: "y", canonicalUrl: null, noIndex: true, image: null } });
  assert.equal(productPageSeo({ detail: d, locale: "ru", variant: d.variants[1] }).noIndex, true);
});

test("variants whose generated titles collide get their SKU, so titles stay unique per page language", () => {
  const d = detail({ variants: [variant("A-1", "черный"), variant("A-2", "черный"), variant("A-3", "белый")] });
  const titles = d.variants.map(v => productPageSeo({ detail: d, locale: "ru", variant: v }).title);
  assert.equal(new Set(titles).size, 3);
  assert.match(titles[0], /A-1/);
  assert.match(titles[1], /A-2/);
  assert.doesNotMatch(titles[2], /A-3/);
  assert.ok(titles.every(t => t.length <= 60));
});

test("a page language that is not translated keeps English option values (generator input) and is not indexed by the caller", () => {
  const d = detail({ translatedLocales: ["en"] });
  assert.deepEqual(productPageSeo({ detail: d, locale: "kk", variant: d.variants[0] }).indexedLocales, ["en"]);
});
