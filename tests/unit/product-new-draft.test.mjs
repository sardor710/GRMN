// Follow-up F-b (F-a review): a new product starts as a draft, so "Add New" never publishes by default
// (a price-0 product would otherwise be blocked from saving at all).
import test from "node:test";
import assert from "node:assert/strict";
import { componentFixture, nodes } from "../helpers/component-fixture.mjs";
const statusMenu = { StatusMenu: () => null };
const FILE = "src/app/admin/products/_components/ProductsScreen.tsx";

test("a new product defaults to status draft and saves as a draft", async () => {
  const posts = [];
  const fixture = componentFixture(FILE, {
    backend: "postgres", items: [],
    modules: { "@/components/admin/products/StatusMenu": statusMenu },
    fetcher: async (url, options = {}) => { if (options.method === "POST") posts.push({ url, body: JSON.parse(options.body) }); return { ok: true, status: 200, json: async () => ({ items: [] }) }; },
  });
  nodes(fixture.render()).find(node => node.type === "button" && typeof node.props?.onClick === "function" && /Add New/.test(JSON.stringify(node.props.children ?? ""))).props.onClick();
  fixture.render();
  const form = fixture.state.find(value => value && typeof value === "object" && "originalPrice" in value && "images" in value);
  assert.equal(form.status, "draft");
  // Price 0 is fine for a draft: the save goes through.
  fixture.state.forEach((value, index) => { if (value === form) fixture.state[index] = { ...value, name: "New draft fixture", image: "/images/products/1228429.jpg" }; });
  await nodes(fixture.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  const save = posts.find(post => post.url === "/api/admin/products");
  assert.ok(save, "the draft was saved");
  assert.equal(save.body.status, "draft");
});
