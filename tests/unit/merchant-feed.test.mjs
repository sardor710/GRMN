// Owner 2026-11-23: Google Merchant Center feed, one per storefront language, one <item> per active variant.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildMerchantFeed, merchantItemsFor } from "../../src/lib/seo/merchant-feed.ts";

const SITE = "https://garmin.tigr.uz";
const price = (selling, compareAt = null) => ({
  selling: { currency: "KZT", amountMinor: selling },
  compareAt: compareAt ? { currency: "KZT", amountMinor: compareAt } : null,
  usdEquivalent: null,
});
const variant = (sku, value, extra = {}) => ({
  id: sku, sku, name: value, options: { "case-size": "43 mm", color: value }, availability: "available",
  price: price("18999000"),
  gallery: [{ url: `/media/${sku}.jpg`, alt: value, width: null, height: null }, { url: `/media/${sku}-2.jpg`, alt: value, width: null, height: null }],
  optionValues: [{ key: "case-size", name: "Размер корпуса", value: "43 мм" }, { key: "color", name: "Цвет", value }],
  ...extra,
});
const detail = (over = {}) => ({
  id: "p1", publicKey: "k", productCode: "1953727", name: "fēnix® 9 Pro", description: "Премиальные мультиспортивные смарт-часы.",
  family: "fēnix", image: null, badge: null, availability: "available", specs: [], features: [], inTheBox: [],
  gallery: [{ url: "/media/p.jpg", alt: "", width: null, height: null }],
  compatibleProductKeys: [], breadcrumb: [{ slug: "wearables", name: "Носимые устройства" }, { slug: "wearables-smartwatches", name: "Смарт-часы" }],
  translatedLocales: ["en", "ru"],
  price: price("18999000"),
  seo: { title: "fēnix® 9 Pro", description: "x", canonicalUrl: null, noIndex: false, image: null },
  variants: [
    variant("010-04336-00", "черный", { barcode: "0753759345678" }),
    variant("010-04336-05", "белый", { availability: "out_of_stock", price: price("17999000", "18999000") }),
    variant("010-04336-09", "серый", { availability: "unavailable" }),
  ],
  ...over,
});

/** The text of `<tag>` inside one item, or undefined. */
const field = (xml, tag) => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
const items = (xml) => xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

/** Strict enough well-formedness check: balanced tags, no stray `<`, and `&` only as an entity. */
function assertWellFormed(xml) {
  const lint = spawnSync("xmllint", ["--noout", "-"], { input: xml, encoding: "utf8" });
  if (!lint.error) {
    assert.equal(lint.status, 0, `xmllint: ${lint.stderr}`);
    return;
  }
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  const stack = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    const text = body.slice(last, m.index);
    assert.doesNotMatch(text, /</, `stray < before ${m[0]}`);
    assert.doesNotMatch(text, /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i, `bare & in "${text}"`);
    if (m[1]) assert.equal(stack.pop(), m[2], `unbalanced </${m[2]}>`);
    else if (!m[4]) stack.push(m[2]);
    last = tag.lastIndex;
  }
  assert.equal(body.slice(last).trim(), "", "trailing content");
  assert.deepEqual(stack, [], "unclosed tags");
}

test("one item per available or out-of-stock variant; unavailable is skipped", () => {
  const list = merchantItemsFor(detail(), "ru", SITE);
  assert.deepEqual(list.map((i) => i.sku), ["010-04336-00", "010-04336-05"]);
  const xml = buildMerchantFeed(list, { locale: "ru", siteUrl: SITE, title: "Garmin Казахстан" });
  assert.equal(items(xml).length, 2);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2.0" xmlns:g="http:\/\/base.google.com\/ns\/1.0">/);
  assert.match(xml, /<channel>\s*<title>Garmin Казахстан<\/title>\s*<link>https:\/\/garmin.tigr.uz\/ru<\/link>\s*<description>[^<]+<\/description>/);
  assertWellFormed(xml);
});

test("id, item group, localized variant link (kk under /kz)", () => {
  const [first] = items(buildMerchantFeed(merchantItemsFor(detail(), "ru", SITE), { locale: "ru", siteUrl: SITE, title: "t" }));
  assert.equal(field(first, "g:id"), "010-04336-00");
  assert.equal(field(first, "g:item_group_id"), "1953727");
  assert.equal(field(first, "g:link"), "https://garmin.tigr.uz/ru/p/1953727/010-04336-00");
  const kk = merchantItemsFor(detail({ translatedLocales: ["en", "ru", "kk"] }), "kk", SITE);
  assert.equal(kk[0].link, "https://garmin.tigr.uz/kz/p/1953727/010-04336-00");
  assert.equal(merchantItemsFor(detail(), "en", SITE)[0].link, "https://garmin.tigr.uz/en/p/1953727/010-04336-00");
});

test("title and description come from the variant's SEO text; images absolute, variant first", () => {
  const [item] = merchantItemsFor(detail(), "ru", SITE);
  assert.match(item.title, /черный/);
  assert.ok(item.description.length > 0);
  assert.equal(item.imageLink, "https://garmin.tigr.uz/media/010-04336-00.jpg");
  assert.deepEqual(item.additionalImageLinks, ["https://garmin.tigr.uz/media/010-04336-00-2.jpg"]);
  const many = detail({ variants: [variant("A-1", "черный", { gallery: Array.from({ length: 14 }, (_, n) => ({ url: `https://cdn.test/${n}.jpg`, alt: "", width: null, height: null })) })] });
  const [only] = merchantItemsFor(many, "ru", SITE);
  assert.equal(only.imageLink, "https://cdn.test/0.jpg");
  assert.equal(only.additionalImageLinks.length, 10);
  assert.equal(only.title, "fēnix® 9 Pro", "a single-variant product is titled by its name");
});

test("price in KZT with two decimals; a sale shows compareAt as price and selling as sale_price", () => {
  const xml = buildMerchantFeed(merchantItemsFor(detail(), "ru", SITE), { locale: "ru", siteUrl: SITE, title: "t" });
  const [regular, sale] = items(xml);
  assert.equal(field(regular, "g:price"), "189990.00 KZT");
  assert.equal(field(regular, "g:sale_price"), undefined);
  assert.equal(field(sale, "g:price"), "189990.00 KZT");
  assert.equal(field(sale, "g:sale_price"), "179990.00 KZT");
});

test("availability, brand, mpn, condition, identifier_exists; gtin only with a barcode", () => {
  const [inStock, outOfStock] = items(buildMerchantFeed(merchantItemsFor(detail(), "ru", SITE), { locale: "ru", siteUrl: SITE, title: "t" }));
  assert.equal(field(inStock, "g:availability"), "in_stock");
  assert.equal(field(outOfStock, "g:availability"), "out_of_stock");
  for (const item of [inStock, outOfStock]) {
    assert.equal(field(item, "g:brand"), "Garmin");
    assert.equal(field(item, "g:mpn"), field(item, "g:id"));
    assert.equal(field(item, "g:condition"), "new");
    assert.equal(field(item, "g:identifier_exists"), "yes");
  }
  assert.equal(field(inStock, "g:gtin"), "0753759345678");
  assert.equal(field(outOfStock, "g:gtin"), undefined);
});

test("color and size come from the localized option values", () => {
  const [item] = merchantItemsFor(detail(), "ru", SITE);
  assert.equal(item.color, "черный");
  assert.equal(item.size, "43 мм");
  const kk = merchantItemsFor(detail({
    translatedLocales: ["en", "ru", "kk"],
    variants: [variant("B-1", "қара", { optionValues: [{ key: "model-color", name: "Түс", value: "қара" }, { key: "x", name: "Өлшем", value: "47 мм" }] })],
  }), "kk", SITE);
  assert.equal(kk[0].color, "қара");
  assert.equal(kk[0].size, "47 мм");
});

test("category from the breadcrumb kind; product type is the breadcrumb names", () => {
  const [watch] = merchantItemsFor(detail(), "ru", SITE);
  assert.equal(watch.googleProductCategory, "201");
  assert.equal(watch.productType, "Носимые устройства > Смарт-часы");
  const band = merchantItemsFor(detail({ breadcrumb: [{ slug: "accessories", name: "Аксессуары" }, { slug: "bands", name: "Ремешки" }] }), "ru", SITE);
  assert.equal(band[0].googleProductCategory, "5123");
  const charger = merchantItemsFor(detail({ breadcrumb: [{ slug: "accessories", name: "Аксессуары" }, { slug: "chargers", name: "Зарядка" }] }), "ru", SITE);
  assert.equal(charger[0].googleProductCategory, "5122");
  const smartBand = merchantItemsFor(detail({ breadcrumb: [{ slug: "smart-band", name: "Фитнес-браслеты" }] }), "ru", SITE);
  assert.equal(smartBand[0].googleProductCategory, "201");
});

test("XML special characters are escaped and control characters stripped; the feed parses", () => {
  const d = detail({ variants: [variant("C&<1>", "черный", { seo: { title: `Tom & Jerry <b>"x"</b> 'y'\u0007`, description: "a < b & c > d" } }), variant("X-2", "белый")] });
  const xml = buildMerchantFeed(merchantItemsFor(d, "ru", SITE), { locale: "ru", siteUrl: SITE, title: "A & B" });
  assert.match(xml, /<g:title>Tom &amp; Jerry &lt;b&gt;&quot;x&quot;&lt;\/b&gt; &apos;y&apos;<\/g:title>/);
  assert.match(xml, /<g:description>a &lt; b &amp; c &gt; d<\/g:description>/);
  assert.match(xml, /<g:id>C&amp;&lt;1&gt;<\/g:id>/);
  assert.match(xml, /<g:link>https:\/\/garmin.tigr.uz\/ru\/p\/1953727\/C%26%3C1%3E<\/g:link>/);
  assert.match(xml, /<title>A &amp; B<\/title>/);
  assert.doesNotMatch(xml, /\u0007/);
  assertWellFormed(xml);
});

test("an empty feed is a valid channel", () => {
  const xml = buildMerchantFeed([], { locale: "kk", siteUrl: SITE, title: "Garmin" });
  assert.equal(items(xml).length, 0);
  assert.match(xml, /<link>https:\/\/garmin.tigr.uz\/kz<\/link>/);
  assertWellFormed(xml);
});

test("noIndex products and untranslated locales give no items", () => {
  assert.deepEqual(merchantItemsFor(detail({ noIndex: true }), "ru", SITE), []);
  assert.deepEqual(merchantItemsFor(detail({ seo: { title: "x", description: "y", canonicalUrl: null, noIndex: true, image: null } }), "en", SITE), []);
  assert.deepEqual(merchantItemsFor(detail(), "kk", SITE), []);
  assert.equal(merchantItemsFor(detail({ translatedLocales: undefined }), "en", SITE).length, 2, "en is always included");
});

test("review fix: titles carry no store call-to-action; descriptions are the product text, not 'Buy …'", () => {
  for (const locale of ["en", "ru", "kk"]) {
    for (const item of merchantItemsFor(detail({ translatedLocales: ["en", "ru", "kk"] }), locale, SITE)) {
      assert.doesNotMatch(item.title, /Buy in Kazakhstan|купить в Казахстане|сатып алу/i);
      assert.doesNotMatch(item.description, /^(Buy|Купить|Сатып)/i);
    }
  }
  const [item] = merchantItemsFor(detail(), "ru", SITE);
  assert.match(item.description, /Премиальные мультиспортивные смарт-часы/);
  assert.match(item.description, /черный/);
});

test("review fix: a canonical-URL override keeps the product out of the feed; a single variant links to the product page", () => {
  assert.deepEqual(merchantItemsFor(detail({ seo: { title: "x", description: "y", canonicalUrl: "https://elsewhere.test/x", noIndex: false, image: null } }), "ru", SITE), []);
  const [only] = merchantItemsFor(detail({ variants: [variant("A-1", "черный")] }), "ru", SITE);
  assert.equal(only.link, "https://garmin.tigr.uz/ru/p/1953727");
});
