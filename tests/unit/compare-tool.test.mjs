// Task C-b: the Garmin-style compare tool (src/components/CompareTool.tsx), rendered with the real component,
// the real English messages, the real Price primitive and the real compare helpers; the router is recorded.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as compareItems from "../../src/lib/compare/compare-items.ts";

function setup(initialQuery = "") {
  const calls = [];
  // The address the component reads through useSearchParams; history.replaceState (mocked per test) can move it.
  const address = { query: initialQuery };
  const router = { push: (href, options) => calls.push({ method: "push", href, options }), replace: (href, options) => calls.push({ method: "replace", href, options }), refresh: () => calls.push({ method: "refresh" }) };
  const fixture = componentFixture("src/components/CompareTool.tsx", {
    modules: { "next/navigation": { useRouter: () => router, usePathname: () => "/en/compare", useSearchParams: () => new URLSearchParams(address.query) }, "@/lib/compare/compare-items": compareItems },
  });
  return { fixture, calls, address };
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

const props = (overrides = {}) => ({ items: [watch, band], groups, search: null, catalogueHref: "/c/wearables-smartwatches", renderedFor: "", ...overrides });
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
  const { fixture, address } = setup("item=fenix-8~F8-47&item=band&utm=x");
  const writes = [];
  const previous = globalThis.window;
  globalThis.window = { history: { state: { kept: true }, replaceState: (state, _title, url) => { writes.push({ state, url }); address.query = url.split("?")[1] ?? ""; } } };
  try {
    let tree = fixture.render(props());
    assert.deepEqual(rowLabels(tree), ["Lens", "Weight", "GPS"]);
    assert.deepEqual(groupButtons(tree).map(nodeText).map((s) => s.trim()), ["General", "Sensors"]);
    nodes(tree).find((n) => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } });
    tree = fixture.render(props());
    assert.deepEqual(rowLabels(tree), ["Weight"]);
    assert.deepEqual(groupButtons(tree).map(nodeText).map((s) => s.trim()), ["General"]);
    // Only diff changes; the rest of the address is kept, and Next.js needs a null state to sync useSearchParams.
    assert.deepEqual(writes, [{ state: null, url: "/en/compare?item=fenix-8~F8-47&item=band&utm=x&diff=1" }]);
  } finally {
    globalThis.window = previous;
  }
  // diff=1 from the URL starts with the filter on, and Back to an address without it turns it off again.
  const { fixture: fromUrl, address: url } = setup("item=fenix-8~F8-47&item=band&diff=1");
  assert.deepEqual(rowLabels(fromUrl.render(props())), ["Weight"]);
  assert.equal(nodes(fromUrl.render(props())).find((n) => n.props?.type === "checkbox").props.checked, true);
  url.query = "item=fenix-8~F8-47&item=band";
  assert.deepEqual(rowLabels(fromUrl.render(props())), ["Lens", "Weight", "GPS"]);
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

// ---- Fix round 1 ------------------------------------------------------------------------------------------------

const sizes = { ...watch, variants: [{ sku: "F8-47", label: "47 mm" }, { sku: "F8-51", label: "51 mm" }] };
const searchFor = (...ids) => ({ query: "x", results: ids.map((id) => ({ id, name: id, image: "/i.jpg" })) });
const hitLabels = (tree) => nodes(tree).filter((n) => n.type === "button" && /to the comparison$/.test(n.props?.["aria-label"] ?? "")).map((n) => n.props["aria-label"]);

test("a search hit already compared is added in its first size not compared yet, or not offered at all", () => {
  const { fixture, calls } = setup();
  // fēnix 8 47 mm is compared: the hit adds 51 mm. The band (no sizes) is compared: not offered. Venu is new.
  let tree = fixture.render(props({ items: [sizes, band], search: searchFor("fenix-8", "band", "venu") }));
  assert.deepEqual(hitLabels(tree), ["Add fenix-8 to the comparison", "Add venu to the comparison"]);
  nodes(tree).find((n) => n.props?.["aria-label"] === "Add fenix-8 to the comparison").props.onClick();
  assert.deepEqual(calls.at(-1), { method: "push", href: "/en/compare?item=fenix-8~F8-47&item=band&item=fenix-8~F8-51", options: { scroll: false } });
  // Both sizes compared: the product is gone from the hits, and with no hits left the empty message shows.
  tree = fixture.render(props({ items: [sizes, { ...sizes, sku: "F8-51" }], search: searchFor("fenix-8") }));
  assert.deepEqual(hitLabels(tree), []);
  assert.match(nodeText(tree), /No products found for “x”/);
  // The results are announced politely.
  assert.ok(nodes(tree).some((n) => n.props?.["aria-live"] === "polite" && /No products found/.test(nodeText(n))));
});

test("with only differences on and nothing different, a status says so instead of a blank table", () => {
  const same = compareItems.buildCompareRows([{ specs: [{ label: "Lens", value: "Sapphire" }] }, { specs: [{ label: "Lens", value: "Sapphire" }] }], "Specs");
  const { fixture } = setup("diff=1");
  const tree = fixture.render(props({ groups: same }));
  assert.equal(byRole(tree, "table").length, 0);
  const status = byRole(tree, "status").find((n) => nodeText(n).trim());
  assert.equal(nodeText(status).trim(), "No differences between these products.");
  // Without the filter the status region stays empty.
  const { fixture: off } = setup();
  assert.ok(byRole(off.render(props({ groups: same })), "status").every((n) => !nodeText(n).trim()));
});

test("each size picker of a product compared twice has its own label; group toggles keep the heading as their name", () => {
  const { fixture } = setup();
  let tree = fixture.render(props({ items: [sizes, { ...sizes, sku: "F8-51" }] }));
  const labels = nodes(tree).filter((n) => n.type === "label" && /^compare-size-/.test(n.props.htmlFor ?? "")).map((n) => nodeText(n).trim());
  assert.deepEqual(labels, ["Size for fēnix 8, column 1", "Size for fēnix 8, column 2"]);
  // Final review M5: no aria-label replacing the heading text; aria-expanded alone carries the state.
  let [general] = groupButtons(tree);
  assert.equal(general.props["aria-label"], undefined);
  assert.equal(nodeText(general).trim(), "General");
  general.props.onClick();
  tree = fixture.render(props({ items: [sizes, { ...sizes, sku: "F8-51" }] }));
  [general] = groupButtons(tree);
  assert.equal(general.props["aria-label"], undefined);
  assert.equal(general.props["aria-expanded"], false);
});

// Final review I3: React keys are unique per column position, even if two columns ever carry the same ref.
test("column keys are unique even when two columns share a ref", () => {
  const { fixture } = setup();
  const tree = fixture.render(props({ items: [watch, watch] }));
  const keyed = (predicate) => nodes(tree).filter(predicate).map((n) => n.key);
  const cards = keyed((n) => typeof n.key === "string" && /^\d+:fenix-8~F8-47$/.test(n.key) && n.type === "div");
  assert.deepEqual(cards, ["0:fenix-8~F8-47", "1:fenix-8~F8-47"]);
  // One sr-only header row per spec group: unique within each row.
  const headers = keyed((n) => n.props?.role === "columnheader" && n.key !== undefined);
  assert.deepEqual(headers, ["0:fenix-8~F8-47", "1:fenix-8~F8-47", "0:fenix-8~F8-47", "1:fenix-8~F8-47"]);
});

// Final review M6 (WCAG 2.4.11): while the fixed compact bar shows, the page keeps focused controls clear of it.
test("globals.css adds scroll-padding-top while the compact compare bar is on the page", () => {
  const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /html:has\(\[data-compare-compact\]\)\s*\{\s*scroll-padding-top:\s*calc\(128px \+ 16px\);/);
});

test("SKUs differing only in case are one column", () => {
  assert.deepEqual(compareItems.parseCompareItems("item=a~F8&item=a~f8&item=b"), [{ productId: "a", sku: "F8" }, { productId: "b" }]);
});

test("the compact column bar appears when the cards scroll away, is aria-hidden and follows horizontal scroll", () => {
  const { fixture } = setup();
  const observers = [];
  const previous = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class { constructor(callback) { this.callback = callback; this.observed = []; observers.push(this); } observe(el) { this.observed.push(el); } disconnect() { this.disconnected = true; } };
  try {
    const items = [sizes, band];
    let tree = fixture.render(props({ items }));
    assert.ok(!nodes(tree).some((n) => n.props?.["data-compare-compact"] !== undefined), "no bar at the top of the page");
    const cards = nodes(tree).find((n) => n.props?.ref && /gap-4/.test(n.props.className ?? ""));
    cards.props.ref.current = { id: "cards" };
    fixture.effects.forEach((effect) => effect());
    assert.equal(observers.length, 1);
    assert.deepEqual(observers[0].observed, [{ id: "cards" }]);
    // Scrolled past the cards (above the viewport): the bar shows.
    observers[0].callback([{ isIntersecting: false, boundingClientRect: { top: -400 } }]);
    tree = fixture.render(props({ items }));
    const bar = nodes(tree).find((n) => n.props?.["data-compare-compact"] !== undefined);
    assert.ok(bar, "compact bar rendered");
    assert.equal(bar.props["aria-hidden"], "true");
    assert.match(nodeText(bar), /fēnix 8\s+47 mm\s+Index Band/);
    assert.ok(!nodes(bar).some((n) => n.type === "button" || n.type === "select" || n.props?.href), "nothing focusable in the bar");
    // Horizontal scroll of the table is mirrored into the bar.
    const listeners = {};
    const scroller = { scrollLeft: 120, addEventListener: (type, fn, options) => { listeners[type] = { fn, options }; }, removeEventListener: (type) => { delete listeners[type]; } };
    const compact = { scrollLeft: 0 };
    nodes(tree).find((n) => n.props?.ref && /overflow-x-auto/.test(n.props.className ?? "")).props.ref.current = scroller;
    nodes(bar).find((n) => n.props?.ref).props.ref.current = compact;
    const cleanups = fixture.effects.map((effect) => effect()).filter(Boolean);
    assert.equal(compact.scrollLeft, 120);
    assert.deepEqual(listeners.scroll.options, { passive: true });
    scroller.scrollLeft = 300;
    listeners.scroll.fn();
    assert.equal(compact.scrollLeft, 300);
    cleanups.forEach((cleanup) => cleanup());
    assert.equal(listeners.scroll, undefined);
    // Back above the cards (or the cards visible again): the bar goes away.
    observers.at(-1).callback([{ isIntersecting: true, boundingClientRect: { top: 200 } }]);
    tree = fixture.render(props({ items }));
    assert.ok(!nodes(tree).some((n) => n.props?.["data-compare-compact"] !== undefined));
  } finally {
    globalThis.IntersectionObserver = previous;
  }
});
