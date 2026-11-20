// Task 2.4: the product page's selected variant (initial variant from `?variant=<sku>`, URL writes) and the
// content the Specs, Overview and In the box tabs show for it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  VARIANT_PARAM,
  ownsEmptyOverview,
  resolveInitialVariantId,
  variantParam,
  variantTabContent,
  withVariantParam,
} from "../../src/lib/catalog/variant-selection.ts";

const variants = [
  { id: "v47", sku: "010-47MM" },
  { id: "v51", sku: "010-51MM" },
];

test("a known SKU (any case, padded) selects its variant", () => {
  assert.equal(resolveInitialVariantId(variants, "010-51mm", "v47"), "v51");
  assert.equal(resolveInitialVariantId(variants, "  010-51MM ", "v47"), "v51");
});

test("an unknown, archived (not listed) or missing SKU falls back to the default variant", () => {
  assert.equal(resolveInitialVariantId(variants, "ARCHIVED-SKU", "v51"), "v51");
  assert.equal(resolveInitialVariantId(variants, undefined, "v51"), "v51");
  assert.equal(resolveInitialVariantId(variants, "", "v51"), "v51");
});

test("without a usable default the first variant is used, and no variants gives an empty id", () => {
  assert.equal(resolveInitialVariantId(variants, "nope", "gone"), "v47");
  assert.equal(resolveInitialVariantId(variants, "nope"), "v47");
  assert.equal(resolveInitialVariantId([], "010-51MM"), "");
});

test("variantParam reads the first ?variant= value", () => {
  assert.equal(VARIANT_PARAM, "variant");
  assert.equal(variantParam({ variant: "010-51MM" }), "010-51MM");
  assert.equal(variantParam({ variant: ["A", "B"] }), "A");
  assert.equal(variantParam({ variant: "  " }), undefined);
  assert.equal(variantParam({}), undefined);
});

test("withVariantParam keeps the path, other parameters and the hash", () => {
  assert.equal(withVariantParam("http://x.test/en/p/k?utm=1#specs", "010-51MM"), "http://x.test/en/p/k?utm=1&variant=010-51MM#specs");
  assert.equal(withVariantParam("http://x.test/en/p/k?variant=OLD", "NEW"), "http://x.test/en/p/k?variant=NEW");
});

const content = (specs, inTheBox, overviewHtml = "", specGroups = []) => ({ specs, specGroups, overviewHtml, inTheBox });
const product = {
  specs: [{ label: "Lens", value: "Glass" }],
  inTheBox: ["Watch"],
  overviewHtml: "<p>Product</p>",
  commerce: {
    specs: [{ label: "Lens", value: "Glass" }],
    inTheBox: ["Watch"],
    overviewHtml: "<p>Product</p>",
    variants: [
      { id: "v47", sku: "010-47MM", content: content([{ label: "Size", value: "47 mm" }], ["Watch 47", "Cable"], "<p>47</p>"), ownsOverview: true },
      { id: "v51", sku: "010-51MM", content: content([{ label: "Size", value: "51 mm" }], [], "", [{ title: "Physical", items: [{ label: "Size", value: "51 mm" }] }]), ownsOverview: true },
    ],
  },
};

test("the tabs show the selected variant's own content", () => {
  assert.deepEqual(variantTabContent(product, "v47"), {
    specs: [{ label: "Size", value: "47 mm" }],
    inTheBox: ["Watch 47", "Cable"],
    overviewHtml: "<p>47</p>",
  });
  const v51 = variantTabContent(product, "v51");
  assert.deepEqual(v51.specs, [{ label: "Size", value: "51 mm" }]);
  assert.deepEqual(v51.specGroups, [{ title: "Physical", items: [{ label: "Size", value: "51 mm" }] }]);
  // Owned and empty (the product has content): In the box and the overview show nothing, no fallback.
  assert.deepEqual(v51.inTheBox, []);
  assert.equal(v51.overviewHtml, "");
  assert.equal(ownsEmptyOverview(v51), true);
  assert.equal(ownsEmptyOverview(variantTabContent(product, "v47")), false);
});

// No product overview: v51 inherits (ownsOverview false), so the page keeps its features fallback.
const plain = { ...product, overviewHtml: undefined, commerce: { ...product.commerce, overviewHtml: undefined,
  variants: product.commerce.variants.map((v) => (v.id === "v51" ? { ...v, ownsOverview: false } : v)) } };
// No product overview, but v51 owns an empty overview: the server flag, not a heuristic, decides.
const ownedNoProduct = { ...plain, commerce: { ...plain.commerce, variants: product.commerce.variants } };

test("no overview anywhere (product and variant) keeps the product-features fallback", () => {
  const v51 = variantTabContent(plain, "v51");
  assert.equal("overviewHtml" in v51, false);
  assert.equal(ownsEmptyOverview(v51), false);
  assert.equal(variantTabContent(plain, "v47").overviewHtml, "<p>47</p>");
});

test("product has no overview + variant owns an empty overview: an empty overview, no fallback", () => {
  const v51 = variantTabContent(ownedNoProduct, "v51");
  assert.equal(v51.overviewHtml, "");
  assert.equal(ownsEmptyOverview(v51), true);
});

test("an unknown variant or a legacy (non-PostgreSQL) product keeps the product's blocks", () => {
  const legacy = { specs: product.specs, inTheBox: product.inTheBox, overviewHtml: "<p>Legacy</p>" };
  assert.deepEqual(variantTabContent(legacy, ""), { specs: product.specs, inTheBox: ["Watch"], overviewHtml: "<p>Legacy</p>" });
  assert.deepEqual(variantTabContent(product, "missing").overviewHtml, "<p>Product</p>");
});

test("a block inherited empty from an empty product block keeps the page's editorial fallback", () => {
  const editorial = {
    specs: [{ label: "Editorial", value: "spec" }],
    inTheBox: ["Editorial box"],
    commerce: { specs: [], inTheBox: [], variants: [{ id: "v", sku: "S", content: content([], []) }] },
  };
  assert.deepEqual(variantTabContent(editorial, "v"), { specs: editorial.specs, inTheBox: ["Editorial box"] });
});

test("ProductTabs: a variant switch swaps the open tab's content and keeps that tab open", async () => {
  const { componentFixture, nodes, nodeText } = await import("../helpers/component-fixture.mjs");
  let selected = "v47";
  const fixture = componentFixture("src/components/ProductTabs.tsx", { modules: {
    "@/components/product/ProductVariantContext": { useProductVariant: () => ({ selectedVariantId: selected, setSelectedVariantId: (id) => { selected = id; } }) },
    "@/lib/catalog/variant-selection": { variantTabContent, ownsEmptyOverview },
  } });
  const props = { product: { id: "k", features: [], accessories: [], ...product } };
  const tabButton = (tree, label) => nodes(tree).find((n) => n.type === "button" && nodeText(n).trim() === label);
  // Child blocks (Specs, InTheBox) are not expanded by the fixture: read the product each one is given.
  const block = (tree, name) => nodes(tree).find((n) => typeof n.type === "function" && n.type.name === name)?.props.product;
  let tree = fixture.render(props);
  tabButton(tree, "Specs").props.onClick();
  tree = fixture.render(props);
  assert.deepEqual(block(tree, "Specs").specs, [{ label: "Size", value: "47 mm" }]);
  selected = "v51";
  tree = fixture.render(props);
  assert.deepEqual(block(tree, "Specs")?.specs, [{ label: "Size", value: "51 mm" }], "Specs is still the open tab and shows 51 mm");
  assert.deepEqual(block(tree, "Specs").specGroups, [{ title: "Physical", items: [{ label: "Size", value: "51 mm" }] }]);
  tabButton(tree, "In the Box").props.onClick();
  tree = fixture.render(props);
  assert.deepEqual(block(tree, "InTheBox").inTheBox, [], "51 mm owns an empty In the box");
  selected = "v47";
  tree = fixture.render(props);
  assert.deepEqual(block(tree, "InTheBox").inTheBox, ["Watch 47", "Cable"]);
});

test("ProductTabs Overview: an owned empty overview renders nothing; no overview anywhere keeps the features fallback", async () => {
  const { componentFixture, nodes } = await import("../helpers/component-fixture.mjs");
  const render = (base, selected) => componentFixture("src/components/ProductTabs.tsx", { modules: {
    "@/components/product/ProductVariantContext": { useProductVariant: () => ({ selectedVariantId: selected, setSelectedVariantId() {} }) },
    "@/lib/catalog/variant-selection": { variantTabContent, ownsEmptyOverview },
  } }).render({ product: { id: "k", features: [{ title: "Feature", body: "Body" }], accessories: [], ...base } });
  const html = (tree) => nodes(tree).filter((n) => n.props?.dangerouslySetInnerHTML).map((n) => n.props.dangerouslySetInnerHTML.__html);
  const fallback = (tree) => nodes(tree).some((n) => typeof n.type === "function" && /Overview$/.test(n.type.name));
  // 47 mm owns an overview; 51 mm owns an empty one (the product has one): nothing, not the features.
  assert.deepEqual(html(render(product, "v47")), ["<p>47</p>"]);
  const owned = render(product, "v51");
  assert.deepEqual(html(owned), []);
  assert.equal(fallback(owned), false);
  // Neither the product nor the variant has an overview: the product-features fallback stays.
  const none = render(plain, "v51");
  assert.deepEqual(html(none), []);
  assert.equal(fallback(none), true);
  // No product overview, but 51 mm owns an empty one: nothing renders, no features fallback.
  const ownedEmpty = render(ownedNoProduct, "v51");
  assert.deepEqual(html(ownedEmpty), []);
  assert.equal(fallback(ownedEmpty), false);
});
