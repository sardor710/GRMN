// Final review M9: opening a PostgreSQL product without a compare-at price must not invent one (it used to
// prefill price * 1.15, a fake 15% sale), and saving it sends originalPrice: null so no compareAt is stored.
import test from "node:test";
import assert from "node:assert/strict";
import { componentFixture, nodes } from "../helpers/component-fixture.mjs";
const statusMenu = { StatusMenu: () => null };

const FILE = "src/app/admin/products/_components/ProductsScreen.tsx";
const product = { id: "p-1", version: 3, name: "Forerunner fixture", sku: "FR-1", price: 224995, currency: "KZT", status: "published", image: "/images/products/1228429.jpg",
  images: [{ id: "img-1", src: "/images/products/1228429.jpg", alt: "Forerunner", source: "url" }], defaultImageId: "img-1", description: "A watch", activities: [], level: "Entry", caseSize: "Medium", options: [], variants: [] };

test("editing a PostgreSQL product without compare-at keeps it empty and saves originalPrice null", async () => {
  const posts = [];
  const fixture = componentFixture(FILE, {
    backend: "postgres", items: [product],
    modules: { "@/components/admin/products/StatusMenu": statusMenu },
    fetcher: async (url, options = {}) => { if (options.method === "POST") posts.push({ url, body: JSON.parse(options.body) }); return { ok: true, status: 200, json: async () => ({ items: [] }) }; },
  });
  const edit = nodes(fixture.render()).find(node => node.props?.["aria-label"] === "Edit Forerunner fixture");
  assert.ok(edit, "the row opens the editor");
  edit.props.onClick();
  const form = nodes(fixture.render()).find(node => node.type === "form");
  assert.ok(form, "the editor is open");
  const compare = nodes(fixture.render()).find(node => node.props?.id === "product-compare-at");
  assert.equal(compare.props.value, "", "no invented compare-at price");
  await form.props.onSubmit({ preventDefault() {} });
  const save = posts.find(post => post.url === "/api/admin/products");
  assert.ok(save, "the product was saved");
  assert.equal(save.body.price, 224995);
  assert.equal(save.body.originalPrice, null, "no compareAt is stored");
});

// Final review M13: the legacy (read-only) status pill reuses statusPillClass instead of duplicating it.
test("the legacy status pill uses statusPillClass", () => {
  const fixture = componentFixture(FILE, { backend: "legacy", items: [{ ...product, version: undefined, status: "draft" }], modules: { "@/components/admin/products/StatusMenu": statusMenu, "@/components/admin/products/status-pill": { statusPillClass: status => `pill-${status}` } } });
  const pill = nodes(fixture.render()).find(node => node.type === "span" && /pill-draft/.test(node.props?.className ?? ""));
  assert.ok(pill, "the pill carries statusPillClass(status)");
  assert.match(pill.props.className, /rounded-garmin-pill/);
});

// Final review (M9 follow-up): a new product starts with no compare-at (it used to prefill 899.99, a fake sale)
// and price 0; saving it without touching compare-at sends originalPrice: null, so no compareAt is stored.
test("a new PostgreSQL product starts with empty compare-at and price 0, and saves no compareAt", async () => {
  const posts = [];
  const fixture = componentFixture(FILE, {
    backend: "postgres", items: [],
    modules: { "@/components/admin/products/StatusMenu": statusMenu },
    fetcher: async (url, options = {}) => { if (options.method === "POST") posts.push({ url, body: JSON.parse(options.body) }); return { ok: true, status: 200, json: async () => ({ items: [] }) }; },
  });
  const add = nodes(fixture.render()).find(node => node.type === "button" && typeof node.props?.onClick === "function" && /Add New/.test(JSON.stringify(node.props.children ?? "")));
  assert.ok(add, "the Add New button");
  add.props.onClick();
  let tree = fixture.render();
  assert.equal(nodes(tree).find(node => node.props?.id === "product-compare-at").props.value, "", "no invented compare-at");
  assert.equal(nodes(tree).find(node => node.props?.id === "product-price").props.value, 0);
  // The editor needs a photo before it saves.
  fixture.state.forEach((value, index) => { if (value && typeof value === "object" && "originalPrice" in value && "images" in value) fixture.state[index] = { ...value, name: "New fixture", price: 1000, image: "/images/products/1228429.jpg" }; });
  tree = fixture.render();
  await nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  const save = posts.find(post => post.url === "/api/admin/products");
  assert.ok(save, "the product was saved");
  assert.equal(save.body.originalPrice, null, "no compareAt is stored");
  assert.equal(save.body.price, 1000);
});

// Follow-up F-a: a published product needs a price above 0; the form blocks the save and says so next to the price.
test("the admin form blocks a published save at price 0 and shows the message next to the price", async () => {
  const posts = [];
  const fixture = componentFixture(FILE, {
    backend: "postgres", items: [{ ...product, price: 0 }],
    modules: { "@/components/admin/products/StatusMenu": statusMenu },
    fetcher: async (url, options = {}) => { if (options.method === "POST") posts.push({ url, body: JSON.parse(options.body) }); return { ok: true, status: 200, json: async () => ({ items: [] }) }; },
  });
  nodes(fixture.render()).find(node => node.props?.["aria-label"] === "Edit Forerunner fixture").props.onClick();
  const form = nodes(fixture.render()).find(node => node.type === "form");
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(posts.length, 0, "nothing is sent");
  const message = nodes(fixture.render()).find(node => node.props?.id === "product-price-error");
  assert.ok(message, "the message sits next to the price field");
  assert.match(JSON.stringify(message.props.children), /Set a price above 0 before publishing\./);
  const price = nodes(fixture.render()).find(node => node.props?.id === "product-price");
  assert.equal(price.props["aria-invalid"], true);
});

test("a price-0 draft still saves", async () => {
  const posts = [];
  const fixture = componentFixture(FILE, {
    backend: "postgres", items: [{ ...product, price: 0, status: "draft" }],
    modules: { "@/components/admin/products/StatusMenu": statusMenu },
    fetcher: async (url, options = {}) => { if (options.method === "POST") posts.push({ url, body: JSON.parse(options.body) }); return { ok: true, status: 200, json: async () => ({ items: [] }) }; },
  });
  nodes(fixture.render()).find(node => node.props?.["aria-label"] === "Edit Forerunner fixture").props.onClick();
  await nodes(fixture.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(posts.length, 1);
});
