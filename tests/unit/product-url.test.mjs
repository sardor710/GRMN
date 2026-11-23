// Owner 2026-11-23: garmin.com-style product URLs — /p/{code} and /p/{code}/{sku}.
import assert from "node:assert/strict";
import test from "node:test";
import { isProductCode, parseProductPath, productPath } from "../../src/lib/catalog/product-url.ts";

test("productPath builds the product and variant paths, encoding the SKU", () => {
  assert.equal(productPath("1953727"), "/p/1953727");
  assert.equal(productPath("1953727", "010-04336-00"), "/p/1953727/010-04336-00");
  assert.equal(productPath("1953727", null), "/p/1953727");
  assert.equal(productPath("1", "A/B C"), "/p/1/A%2FB%20C");
});

test("parseProductPath reads locale, key and sku", () => {
  assert.deepEqual(parseProductPath("/ru/p/1953727/010-04336-00"), { locale: "ru", key: "1953727", sku: "010-04336-00" });
  assert.deepEqual(parseProductPath("/p/28c9f52f-38ad-45c4-8d5e-9be6f3906cfd"), { locale: null, key: "28c9f52f-38ad-45c4-8d5e-9be6f3906cfd", sku: null });
  assert.deepEqual(parseProductPath("/kz/p/1/A%2FB%20C"), { locale: "kz", key: "1", sku: "A/B C" });
  assert.deepEqual(parseProductPath("/en/p/1953727/"), { locale: "en", key: "1953727", sku: null });
  assert.equal(parseProductPath("/ru/c/watches"), null);
  assert.equal(parseProductPath("/ru/p/1/2/3"), null);
});

test("isProductCode accepts 1-12 digits only", () => {
  assert.equal(isProductCode("0123"), true);
  assert.equal(isProductCode("1953727"), true);
  assert.equal(isProductCode("garmin-1"), false);
  assert.equal(isProductCode("1234567890123"), false);
  assert.equal(isProductCode(""), false);
});
