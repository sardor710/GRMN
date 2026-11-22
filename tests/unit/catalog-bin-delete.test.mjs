// Owner 2026-11-22 (admin bin): a bin icon on every product and SKU row of the admin Products list. Every delete asks
// first and names what goes; a refused product delete (orders or checkout history) offers Archive instead; the bin in a
// clickable SKU row never opens the quick-edit drawer.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { componentFixture, nodes } from "../helpers/component-fixture.mjs";
import { AdminDeleteError, deleteCatalogVariant, deleteProductPermanently } from "../../src/lib/admin-collection.ts";

const SCREEN = "src/app/admin/products/_components/CatalogScreen.tsx";
const product = { id: "prod-key-1", name: "Synthetic fēnix", version: 7, status: "published", family: "fēnix", thumbnail: null, variantCount: 2, primaryCategory: null, stock: { available: 4, onHand: 4 }, price: { min: 1000, max: 2000 }, updatedAt: "2026-11-22T10:00:00Z" };
const sku = { variantId: "6f1c2b9e-0a43-4d1e-9a51-3c2f6b7d8e90", sku: "SYN-51-G", title: "51 mm Gray", options: [{ option: "Color", value: "Gray" }], productId: "prod-key-1", productName: "Synthetic fēnix", productStatus: "published", productVersion: 7, price: 1000, compareAt: null, stock: { onHand: 4, reserved: 0, available: 4, tracked: true }, status: "active", isDefault: false, thumbnail: null, updatedAt: "2026-11-22T10:00:00Z" };

let calls, confirms, answers;
beforeEach(() => { calls = []; confirms = []; answers = []; globalThis.window = { confirm: message => { confirms.push(message); return answers.length ? answers.shift() : true; } }; });

function screen(view, { failWith } = {}) {
  const list = items => ({ items, loading: false, error: null, total: items.length, reload() { calls.push(["reload"]); }, hasPrevious: false, hasNext: false, pageNumber: 1, next() {}, previous() {} });
  return componentFixture(SCREEN, {
    modules: {
      "@/hooks/useCatalogList": { useCatalogList: kind => list(kind === "products" ? [product] : [sku]) },
      "@/components/admin/catalog/usePersistentChoice": { usePersistentChoice: () => [view, () => {}] },
      "@/components/admin/catalog/useDebouncedValue": { useDebouncedValue: value => value },
      "@/lib/utils": { cn: (...parts) => parts.filter(Boolean).join(" ") },
      "@/components/admin/product-editor": { formatKzt: value => String(value) },
      "@/lib/admin-collection": {
        AdminDeleteError,
        archiveAdminRecord: async (_fetch, resource, record) => { calls.push(["archive", resource, record]); return { success: true }; },
        deleteProductPermanently: async (_fetch, record) => { calls.push(["deleteProduct", record]); if (failWith) throw failWith; },
        deleteCatalogVariant: async (_fetch, input) => { calls.push(["deleteSku", input]); if (failWith) throw failWith; },
      },
    },
  });
}
const named = (tree, name) => nodes(tree).filter(node => typeof node.type === "function" && node.type.name === name);
const expandTable = (fixture, name) => { const [table] = named(fixture.render(), name); return table.type(table.props); };
const bin = (tree, label) => named(tree, "BinButton").find(node => node.props.label === label);

test("grouped row has a bin that confirms and calls the permanent delete", async () => {
  const fixture = screen("products");
  const button = bin(expandTable(fixture, "GroupedTable"), "Delete Synthetic fēnix");
  assert.ok(button, "bin on the product row");
  await button.props.onClick();
  assert.match(confirms[0], /^Delete “Synthetic fēnix” permanently\?/);
  assert.match(confirms[0], /cannot be undone/);
  assert.deepEqual(calls.filter(call => call[0] !== "reload"), [["deleteProduct", { id: "prod-key-1", version: 7 }]]);
  assert.ok(calls.some(call => call[0] === "reload"), "the list reloads");
});

test("cancelling the confirm sends nothing", async () => {
  const fixture = screen("products");
  answers.push(false);
  await bin(expandTable(fixture, "GroupedTable"), "Delete Synthetic fēnix").props.onClick();
  assert.deepEqual(calls, []);
});

test("a refused product delete offers archive", async () => {
  const fixture = screen("products", { failWith: new AdminDeleteError("This product has orders, so it cannot be deleted; archive it instead", "CONFLICT", 409) });
  await bin(expandTable(fixture, "GroupedTable"), "Delete Synthetic fēnix").props.onClick();
  assert.equal(confirms.length, 2);
  assert.match(confirms[1], /has orders/);
  assert.match(confirms[1], /Archive “Synthetic fēnix” instead\?/);
  assert.deepEqual(calls.find(call => call[0] === "archive"), ["archive", "products", { id: "prod-key-1", version: 7 }]);
});

test("a stale product delete reloads the list and explains", async () => {
  const fixture = screen("products", { failWith: new AdminDeleteError("Product changed; reload before deleting", "VERSION_CONFLICT", 409) });
  await bin(expandTable(fixture, "GroupedTable"), "Delete Synthetic fēnix").props.onClick();
  assert.equal(confirms.length, 1);
  assert.ok(calls.some(call => call[0] === "reload"));
  assert.ok(fixture.state.includes("This product changed in another window. The list has been reloaded; try again."));
});

test("SKU bin calls the catalog variant delete with the product version", async () => {
  const fixture = screen("skus");
  await bin(expandTable(fixture, "SkuTable"), "Delete SKU SYN-51-G").props.onClick();
  assert.match(confirms[0], /^Delete SKU SYN-51-G permanently\?/);
  assert.deepEqual(calls.find(call => call[0] === "deleteSku"), ["deleteSku", { variantId: sku.variantId, productVersion: 7 }]);
});

test("bin click does not open the drawer", async () => {
  const fixture = screen("skus");
  const button = bin(expandTable(fixture, "SkuTable"), "Delete SKU SYN-51-G");
  const rendered = button.type(button.props);
  let stopped = false;
  await rendered.props.onClick({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(rendered.props["aria-label"], "Delete SKU SYN-51-G");
  assert.ok(!fixture.state.some(value => value && typeof value === "object" && value.variantId === sku.variantId), "drawer stays closed");
});

test("the expanded variant list has a bin per SKU and no button inside a button", () => {
  const fixture = screen("products");
  const [table] = named(fixture.render(), "GroupedTable");
  const tree = table.type({ ...table.props, expanded: { [product.id]: { status: "ready", rows: [sku] } } });
  assert.ok(bin(tree, "Delete SKU SYN-51-G"));
  for (const button of nodes(tree).filter(node => node.type === "button"))
    assert.equal(nodes(button.props.children).some(node => node.type === "button" || node.type?.name === "BinButton"), false);
});

test("delete helpers send the right requests and surface the server's code and message", async () => {
  const sent = [];
  const reply = (status, body) => async (url, options) => { sent.push([url, options?.method]); return { ok: status < 300, status, json: async () => body }; };
  await deleteProductPermanently(reply(200, { deleted: true }), { id: "prod key", version: 3 });
  await deleteCatalogVariant(reply(200, { product: { id: "p", version: 4 }, deleted: true }), { variantId: sku.variantId, productVersion: 3 });
  assert.deepEqual(sent, [["/api/admin/products?id=prod+key&version=3&permanent=1", "DELETE"], [`/api/admin/catalog/variants/${sku.variantId}?version=3`, "DELETE"]]);
  await assert.rejects(deleteCatalogVariant(reply(409, { error: { code: "CONFLICT", message: "This SKU has orders, so it cannot be deleted; archive it instead" } }), { variantId: sku.variantId, productVersion: 3 }),
    error => error instanceof AdminDeleteError && error.code === "CONFLICT" && error.status === 409 && /has orders/.test(error.message));
  await assert.rejects(deleteProductPermanently(reply(500, null), { id: "x", version: 1 }), error => error instanceof AdminDeleteError && error.code === "UNKNOWN" && error.message === "The delete could not be completed. Check your permissions and try again.");
});
