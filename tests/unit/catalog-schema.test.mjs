import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns } from "drizzle-orm";
import { products, productVariants, prices } from "../../src/server/db/schema/catalog.ts";
import { mediaAssets } from "../../src/server/db/schema/media.ts";

test("catalog defaults keep drafts unpublished and preserve original keys/content", () => {
  const product = getTableColumns(products);
  assert.equal(product.publicKey.notNull, true);
  assert.equal(product.status.default, "draft");
  assert.ok(product.legacyContent);
  assert.equal(getTableColumns(productVariants).status.default, "draft");
});

test("money and media sizes use bigint and keep new storage private by default", () => {
  assert.equal(getTableColumns(prices).amountMinor.dataType, "bigint");
  assert.equal(getTableColumns(prices).currency.default, "KZT");
  assert.equal(getTableColumns(mediaAssets).byteSize.dataType, "bigint");
  assert.equal(getTableColumns(mediaAssets).visibility.default, "private");
  assert.equal(getTableColumns(mediaAssets).status.default, "pending");
});

test("product code is required, unique and defaulted (public URL /p/{code}, 0029)", () => {
  const product = getTableColumns(products);
  assert.equal(product.productCode.notNull, true);
  assert.equal(product.productCode.hasDefault, true);
  assert.equal(product.productCode.name, "product_code");
});
