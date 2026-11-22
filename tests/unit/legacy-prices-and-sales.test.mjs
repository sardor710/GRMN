// Task 5a.2 fix round 1: legacy JSON prices (USD-scale numbers with no currency) are converted to tenge in one
// place at the importer's KZT-per-USD rate; without a rate they stay as bare numbers (no ₸). Sales show on
// cards (PriceDTO.compareAt) and on backend PDPs (minor-unit strings).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { isLegacyUsdProduct, withStorefrontPrices, legacyAmountsInKzt } from "../../src/lib/legacy-prices.ts";
import * as legacyPrices from "../../src/lib/legacy-prices.ts";
import * as cardColors from "../../src/lib/catalog/card-colors.ts";
import { usdMajorToKztMajor, formatUnconverted, formatKzt } from "../../src/lib/money.ts";
import { catalogCardView } from "../../src/lib/public-catalog.ts";
import { componentFixture, nodeText, nodes } from "../helpers/component-fixture.mjs";
import * as commerceVariantModel from "../../src/lib/cms/commerce-variant-model.js";
import * as productVariants from "../../src/lib/cms/product-variants.js";
import * as variantSelection from "../../src/lib/catalog/variant-selection.ts";

const plain = value => value.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const legacy = { id: "1462801", currency: "USD", name: "Forerunner 970", sku: "", price: 749.99, originalPrice: 862.4884999999999, description: "", image: "", family: "Forerunner", category: "", subCategory: "", activities: [], level: "Premium", caseSize: "Medium", stock: 1, status: "published", specs: [], inTheBox: [], compatibleAccessories: [], createdAt: "" };
const imported = { ...legacy, currency: undefined, id: "prod-1", price: 224995, variants: [{ id: "v", sku: "V", title: "41 mm", selections: {}, price: 224995, originalPrice: 274995, stock: 1, status: "active", isDefault: true, imageIds: [], sourcePrice: { currency: "USD", list: 549.99, sale: 449.99, rateKztPerUsd: 500 } }] };

test("only records explicitly marked currency USD are legacy USD; a missing currency means tenge", () => {
  assert.equal(isLegacyUsdProduct(legacy), true, "seed records are marked by scripts/mark-legacy-usd-prices.mjs");
  assert.equal(isLegacyUsdProduct({ ...legacy, currency: "KZT" }), false, "an admin save stamps KZT");
  assert.equal(isLegacyUsdProduct({ ...legacy, currency: undefined }), false, "no currency is tenge, never multiplied by the rate");
  assert.equal(isLegacyUsdProduct(imported), false, "garmin.com imports are already tenge");
  const unmarked = withStorefrontPrices({ ...legacy, currency: undefined, price: 1350000 }, 500);
  assert.deepEqual([unmarked.price, unmarked.currency], [1350000, "KZT"]);
});

test("legacy USD amounts become tenge at the importer rate, exactly and half up", () => {
  assert.equal(usdMajorToKztMajor(749.99, 500), 374995);
  assert.equal(usdMajorToKztMajor("749.99", 450.5), 337870.5);
  assert.equal(usdMajorToKztMajor(0.01, 450.55), 4.51, "4.5055 rounds half up to 4.51");
  assert.equal(usdMajorToKztMajor(749.99, undefined), null);
  assert.equal(usdMajorToKztMajor(749.99, 0), null);
  assert.equal(usdMajorToKztMajor(749.99, Number.NaN), null);

  const converted = withStorefrontPrices({ ...legacy, variants: [{ ...imported.variants[0], sourcePrice: undefined, price: 749.99, originalPrice: undefined }] }, 500);
  assert.equal(converted.currency, "KZT");
  assert.equal(converted.price, 374995);
  assert.equal(converted.originalPrice, 431245, "862.49 at 500");
  assert.equal(converted.variants[0].price, 374995);
  assert.equal(plain(formatKzt({ major: converted.price }, "ru")), "374 995,00 ₸");

  const kept = withStorefrontPrices(imported, 500);
  assert.equal(kept.currency, "KZT");
  assert.equal(kept.price, 224995, "imported tenge is not converted again");
  assert.equal(kept.variants[0].price, 224995);

  const accessories = legacyAmountsInKzt([{ id: "a", price: 129.99 }], 500);
  assert.deepEqual(accessories, [{ id: "a", price: 64995, currency: "KZT" }]);
});

test("without a rate a legacy price stays a bare number with no currency sign, never a wrong tenge value", () => {
  const unconverted = withStorefrontPrices(legacy, undefined);
  assert.equal(unconverted.currency, "USD");
  assert.equal(unconverted.price, 749.99);
  assert.equal(plain(formatUnconverted({ major: unconverted.price }, "ru")), "749,99");
  assert.equal(plain(formatUnconverted({ major: unconverted.price }, "en")), "749.99");
  assert.doesNotMatch(formatUnconverted({ major: 749.99 }, "kk"), /₸|KZT|\$|USD/);
  assert.deepEqual(legacyAmountsInKzt([{ id: "a", price: 129.99 }], undefined), [{ id: "a", price: 129.99, currency: "USD" }]);
});

// products.ts is the one place that applies the conversion on the legacy read path.
function productsApi(provider) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync("src/lib/products.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", "console", code)(name => name.includes("cms/source") ? { cmsBackend: () => "legacy", ...provider } : name.includes("legacy-prices") ? legacyPrices : name.includes("card-colors") ? cardColors : name.includes("product-variants") ? { usesCmsDetail: () => false } : {}, exports, { error() {} });
  return exports;
}
test("legacy reads (cards, product, detail) carry tenge when the rate is set and bare numbers when it is not", async () => {
  const source = rate => ({ readLegacyKztPerUsd: async () => rate, readProduct: async () => legacy, readProductsPage: async () => ({ items: [legacy], nextCursor: null }) });
  const withRate = productsApi(source(500));
  const [card] = await withRate.getAllProducts();
  assert.deepEqual([card.price, card.currency], [374995, "KZT"]);
  assert.equal("compareAt" in card, false, "legacy seed originalPrice is a generated +15%, not a sale");
  const [importedCard] = await productsApi({ ...source(500), readProductsPage: async () => ({ items: [{ ...imported, originalPrice: 274995 }], nextCursor: null }) }).getAllProducts();
  assert.deepEqual([importedCard.price, importedCard.compareAt, importedCard.currency], [224995, 274995, "KZT"], "a real sale on a JSON-store card");
  assert.deepEqual([(await withRate.getProduct("1462801")).price, (await withRate.getProductDetail("1462801")).currency], [374995, "KZT"]);
  const fenix = productsApi({ ...source(500), readProduct: async () => ({ ...legacy, id: "1228429" }) });
  const detail = await fenix.getProductDetail("1228429");
  // M4.6: accessories come from product_compatibility (PostgreSQL); the legacy page offers no static USD accessories.
  assert.equal(detail.accessories, undefined, "no static accessories on the legacy page");
  assert.equal(detail.currency, "KZT");

  const noRate = productsApi(source(undefined));
  const [bare] = await noRate.getAllProducts();
  assert.deepEqual([bare.price, bare.currency], [749.99, "USD"]);
});

const priceModules = { "@/lib/money": { formatKzt, formatUnconverted, kztSaving: (await import("../../src/lib/money.ts")).kztSaving }, "@/lib/utils": { cn: (...c) => c.filter(Boolean).join(" ") } };

test("an unconverted price renders without a currency sign", () => {
  const fixture = componentFixture("src/components/ui/price.tsx", { modules: priceModules });
  assert.equal(plain(nodeText(fixture.render({ size: "card", locale: "ru", amount: { major: 749.99 }, unconverted: true }))), "749,99");
});

test("cards keep PriceDTO.compareAt and show the struck original before the bold sale price", () => {
  const view = catalogCardView({ id: "i", publicKey: "k", name: "Venu 4", description: "", image: null, badge: null, availability: "available", price: { selling: { amountMinor: "22499500", currency: "KZT" }, compareAt: { amountMinor: "27499500", currency: "KZT" }, usdEquivalent: null } }, "KZT", "en-US");
  assert.equal(view.compareAt, "274995.00");
  const none = catalogCardView({ id: "i", publicKey: "k", name: "X", description: "", image: null, badge: null, availability: "available", price: { selling: { amountMinor: "100", currency: "KZT" }, compareAt: null, usdEquivalent: null } }, "KZT", "en-US");
  assert.equal("compareAt" in none, false);

  const card = componentFixture("src/components/ProductCard.tsx", { modules: { "next/image": { default: () => null }, "@/i18n/navigation": { Link: props => ({ type: "a", props }) } } });
  const tree = card.render({ product: { ...view, image: "" } });
  const price = nodes(tree).find(n => n.props?.["data-price"] === "card");
  assert.ok(price, "card price rendered through <Price size=card>");
  assert.equal(plain(nodeText(price)), "KZT 274,995.00 KZT 224,995.00");
  const original = nodes(price).find(n => "data-price-original" in (n.props ?? {}));
  assert.match(original.props.className, /line-through/);
  assert.doesNotMatch(JSON.stringify(nodes(price).map(n => n.props?.className ?? "")), /red/);
});

test("a backend PDP shows its sale from variant.price.compareAt, compared as minor units", () => {
  const variantModules = { "@/components/product/ProductVariantContext": { useProductVariant: () => ({ selectedVariantId: "a", setSelectedVariantId() {} }) }, "@/lib/catalog/variant-selection": variantSelection };
  const fixture = componentFixture("src/components/ProductTop.tsx", { modules: { ...variantModules, "@/lib/cart": { useCart: () => ({ add() {} }) }, "@/lib/public-catalog": { minorToMajor: v => (BigInt(v) / 100n) + "." + String(BigInt(v) % 100n).padStart(2, "0"), catalogPriceLabel: () => "label" }, "@/lib/cms/commerce-variant-model": commerceVariantModel, "@/lib/cms/product-variants": productVariants } });
  // Above 2^53 minor units: a Number comparison could not tell these apart reliably; minor-unit BigInt does.
  const commerce = { selectedVariantId: "a", variants: [{ id: "a", sku: "A", name: "Base", options: {}, availability: "available", price: { selling: { amountMinor: "9007199254740993", currency: "KZT" }, compareAt: { amountMinor: "9007199254740995", currency: "KZT" } }, gallery: [] }] };
  const tree = fixture.render({ product: { id: "p", title: "Model", price: "90071992547409.93", priceLabel: "label", currency: "KZT", purchasable: false, breadcrumb: [], gallery: [], caseSizes: [], versions: [], colors: [], commerce } });
  const price = nodes(tree).find(n => n.props?.["data-price"] === "pdp");
  assert.ok(price);
  assert.equal(plain(nodeText(price)), "KZT 90,071,992,547,409.95 Save KZT 0.02 KZT 90,071,992,547,409.93");
  assert.match(plain(nodeText(tree)), /\bSale\b/, "the Sale pill shows when there is no stored badge");

  const regular = fixture.render({ product: { id: "p", title: "Model", price: "1.00", currency: "KZT", purchasable: false, breadcrumb: [], gallery: [], caseSizes: [], versions: [], colors: [], commerce: { ...commerce, variants: [{ ...commerce.variants[0], price: { selling: { amountMinor: "100", currency: "KZT" }, compareAt: null } }] } } });
  assert.equal(plain(nodeText(nodes(regular).find(n => n.props?.["data-price"] === "pdp"))), "KZT 1.00", "no compareAt, no sale");
});
