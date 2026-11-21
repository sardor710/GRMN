// M2: the PostgreSQL product command is a strict superset of the legacy CMSProduct payload.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { productCommandSchema, parseProductCommand } from "../../src/server/cms/product-command.ts";
import { productInput } from "../../src/server/auth/admin-schemas.ts";
import { parseGarminProduct } from "../../src/lib/import/garmin-parse.js";

const simple = extra => ({ name: "Synthetic band", sku: "SYN-BAND-1", price: "12500.50", status: "draft", ...extra });
const ok = raw => { const result = parseProductCommand(raw); assert.ok(result.ok, result.ok ? "" : result.message); return result.command; };
const bad = (raw, pattern) => { const result = parseProductCommand(raw); assert.equal(result.ok, false, "expected a rejection"); if (pattern) assert.match(result.message, pattern); };

test("every legacy data.json product and every legacy-valid payload parses (superset)", () => {
  const data = JSON.parse(readFileSync(new URL("../../src/lib/cms/data.json", import.meta.url), "utf8"));
  assert.ok(data.products.length > 0);
  // One deliberate narrowing: money must be exact (≤ 2 decimals). The legacy JSON schema accepted floats
  // such as 919.9884999999999; the dev importer rounds those (with a warning) before they reach PostgreSQL.
  const subCent = value => typeof value === "number" && Math.round(value * 100) / 100 !== value;
  let checked = 0;
  for (const product of data.products) {
    const legacy = productInput.safeParse(Object.fromEntries(Object.entries(product).filter(([k]) => k !== "createdAt")));
    if (!legacy.success) continue; // the legacy schema itself rejects it; superset only promises what it accepts
    const result = parseProductCommand(product);
    const inexact = [product.price, product.originalPrice, ...(product.variants ?? []).flatMap(v => [v.price, v.originalPrice])].some(subCent);
    if (inexact) {
      assert.equal(result.ok, false); assert.match(result.message, /exact KZT/);
      // Rounded to cents (what the importer stores), the same product is accepted: money is the only narrowing.
      const cents = value => typeof value === "number" ? Math.round(value * 100) / 100 : value;
      const rounded = { ...product, price: cents(product.price), originalPrice: cents(product.originalPrice), ...(product.variants ? { variants: product.variants.map(v => ({ ...v, price: cents(v.price), originalPrice: cents(v.originalPrice) })) } : {}) };
      const again = parseProductCommand(rounded);
      assert.ok(again.ok, `${product.id}: ${again.ok ? "" : again.message}`);
    } else assert.ok(result.ok, `${product.id}: ${result.ok ? "" : result.message}`);
    checked++;
  }
  assert.ok(checked > 0);
  // Products the legacy schema rejects for >200 specs (garmin.com imports) are accepted here.
  assert.ok(data.products.filter(p => (p.specs ?? []).length > 200).every(p => parseProductCommand(p).ok));
});

test("the garmin.com import draft (fēnix 9 fixture) validates against the command schema", () => {
  const html = readFileSync(new URL("../fixtures/garmin/fenix9.html", import.meta.url), "utf8");
  const { product } = parseGarminProduct(html, { sourceUrl: "https://www.garmin.com/en-US/p/1953453", rateKztPerUsd: 500, now: "2026-11-21T00:00:00.000Z" });
  const command = ok(product);
  assert.ok(command.variants.length >= 30);
  assert.ok(command.options.length >= 2);
  assert.equal(command.price, String(product.price * 100));
  for (const name of ["venu4", "edge1060"]) {
    const draft = parseGarminProduct(readFileSync(new URL(`../fixtures/garmin/${name}.html`, import.meta.url), "utf8"), { sourceUrl: "https://www.garmin.com/en-US/p/1", rateKztPerUsd: 500 }).product;
    ok(draft);
  }
});

test("money is exact KZT converted to minor units; floats, exponents and >2 decimals are rejected", () => {
  assert.equal(ok(simple({ price: "12500.5" })).price, "1250050");
  assert.equal(ok(simple({ price: 649995 })).price, "64999500");
  assert.equal(ok(simple({ originalPrice: null })).originalPrice, null);
  for (const price of ["1e3", "1.234", -1, "abc", Number.NaN]) bad(simple({ price }));
});

test("unknown fields are rejected while read-only echoes from the read API are accepted", () => {
  bad(simple({ password: "x" }), /Unknown fields: password/);
  bad(simple({ variants: [{ id: "v", sku: "S", price: 1, secret: 1 }] }));
  const command = ok(simple({ currency: "KZT", stockManaged: true, createdAt: "2026-01-01", compatibleDevices: [{ productKey: "x" }], stockAvailable: 3, primaryCategory: { key: "bands" } }));
  assert.equal(command.sku, "SYN-BAND-1");
  ok(simple({ variants: [{ id: "v1", sku: "S-1", price: 1, stock: 2, stockReserved: 1, stockAvailable: 1, version: 3, thumbnail: "/x.jpg" }] }));
});

test("a product without variants needs a SKU and a price; variant products do not", () => {
  bad({ name: "No sku", price: 1 }, /SKU/);
  bad({ name: "No price", sku: "X" }, /price/);
  ok({ name: "Variant product", options: [], variants: [{ id: "v1", sku: "V-1", price: 10, status: "active", isDefault: true }] });
  bad({ name: "Blank variant sku", variants: [{ id: "v1", sku: "  ", price: 10 }] }, /SKU/);
});

test("categories need exactly one primary when given, and no duplicates", () => {
  assert.deepEqual(ok(simple({ categories: [] })).categories, []);
  assert.deepEqual(ok(simple({ categories: [{ key: "bands", primary: true }, { key: "quickfit-22" }] })).categories, [{ key: "bands", primary: true }, { key: "quickfit-22", primary: false }]);
  bad(simple({ categories: [{ key: "bands" }] }), /exactly one/);
  bad(simple({ categories: [{ key: "bands", primary: true }, { key: "x", primary: true }] }), /exactly one/);
  bad(simple({ categories: [{ key: "bands", primary: true }, { key: "BANDS" }] }), /twice/);
});

test("in the box allows an empty list, plain strings and {label,image} objects only", () => {
  assert.deepEqual(ok(simple({ inTheBox: [] })).inTheBox, []);
  assert.deepEqual(ok(simple({ inTheBox: ["Device", { label: "Cable", image: "/uploads/cable.jpg" }] })).inTheBox, ["Device", { label: "Cable", image: "/uploads/cable.jpg" }]);
  bad(simple({ inTheBox: [{ label: "Cable", extra: 1 }] }));
  bad(simple({ inTheBox: [{ label: " " }] }));
  bad(simple({ inTheBox: [""] }));
});

test("swatch colors are #rgb or #rrggbb; option display defaults to buttons", () => {
  const command = ok({ name: "Swatch", options: [{ id: "o", key: "color", name: "Color", values: [{ id: "a", key: "black", label: "Black", swatchColor: "#ABC" }] }], variants: [{ id: "v", sku: "SW-1", price: 1, selections: { o: "a" } }] });
  assert.equal(command.options[0].display, "buttons");
  bad({ name: "Swatch", options: [{ id: "o", key: "color", name: "Color", display: "swatch", values: [{ id: "a", key: "black", label: "Black", swatchColor: "#11223344" }] }], variants: [{ id: "v", sku: "SW-1", price: 1 }] }, /hex/);
  bad({ name: "Swatch", options: [{ id: "o", key: "color", name: "Color", display: "grid", values: [] }], variants: [{ id: "v", sku: "SW-1", price: 1 }] });
});

test("compatibility and relations have strict shapes with defaults", () => {
  const command = ok(simple({ compatibility: { devices: [{ productKey: "fenix-8", optionValueKeys: ["51 mm"] }, { productKey: "fr-965" }], accessories: [{ productKey: "band-1", accessoryVariantSku: null }] }, relations: { related: ["a", "b"], upsell: [] } }));
  assert.deepEqual(command.compatibility.devices[1], { productKey: "fr-965", optionValueKeys: [], variantSkus: [] });
  bad(simple({ compatibility: { devices: [{ productKey: "x", optionValueIds: [] }] } }));
  bad(simple({ compatibility: { other: [] } }));
  bad(simple({ relations: { related: ["a", "a"] } }), /twice/);
  bad(simple({ relations: { similar: [] } }));
});

test("variant stock and baselines are non-negative integers", () => {
  ok(simple({ stock: 0, stockBaseline: 4 }));
  bad(simple({ stock: -1 }));
  bad(simple({ stock: 1.5 }));
  bad({ name: "V", variants: [{ id: "v", sku: "S", price: 1, stock: -2 }] });
});

test("the schema object stays strict at the top level", () => {
  assert.equal(productCommandSchema.safeParse({ ...simple(), unknownKey: true }).success, false);
});
