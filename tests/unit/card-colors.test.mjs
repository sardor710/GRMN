// Task C-d: catalogue card colour dots (garmin.com g-color-swatches). They come only from real data: a colour option
// whose values on sale each carry a swatch photo or a hex colour. Nothing is derived from a colour's name, and a
// product without that data shows no dots. Real ProductCard, real English messages, real card-colors helpers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import { cardColors, projectedOptionKey, swatchImage, CARD_COLOR_MAX } from "../../src/lib/catalog/card-colors.ts";

const all = () => true;
const color = (values, extra = {}) => ({ id: "opt-color", key: "color", name: "Color", display: "swatch", values, ...extra });
const size = { id: "opt-size", key: "case-size", name: "Case size", display: "buttons", values: [{ id: "v-47", key: "47", label: "47 mm" }, { id: "v-51", key: "51", label: "51 mm" }] };

test("colours come from the colour option's swatch photo or hex, photo first", () => {
  const options = [size, color([
    { id: "c-black", label: "Black", swatchColor: "#000000" },
    { id: "c-pink", label: "Shell Pink", swatchImage: "https://res.garmin.com/en/products/010-04335-00/v/col_swatch.jpg", swatchColor: "#efc8c1" },
    { id: "c-white", label: "White", swatchImage: "/uploads/products/x/white.jpg" },
  ])];
  assert.deepEqual(cardColors(options, all), [
    { label: "Black", hex: "#000000" },
    { label: "Shell Pink", image: "https://res.garmin.com/en/products/010-04335-00/v/col_swatch.jpg" },
    { label: "White", image: "/uploads/products/x/white.jpg" },
  ]);
});

test("no colours are invented: a colour name alone, a missing swatch, or no colour option gives no dots", () => {
  // Names only (the importer's data without swatches): nothing, even though "Black" is a well-known colour.
  assert.deepEqual(cardColors([color([{ id: "a", label: "Black" }, { id: "b", label: "White" }], { display: "buttons" })], all), []);
  // One colour on sale without a swatch: no partial row.
  assert.deepEqual(cardColors([color([{ id: "a", label: "Black", swatchColor: "#000" }, { id: "b", label: "Slate" }])], all), []);
  // Unsafe or malformed swatches do not count as data.
  for (const bad of [{ swatchImage: "https://evil.example/x.jpg" }, { swatchImage: "javascript:alert(1)" }, { swatchImage: "/images/../secret" }, { swatchColor: "red" }, { swatchColor: "#12" }, { swatchColor: "url(x)" }]) {
    assert.deepEqual(cardColors([color([{ id: "a", label: "Black", swatchColor: "#000" }, { id: "b", label: "Odd", ...bad }])], all), [], JSON.stringify(bad));
  }
  // No colour option (sizes only), no options at all, or garbage.
  for (const options of [[size], [], undefined, null, "Color", [null, 3]]) assert.deepEqual(cardColors(options, all), []);
  // A single colour is not a choice: no dots.
  assert.deepEqual(cardColors([color([{ id: "a", label: "Black", swatchColor: "#000" }])], all), []);
});

test("only colours a variant on sale is in count; the row stops at nine (garmin.com has no +N)", () => {
  const values = Array.from({ length: 12 }, (_, i) => ({ id: `c-${i}`, label: `Colour ${i}`, swatchColor: `#00000${i % 10}` }));
  const nine = cardColors([color(values)], all);
  assert.equal(CARD_COLOR_MAX, 9);
  assert.equal(nine.length, 9);
  assert.deepEqual(nine.map((c) => c.label), values.slice(0, 9).map((v) => v.label));
  // An unsold colour without a swatch does not block the others, and is not shown.
  const partial = cardColors([color([...values.slice(0, 2), { id: "gone", label: "Retired" }])], (_, value) => value.id !== "gone");
  assert.deepEqual(partial.map((c) => c.label), ["Colour 0", "Colour 1"]);
  // The in-use test sees the option and value, so either backend can decide (ids for JSON, labels for PostgreSQL).
  const seen = [];
  cardColors([color(values.slice(0, 2))], (option, value) => (seen.push([option.key, value.id, value.label]), true));
  assert.deepEqual(seen, [["color", "c-0", "Colour 0"], ["color", "c-1", "Colour 1"]]);
});

test("helpers: swatch photo allowlist and the PostgreSQL option key", () => {
  assert.equal(swatchImage("/media/a.jpg"), "/media/a.jpg");
  assert.equal(swatchImage("//res.garmin.com/x.jpg"), undefined);
  assert.equal(swatchImage("https://res.garmin.com/a b.jpg"), undefined);
  assert.equal(projectedOptionKey({ key: "Color" }), "color");
  assert.equal(projectedOptionKey({ name: "Case Size" }), "case-size");
});

// ---- ProductCard ----
const product = (extra = {}) => ({ id: "venu-4", name: "Venu® 4", image: "/images/venu.jpg", description: "", price: "100.00", activities: [], level: "Unknown", caseSize: "Unknown", family: "", ...extra });
const dotsOf = (tree) => {
  const row = nodes(tree).find((n) => typeof n.type === "function" && n.type.name === "ColorDots");
  return row ? row.type(row.props) : null;
};

test("card: dots render only when the product carries colours, one 16px dot per colour, photo or hex fill", () => {
  const fixture = componentFixture("src/components/ProductCard.tsx");
  assert.equal(dotsOf(fixture.render({ product: product() })), null, "no colour data: no dots");
  assert.equal(dotsOf(fixture.render({ product: product({ colors: [] }) })), null);
  assert.equal(dotsOf(fixture.render({ product: product({ colors: [{ label: "Black", hex: "#000000" }] }) })), null, "one colour: no dots");

  const colors = [{ label: "Black", hex: "#000000" }, { label: "Shell Pink", image: "https://res.garmin.com/en/products/010-04335-00/v/col_swatch.jpg" }];
  const row = dotsOf(fixture.render({ product: product({ colors }) }));
  assert.ok(row && "data-card-colors" in row.props);
  assert.match(row.props.className, /\bmt-4\b/);
  const dots = nodes(row).filter((n) => n.props?.["data-card-color"]);
  assert.deepEqual(dots.map((d) => d.props.title), ["Black", "Shell Pink"]);
  for (const dot of dots) {
    assert.equal(dot.props["aria-hidden"], "true");
    assert.match(dot.props.className, /\bsize-4\b/);
    assert.match(dot.props.className, /\bmr-2\b/);
    assert.match(dot.props.className, /after:shadow-garmin-swatch/);
  }
  assert.equal(nodes(dots[0]).find((n) => n.type === "circle").props.fill, "#000000");
  assert.equal(nodes(dots[1]).find((n) => n.type === "img").props.src, colors[1].image);
  assert.match(nodeText(row), /Colors: Black, Shell Pink/, "the names are read once to screen readers");
});

test("card: never more than nine dots", () => {
  const colors = Array.from({ length: 12 }, (_, i) => ({ label: `C${i}`, hex: "#111111" }));
  const row = dotsOf(componentFixture("src/components/ProductCard.tsx").render({ product: product({ colors }) }));
  assert.equal(nodes(row).filter((n) => n.props?.["data-card-color"]).length, 9);
});
