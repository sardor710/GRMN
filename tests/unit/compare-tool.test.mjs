// Task C-b: the Garmin-style compare tool (src/components/CompareTool.tsx), rendered with the real component,
// the real English messages, the real Price primitive and the real compare helpers; the router is recorded.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as compareItems from "../../src/lib/compare/compare-items.ts";

function setup(live = "") {
  const calls = [];
  const router = { push: (href, options) => calls.push({ method: "push", href, options }), replace: (href, options) => calls.push({ method: "replace", href, options }), refresh: () => calls.push({ method: "refresh" }) };
  const fixture = componentFixture("src/components/CompareTool.tsx", {
    modules: { "next/navigation": { useRouter: () => router, usePathname: () => "/en/compare", useSearchParams: () => new URLSearchParams(live) }, "@/lib/compare/compare-items": compareItems },
  });
  return { fixture, calls };
}

const watch = {
  productId: "fenix-8", sku: "F8-47", name: "fēnix 8", image: "/images/f8-47.jpg", price: { minor: "40000000" }, href: "/p/fenix-8?variant=F8-47",
  variants: [{ sku: "F8-47", label: "47 mm" }, { sku: "F8-51", label: "51 mm" }],
};
const band = { productId: "band", sku: "B-1", name: "Index Band", image: "/images/band.jpg", price: { minor: "9999000" }, href: "/p/band", variants: [] };
const single = { productId: "venu", sku: "V-1", name: "Venu 4", image: "/images/venu.jpg", price: { minor: "20000000" }, href: "/p/venu?variant=V-1", variants: [{ sku: "V-1", label: "41 mm" }] };

const groups = compareItems.buildCompareRows([
  { specGroups: [{ title: "General", items: [{ label: "Lens", value: "Sapphire" }, { label: "Weight", value: "73 g" }] }, { title: "Sensors", items: [{ label: "GPS", value: "Yes" }] }] },
  { specGroups: [{ title: "General", items: [{ label: "Lens", value: "Sapphire" }, { label: "Weight", value: "56 g" }] }, { title: "Sensors", items: [{ label: "GPS", value: "Yes" }] }] },
], "Specs");

const props = (overrides = {}) => ({ items: [watch, band], groups, onlyDifferences: false, search: null, catalogueHref: "/c/wearables-smartwatches", renderedFor: "", ...overrides });
const byRole = (tree, role) => nodes(tree).filter((n) => n.props?.role === role);
const rowLabels = (tree) => byRole(tree, "rowheader").map(nodeText).map((s) => s.trim());
const groupButtons = (tree) => nodes(tree).filter((n) => n.type === "button" && n.props["aria-controls"]?.startsWith("compare-group-"));

test("columns render with the remove button, a product link, the tenge price and Shop", () => {
  const { fixture } = setup();
  const tree = fixture.render(props());
  const text = nodeText(tree);
  assert.match(text, /Product Comparison/);
  assert.match(text, /Return to shopping/);
  for (const name of ["fēnix 8", "Index Band"]) assert.ok(nodes(tree).some((n) => n.type === "button" && n.props["aria-label"] === `Remove ${name}`), `remove ${name}`);
  const shop = nodes(tree).filter((n) => nodeText(n).trim() === "Shop" && typeof n.props?.className === "string" && n.props.className.includes("g-btn--primary"));
  assert.deepEqual(shop.map((n) => n.props.href), ["/p/fenix-8?variant=F8-47", "/p/band"]);
  assert.match(text, /KZT\s?400,000\.00/);
  // One column header per product and a row header per spec, for screen readers.
  assert.deepEqual(byRole(tree, "columnheader").slice(0, 3).map(nodeText), ["Specification", "fēnix 8", "Index Band"]);
  assert.ok(rowLabels(tree).includes("Weight"));
  // The "+" tile shows while there are fewer than five columns.
  assert.ok(nodes(tree).some((n) => n.type === "button" && n.props["aria-label"] === "Add product"));
});

test("the size picker exists only for a product with two or more variants", () => {
  const { fixture } = setup();
  const tree = fixture.render(props({ items: [watch, band, single] }));
  const selects = nodes(tree).filter((n) => n.type === "select");
  assert.equal(selects.length, 1);
  assert.equal(selects[0].props.value, "F8-47");
  assert.deepEqual(nodes(selects[0]).filter((n) => n.type === "option").map((n) => nodeText(n).trim()), ["47 mm", "51 mm"]);
  assert.ok(nodes(tree).some((n) => n.type === "label" && n.props.htmlFor === selects[0].props.id && nodeText(n) === "Size for fēnix 8"));
});

test("changing the size rewrites only that column's item in the URL, client-side", () => {
  const { fixture, calls } = setup();
  const tree = fixture.render(props({ items: [band, watch] }));
  nodes(tree).find((n) => n.type === "select").props.onChange({ target: { value: "F8-51" } });
  assert.deepEqual(calls, [{ method: "replace", href: "/en/compare?item=band&item=fenix-8~F8-51", options: { scroll: false } }]);
});

test("a size already compared in another column is not offered twice", () => {
  const { fixture } = setup();
  const other = { ...watch, sku: "F8-51", href: "/p/fenix-8?variant=F8-51" };
  const tree = fixture.render(props({ items: [watch, other] }));
  const [first] = nodes(tree).filter((n) => n.type === "select");
  assert.deepEqual(nodes(first).filter((n) => n.type === "option").map((n) => Boolean(n.props.disabled)), [false, true]);
  // The two columns of one product are told apart by size in their names.
  assert.ok(nodes(tree).some((n) => n.props?.["aria-label"] === "Remove fēnix 8, 51 mm"));
});

test("remove and add push the new column list; a search keeps the columns", () => {
  const { fixture, calls } = setup();
  let tree = fixture.render(props({ search: { query: "venu", results: [{ id: "venu", name: "Venu 4", image: "/images/venu.jpg" }] } }));
  nodes(tree).find((n) => n.props?.["aria-label"] === "Remove fēnix 8").props.onClick();
  nodes(tree).find((n) => n.props?.["aria-label"] === "Add Venu 4 to the comparison").props.onClick();
  tree = fixture.render(props());
  const input = nodes(tree).find((n) => n.type === "input" && n.props.name === "q");
  input.props.onChange({ target: { value: "forerunner" } });
  tree = fixture.render(props());
  nodes(tree).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls.map((c) => [c.method, c.href]), [
    ["push", "/en/compare?item=band"],
    ["push", "/en/compare?item=fenix-8~F8-47&item=band&item=venu"],
    ["replace", "/en/compare?item=fenix-8~F8-47&item=band&q=forerunner"],
  ]);
});

test("five columns leave no + tile", () => {
  const { fixture } = setup();
  const five = ["a", "b", "c", "d", "e"].map((id) => ({ ...band, productId: id, name: id }));
  const tree = fixture.render(props({ items: five }));
  assert.ok(!nodes(tree).some((n) => n.props?.["aria-label"] === "Add product"));
});

test("Show only differences hides equal rows and groups left empty, and is kept in the URL", () => {
  const { fixture } = setup();
  const writes = [];
  const previous = globalThis.window;
  globalThis.window = { history: { state: { kept: true }, replaceState: (state, _title, url) => writes.push({ state, url }) } };
  try {
    let tree = fixture.render(props());
    assert.deepEqual(rowLabels(tree), ["Lens", "Weight", "GPS"]);
    assert.deepEqual(groupButtons(tree).map(nodeText).map((s) => s.trim()), ["General", "Sensors"]);
    nodes(tree).find((n) => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } });
    tree = fixture.render(props());
    assert.deepEqual(rowLabels(tree), ["Weight"]);
    assert.deepEqual(groupButtons(tree).map(nodeText).map((s) => s.trim()), ["General"]);
    assert.deepEqual(writes, [{ state: { kept: true }, url: "/en/compare?item=fenix-8~F8-47&item=band&diff=1" }]);
  } finally {
    globalThis.window = previous;
  }
  // diff=1 from the URL starts with the filter on.
  const { fixture: fromUrl } = setup();
  assert.deepEqual(rowLabels(fromUrl.render(props({ onlyDifferences: true }))), ["Weight"]);
});

test("a spec missing from a column shows an empty cell", () => {
  const { fixture } = setup();
  const sparse = compareItems.buildCompareRows([{ specs: [{ label: "Lens", value: "Sapphire" }] }, { specs: [{ label: "Weight", value: "56 g" }] }], "Specs");
  const tree = fixture.render(props({ groups: sparse }));
  const lensRow = byRole(tree, "row").find((row) => nodeText(row).includes("Lens"));
  assert.deepEqual(byRole(lensRow, "cell").map(nodeText), ["Sapphire", ""]);
});

test("spec groups are open by default and collapse with aria-expanded", () => {
  const { fixture } = setup();
  let tree = fixture.render(props());
  let [general] = groupButtons(tree);
  assert.equal(general.props["aria-expanded"], true);
  const bodyOf = (t, id) => nodes(t).find((n) => n.props?.id === id);
  assert.equal(bodyOf(tree, general.props["aria-controls"]).props.hidden, false);
  general.props.onClick();
  tree = fixture.render(props());
  [general] = groupButtons(tree);
  assert.equal(general.props["aria-expanded"], false);
  assert.equal(bodyOf(tree, general.props["aria-controls"]).props.hidden, true);
  assert.equal(groupButtons(tree)[1].props["aria-expanded"], true);
});

test("no items: a short message and a link to the catalogue", () => {
  const { fixture } = setup();
  const tree = fixture.render(props({ items: [], groups: [] }));
  assert.match(nodeText(tree), /There are no products to compare yet\. Add up to 5 products/);
  assert.ok(nodes(tree).some((n) => n.props?.href === "/c/wearables-smartwatches" && nodeText(n) === "Shop smartwatches"));
  assert.equal(byRole(tree, "table").length, 0);
  assert.ok(!nodes(tree).some((n) => n.type === "input" && n.props.type === "checkbox"));
});

test("compareHref and compareSearch build the compare link for the catalogue and product page (C-c)", () => {
  assert.equal(compareItems.compareHref([]), "/compare");
  assert.equal(compareItems.compareHref([{ productId: "fenix-8", sku: "F8-47" }, { productId: "venu" }]), "/compare?item=fenix-8~F8-47&item=venu");
  assert.equal(compareItems.compareSearch([{ productId: "a" }], { onlyDifferences: true, search: "  fēnix " }), "item=a&diff=1&q=f%C4%93nix");
  assert.equal(compareItems.readOnlyDifferences({ diff: "1" }), true);
  assert.equal(compareItems.readOnlyDifferences({ diff: ["0"] }), false);
  assert.equal(compareItems.readOnlyDifferences(undefined), false);
});

test("the compare messages exist in en, ru and kk with Garmin's wording in English", () => {
  const load = (locale) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).Compare;
  const en = load("en");
  for (const [key, text] of Object.entries({ title: "Product Comparison", back: "Return to shopping", onlyDifferences: "Show only differences", shop: "Shop", remove: "Remove", addProduct: "Add product" })) assert.equal(en[key], text, key);
  for (const locale of ["ru", "kk"]) {
    const messages = load(locale);
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort(), locale);
    for (const [key, value] of Object.entries(messages)) assert.ok(typeof value === "string" && value.trim() && value !== en[key], `${locale}.${key} translated`);
  }
});

test("a render that does not match the address is refetched once (Next.js keeps a stale page after some navigations)", () => {
  const url = "item=fenix-8~F8-51&item=band";
  const stale = setup(url);
  stale.fixture.render(props({ renderedFor: compareItems.renderedQuery("item=fenix-8~F8-47&item=band") }));
  stale.fixture.effects.forEach((effect) => effect());
  assert.deepEqual(stale.calls, [{ method: "refresh" }]);
  // In step (diff=1 is client-only state and does not count): no refetch.
  const fresh = setup(`${url}&diff=1`);
  fresh.fixture.render(props({ renderedFor: compareItems.renderedQuery(url) }));
  fresh.fixture.effects.forEach((effect) => effect());
  assert.deepEqual(fresh.calls, []);
  assert.equal(compareItems.renderedQuery("selected=a&q=%20venu%20&diff=1"), "item=a&q=venu");
  assert.equal(compareItems.readCompareSearch({ q: ["x".repeat(150)] }).length, compareItems.COMPARE_SEARCH_MAX_LENGTH);
});
