// Task C-c: catalogue compare mode (CatalogueGrid), the card's "Add to comparison" control (ProductCard), the
// sticky compare bar (CompareBar) and the product page's control (ProductTop). Real components, real English
// messages, real compare helpers; the selection hook, router and window are recorded fakes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as selection from "../../src/lib/compare/selection.ts";
import * as commerceVariantModel from "../../src/lib/cms/commerce-variant-model.js";
import * as productVariants from "../../src/lib/cms/product-variants.js";
import * as variantSelection from "../../src/lib/catalog/variant-selection.ts";

const product = (id, name = id) => ({ id, name, image: `/images/${id}.jpg`, description: "", price: "100.00", activities: [], level: "Unknown", caseSize: "Unknown", family: "" });
const buttons = (tree) => nodes(tree).filter((n) => n.type === "button");
const compareButton = (tree) => buttons(tree).find((n) => "aria-pressed" in n.props && /comparison|Added/.test(nodeText(n)));

/** A selection hook backed by a plain array; `update` applies the change like the real store. */
function fakeSelection(initial = []) {
  const state = { items: initial, updates: 0 };
  const hook = { useCompareSelection: () => ({ items: state.items, update: (change) => { state.updates++; state.items = selection.normalizeSelection(change(state.items)); } }) };
  return { state, hook };
}

// ---- ProductCard ----

test("card: outside compare mode the card is one product link with no compare control", () => {
  const tree = componentFixture("src/components/ProductCard.tsx").render({ product: product("fenix-8", "fēnix 8") });
  assert.equal(tree.props.href, "/p/fenix-8");
  assert.ok("data-product-card" in tree.props);
  assert.equal(buttons(tree).length, 0);
});

test("card: the compare control is a pressed/unpressed button beside the link, and a click never navigates", () => {
  const fixture = componentFixture("src/components/ProductCard.tsx");
  let toggles = 0;
  const compare = { selected: false, blocked: false, onToggle: () => toggles++, describedBy: "compare-limit-note" };
  let tree = fixture.render({ product: product("fenix-8", "fēnix 8"), compare });
  const control = compareButton(tree);
  assert.equal(control.props.type, "button");
  assert.equal(control.props["aria-pressed"], false);
  assert.match(nodeText(control), /Add to comparison\s*,\s*fēnix 8\s*\+/);
  // The control is not inside the product link (a button in an <a> would navigate and is invalid HTML).
  const link = nodes(tree).find((n) => n.props?.href === "/p/fenix-8");
  assert.ok(link, "the product link is still there");
  assert.ok(!nodes(link).includes(control));
  assert.notEqual(tree.props.href, "/p/fenix-8", "the card root is no longer the link");
  const event = { prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } };
  control.props.onClick(event);
  assert.deepEqual([toggles, event.prevented, event.stopped], [1, 1, 1]);

  tree = fixture.render({ product: product("fenix-8", "fēnix 8"), compare: { ...compare, selected: true } });
  assert.equal(compareButton(tree).props["aria-pressed"], true);
  assert.match(nodeText(compareButton(tree)), /^Added/);
  assert.ok(nodes(compareButton(tree)).some((n) => n.type?.name === "CheckMark"), "✓ mark when added");
  assert.ok("data-compare-selected" in tree.props);
});

test("card: with five chosen the control is disabled with the reason and ignores clicks", () => {
  let toggles = 0;
  const tree = componentFixture("src/components/ProductCard.tsx").render({ product: product("venu"), compare: { selected: false, blocked: true, onToggle: () => toggles++, describedBy: "compare-limit-note" } });
  const control = compareButton(tree);
  assert.equal(control.props["aria-disabled"], true);
  assert.equal(control.props["aria-describedby"], "compare-limit-note");
  control.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(toggles, 0);
});

// ---- CatalogueGrid ----

function grid(query, initial = []) {
  const calls = [];
  const { state, hook } = fakeSelection(initial);
  const fixture = componentFixture("src/components/CatalogueGrid.tsx", {
    modules: {
      "@/lib/catalog-constants": { activityFilters: [], levelFilters: [], caseSizeFilters: [] },
      "next/navigation": { useRouter: () => ({ push: (url, options) => calls.push({ url, options }) }), useSearchParams: () => new URLSearchParams(query), usePathname: () => "/en/c/wearables-smartwatches" },
      "@/lib/compare/use-compare-selection": hook,
    },
  });
  return { fixture, calls, state };
}
// ProductCard and CompareBar are not expanded by the fixture: their elements are found by their props.
const cards = (tree) => nodes(tree).filter((n) => n.props?.product);
const toggles = (tree) => buttons(tree).filter((n) => "aria-pressed" in n.props && nodeText(n).includes("Compare"));

test("grid: the Compare button toggles compare mode in the URL (compare=1) and keeps the other parameters", () => {
  let { fixture, calls } = grid("sort=name&cursor=x");
  let tree = fixture.render({ products: [product("a"), product("b")] });
  assert.equal(toggles(tree).length, 2, "rail button and the mobile one");
  assert.equal(toggles(tree)[0].props["aria-pressed"], false);
  assert.ok(cards(tree).every((card) => card.props.compare === undefined), "cards keep their plain link off compare mode");
  toggles(tree)[0].props.onClick();
  assert.deepEqual(calls, [{ url: "/en/c/wearables-smartwatches?sort=name&cursor=x&compare=1", options: { scroll: false } }]);

  ({ fixture, calls } = grid("compare=1&compareSearch=venu&sort=name"));
  tree = fixture.render({ products: [product("a")] });
  assert.equal(toggles(tree)[0].props["aria-pressed"], true);
  toggles(tree)[0].props.onClick();
  assert.deepEqual(calls[0].url, "/en/c/wearables-smartwatches?sort=name");
});

test("grid: in compare mode every card gets the control; selection, the cap and the toggle go through the store", () => {
  const chosen = ["a", "b", "c", "d", "e"].map((id) => ({ productId: id }));
  const { fixture, state } = grid("compare=1", chosen);
  const tree = fixture.render({ products: [product("a", "A"), product("z", "Z")] });
  const [a, z] = cards(tree);
  assert.deepEqual([a.props.compare.selected, a.props.compare.blocked], [true, false]);
  assert.deepEqual([z.props.compare.selected, z.props.compare.blocked], [false, true]);
  assert.equal(z.props.compare.describedBy, "compare-limit-note");
  a.props.compare.onToggle();
  assert.deepEqual(state.items.map((item) => item.productId), ["b", "c", "d", "e"]);
  // The bar is rendered above the grid and the rail moves under it.
  assert.ok(nodes(tree).some((n) => n.props?.compareMode === true && Array.isArray(n.props.items) && typeof n.props.onChange === "function"));
  assert.match(nodes(tree).find((n) => n.type === "aside").props.className, /lg:top-\[87px\]/);
});

test("grid: adding from a card stores the product with its name and image", () => {
  const { fixture, state } = grid("compare=1");
  const tree = fixture.render({ products: [product("fenix-8", "fēnix 8")] });
  cards(tree)[0].props.compare.onToggle();
  assert.deepEqual(state.items, [{ productId: "fenix-8", name: "fēnix 8", image: "/images/fenix-8.jpg" }]);
});

// ---- CompareBar ----

function bar(query = "compare=1") {
  const calls = [];
  const writes = [];
  const fixture = componentFixture("src/components/CompareBar.tsx", {
    modules: { "next/navigation": { useRouter: () => ({ replace: (url, options) => calls.push({ url, options }) }), useSearchParams: () => new URLSearchParams(query), usePathname: () => "/en/c/wearables-smartwatches" } },
  });
  const previous = globalThis.window;
  globalThis.window = { location: { pathname: "/en/c/wearables-smartwatches", search: `?${query}` }, history: { replaceState: (state, _title, url) => writes.push({ state, url }) } };
  return { fixture, calls, writes, restore: () => { globalThis.window = previous; } };
}
function barProps(items, extra = {}) {
  const state = { items };
  return { state, props: { items, onChange: (change) => { state.items = change(state.items); }, products: [], search: null, compareMode: true, ...extra } };
}
const fenix = { productId: "fenix-8", sku: "F8-47", name: "fēnix 8", image: "/f8.jpg" };
const venu = { productId: "venu", name: "Venu 4", image: "/venu.jpg" };
const forerunner = { productId: "fr-970", name: "Forerunner 970", image: "/fr.jpg" };

test("bar: hidden off compare mode with nothing chosen; a labelled region otherwise", () => {
  const { fixture, restore } = bar("");
  try {
    assert.equal(fixture.render(barProps([], { compareMode: false }).props), null);
    const tree = fixture.render(barProps([fenix], { compareMode: false }).props);
    assert.equal(tree.props.role, "region");
    assert.equal(tree.props["aria-label"], "Comparison");
    assert.ok(nodes(tree).some((n) => n.props?.role === "status"), "changes are announced politely");
  } finally { restore(); }
});

test("bar: Compare is disabled below two products with the reason shown", () => {
  const { fixture, restore } = bar();
  try {
    const tree = fixture.render(barProps([fenix]).props);
    const compare = buttons(tree).find((n) => nodeText(n) === "Compare");
    // Focusable (not `disabled`), described by the visible status, and inert.
    assert.equal(compare.props.disabled, undefined);
    assert.equal(compare.props["aria-disabled"], "true");
    const reason = nodes(tree).find((n) => n.props?.id === compare.props["aria-describedby"]);
    assert.equal(nodeText(reason), "Select at least 2 products");
    let prevented = 0;
    compare.props.onClick({ preventDefault: () => prevented++ });
    assert.equal(prevented, 1);
    assert.ok(!nodes(tree).some((n) => typeof n.props?.href === "string" && n.props.href.startsWith("/compare")));
    assert.match(nodeText(tree), /Select at least 2 products/);
  } finally { restore(); }
});

test("bar: five slots, remove per slot, clear all, and Compare linking to the compare page", () => {
  const { fixture, restore } = bar();
  try {
    const { state, props } = barProps([fenix, venu, forerunner]);
    const tree = fixture.render(props);
    const link = nodes(tree).find((n) => nodeText(n) === "Compare" && n.props?.href);
    assert.equal(link.props.href, "/compare?item=fenix-8~F8-47&item=venu&item=fr-970");
    const slots = nodes(tree).filter((n) => n.type === "li");
    assert.equal(slots.length, 5);
    assert.deepEqual(slots.map((n) => n.props["aria-hidden"] === "true"), [false, false, false, true, true]);
    assert.equal(slots[0].props.title, "fēnix 8");
    assert.match(nodeText(tree), /3 of 5 products selected/);
    buttons(tree).find((n) => n.props["aria-label"] === "Remove Venu 4").props.onClick();
    assert.deepEqual(state.items.map((item) => item.productId), ["fenix-8", "fr-970"]);
    buttons(tree).find((n) => nodeText(n) === "Clear all").props.onClick();
    assert.deepEqual(state.items, []);
  } finally { restore(); }
});

test("bar: DOM order is the mobile stack (status, slots, search, Compare); only lg:order-* rearranges desktop", () => {
  const { fixture, restore } = bar();
  try {
    const tree = fixture.render(barProps([fenix, venu]).props);
    const row = tree.props.children.find((n) => n?.type === "div");
    const kinds = row.props.children.filter(Boolean).map((n) => n.type === "div" && nodeText(n).includes("selected") ? "status" : n.type === "ul" ? "slots" : n.type === "form" ? "search" : nodeText(n).includes("Compare") ? "compare" : "?");
    assert.deepEqual(kinds, ["status", "slots", "search", "compare"]);
    for (const child of row.props.children.filter(Boolean)) assert.doesNotMatch(child.props.className, /(^|s)order-/, "no unprefixed order-* utilities");
  } finally { restore(); }
});

test("bar: the live status is empty on page load and speaks after a change", () => {
  const { fixture, restore } = bar();
  try {
    const { props } = barProps([fenix, venu, forerunner]);
    const live = (tree) => nodeText(nodes(tree).find((n) => n.props?.role === "status"));
    let tree = fixture.render(props);
    assert.equal(live(tree), "", "the stored selection loading is not announced");
    buttons(tree).find((n) => n.props["aria-label"] === "Remove Venu 4").props.onClick();
    tree = fixture.render(props);
    assert.equal(live(tree), "3 of 5 products selected");
    // A card toggle (from the grid) also lets it speak.
    const other = bar();
    try { assert.match(live(other.fixture.render({ ...props, announce: true })), /products selected/); } finally { other.restore(); }
  } finally { restore(); }
});

test("bar: with five chosen it shows the limit note the cards point at and disables the search", () => {
  const { fixture, restore } = bar();
  try {
    const five = [fenix, venu, forerunner, { productId: "x" }, { productId: "y" }];
    const tree = fixture.render(barProps(five).props);
    const note = nodes(tree).find((n) => n.props?.id === "compare-limit-note");
    assert.match(nodeText(note), /You can compare up to 5 products/);
    assert.equal(nodes(tree).find((n) => n.type === "input" && n.props.type === "search").props.disabled, true);
  } finally { restore(); }
});

test("bar: the product search submits compareSearch to the URL and adds a hit (already chosen ones hidden)", () => {
  const { fixture, calls, writes, restore } = bar("compare=1&sort=name&compareSearch=fenix");
  try {
    const search = { query: "fenix", results: [{ id: "fenix-8", name: "fēnix 8", image: "/f8.jpg" }, { id: "fenix-9", name: "fēnix 9", image: "/f9.jpg" }] };
    const { state, props } = barProps([fenix], { search });
    let tree = fixture.render(props);
    const form = nodes(tree).find((n) => n.type === "form");
    assert.equal(form.props.role, "search");
    // Without JavaScript the GET form keeps the page's other parameters.
    assert.deepEqual(nodes(form).filter((n) => n.type === "input" && n.props.type === "hidden").map((n) => `${n.props.name}=${n.props.value}`), ["compare=1", "sort=name"]);
    const hits = buttons(tree).filter((n) => n.props["aria-label"]?.endsWith("to comparison"));
    assert.deepEqual(hits.map((n) => n.props["aria-label"]), ["Add fēnix 9 to comparison"]);
    hits[0].props.onClick();
    assert.deepEqual(state.items.map((item) => item.productId), ["fenix-8", "fenix-9"]);
    assert.deepEqual(writes.at(-1), { state: null, url: "/en/c/wearables-smartwatches?compare=1&sort=name" });
    // Typing and submitting replaces the URL without scrolling.
    tree = fixture.render(props);
    nodes(tree).find((n) => n.type === "input" && n.props.type === "search").props.onChange({ target: { value: " venu " } });
    tree = fixture.render(props);
    nodes(tree).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
    assert.deepEqual(calls.at(-1), { url: "/en/c/wearables-smartwatches?compare=1&sort=name&compareSearch=venu", options: { scroll: false } });
  } finally { restore(); }
});

test("bar: item= links seed the selection with names from the page, then leave the address", () => {
  const { fixture, writes, restore } = bar("compare=1&item=fenix-8~F8-47&item=venu");
  try {
    const { state, props } = barProps([], { products: [product("venu", "Venu 4")] });
    fixture.render(props);
    fixture.effects.forEach((effect) => effect());
    assert.deepEqual(state.items, [{ productId: "fenix-8", sku: "F8-47" }, { productId: "venu", name: "Venu 4", image: "/images/venu.jpg" }]);
    assert.deepEqual(writes, [{ state: null, url: "/en/c/wearables-smartwatches?compare=1" }]);
  } finally { restore(); }
});

// ---- ProductTop ----

test("product page: Add to comparison adds the selected variant's SKU, then offers Remove and View comparison", () => {
  const commerce = { selectedVariantId: "b", variants: [
    { id: "a", sku: "F8-47", name: "47 mm", options: { size: "47 mm" }, availability: "available", price: { selling: { amountMinor: "1000" } }, gallery: [{ url: "/images/a.jpg", alt: "A" }] },
    { id: "b", sku: "F8-51", name: "51 mm", options: { size: "51 mm" }, availability: "available", price: { selling: { amountMinor: "2500" } }, gallery: [{ url: "/images/b.jpg", alt: "B" }] },
  ] };
  const { state, hook } = fakeSelection();
  const fixture = componentFixture("src/components/ProductTop.tsx", { modules: {
    "@/components/product/ProductVariantContext": { useProductVariant: () => ({ selectedVariantId: "b", setSelectedVariantId() {} }) },
    "@/lib/catalog/variant-selection": variantSelection,
    "@/lib/cart": { useCart: () => ({ add() {} }) },
    "@/lib/public-catalog": { minorToMajor: (v) => String(BigInt(v) / 100n), catalogPriceLabel: (p) => p.selling.amountMinor + " KZT" },
    "@/lib/cms/commerce-variant-model": commerceVariantModel,
    "@/lib/cms/product-variants": productVariants,
    "@/lib/compare/use-compare-selection": hook,
  } });
  const props = { product: { id: "fenix-8", title: "fēnix 8", price: "10.00", currency: "KZT", breadcrumb: [], gallery: [], caseSizes: [], versions: [], colors: [], commerce } };
  let tree = fixture.render(props);
  const control = () => buttons(tree).find((n) => /comparison/.test(nodeText(n)));
  assert.equal(nodeText(control()), "Add to comparison");
  control().props.onClick();
  assert.deepEqual(state.items, [{ productId: "fenix-8", sku: "F8-51", name: "fēnix 8", image: "/images/b.jpg" }]);
  tree = fixture.render(props);
  assert.equal(nodeText(control()), "Remove from comparison");
  const view = nodes(tree).find((n) => nodeText(n) === "View comparison");
  assert.equal(view.props.href, "/compare?item=fenix-8~F8-51");
  control().props.onClick();
  assert.deepEqual(state.items, []);
});

test("product page: with five other products chosen the control explains the limit and adds nothing", () => {
  const { state, hook } = fakeSelection(["a", "b", "c", "d", "e"].map((productId) => ({ productId })));
  const fixture = componentFixture("src/components/ProductTop.tsx", { modules: {
    "@/components/product/ProductVariantContext": { useProductVariant: () => ({ selectedVariantId: undefined, setSelectedVariantId() {} }) },
    "@/lib/catalog/variant-selection": variantSelection,
    "@/lib/cart": { useCart: () => ({ add() {} }) },
    "@/lib/cms/product-variants": productVariants,
    "@/lib/compare/use-compare-selection": hook,
  } });
  const tree = fixture.render({ product: { id: "venu", title: "Venu", price: 10, breadcrumb: [], gallery: [], caseSizes: [], versions: [], colors: [] } });
  const control = buttons(tree).find((n) => nodeText(n) === "Add to comparison");
  assert.equal(control.props["aria-disabled"], true);
  const note = nodes(tree).find((n) => n.props?.id === control.props["aria-describedby"]);
  assert.match(nodeText(note), /You can compare up to 5 products/);
  control.props.onClick();
  assert.equal(state.updates, 0);
});

test("product page: a card's SKU-less entry counts as compared; the button swaps it for the size on screen", () => {
  const commerce = { selectedVariantId: "b", variants: [
    { id: "a", sku: "F8-47", name: "47 mm", options: { size: "47 mm" }, availability: "available", price: { selling: { amountMinor: "1000" } }, gallery: [] },
    { id: "b", sku: "F8-51", name: "51 mm", options: { size: "51 mm" }, availability: "available", price: { selling: { amountMinor: "2500" } }, gallery: [{ url: "/images/b.jpg", alt: "B" }] },
  ] };
  const { state, hook } = fakeSelection([{ productId: "venu" }, { productId: "fenix-8", name: "fēnix 8", image: "/card.jpg" }, { productId: "instinct" }]);
  const fixture = componentFixture("src/components/ProductTop.tsx", { modules: {
    "@/components/product/ProductVariantContext": { useProductVariant: () => ({ selectedVariantId: "b", setSelectedVariantId() {} }) },
    "@/lib/catalog/variant-selection": variantSelection,
    "@/lib/cart": { useCart: () => ({ add() {} }) },
    "@/lib/public-catalog": { minorToMajor: (v) => String(BigInt(v) / 100n), catalogPriceLabel: (p) => p.selling.amountMinor + " KZT" },
    "@/lib/cms/commerce-variant-model": commerceVariantModel,
    "@/lib/cms/product-variants": productVariants,
    "@/lib/compare/use-compare-selection": hook,
  } });
  const props = { product: { id: "fenix-8", title: "fēnix 8", price: "10.00", currency: "KZT", breadcrumb: [], gallery: [], caseSizes: [], versions: [], colors: [], commerce } };
  let tree = fixture.render(props);
  const control = () => buttons(tree).find((n) => /comparison|this size/.test(nodeText(n)));
  assert.equal(nodeText(control()), "Compare this size");
  assert.ok(nodes(tree).some((n) => nodeText(n) === "View comparison"), "already in the comparison");
  assert.equal(nodeText(nodes(tree).find((n) => n.props?.role === "status")), "", "nothing announced before the shopper acts");
  control().props.onClick();
  // Replaced in place: still three entries, no second fēnix 8.
  assert.deepEqual(state.items, [{ productId: "venu" }, { productId: "fenix-8", sku: "F8-51", name: "fēnix 8", image: "/images/b.jpg" }, { productId: "instinct" }]);
  tree = fixture.render(props);
  assert.equal(nodeText(control()), "Remove from comparison");
  assert.equal(nodeText(nodes(tree).find((n) => n.props?.role === "status")), "3 of 5 products selected");
});
