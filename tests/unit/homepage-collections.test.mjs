import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveHomepageCollections } from "../../src/lib/cms/homepage-collections.ts";

const inline = { id: "inline", title: "Inline card", description: "", price: "1", image: "/i.jpg", href: "/", order: 0 };
const config = (carousels) => ({ heroBanners: [], promoTiles: [], storyTiles: [], categoryTiles: [], carousels });

test("a carousel bound to a published collection shows its products in order with KZT labels", async () => {
  const reads = [];
  const result = await resolveHomepageCollections(
    config([{ id: "c", title: "Featured", type: "promo", active: true, order: 0, collectionKey: "featured", items: [inline] }]),
    async (key) => {
      reads.push(key);
      return { key, name: "Featured", products: [
        { id: "b", name: "Second", price: 1500, originalPrice: 2000, image: "/b.jpg", badge: "SALE" },
        { id: "a/x", name: "First", price: 99.5, badge: "NONE" },
      ] };
    },
  );
  const carousel = result.carousels[0];
  assert.deepEqual(reads, ["featured"]);
  assert.equal(carousel.type, "product");
  // Task 5a.2: labels use the shared Intl KZT format (en default); Intl puts a no-break space after "KZT".
  const plain = (v) => (typeof v === "string" ? v.replace(/[\u00a0\u202f]/g, " ") : v);
  assert.deepEqual(carousel.items.map((i) => [i.title, plain(i.price), plain(i.originalPrice), i.badge, i.href, i.order]), [
    ["Second", "KZT 1,500.00", "KZT 2,000.00", "SALE", "/p/b", 0],
    ["First", "KZT 99.50", undefined, undefined, "/p/a%2Fx", 1],
  ]);
});

test("a missing or unpublished collection keeps the inline cards; unbound carousels are untouched", async () => {
  const input = config([
    { id: "c1", title: "Bound", type: "product", active: true, order: 0, collectionKey: "draft-only", items: [inline] },
    { id: "c2", title: "Plain", type: "product", active: true, order: 1, items: [inline] },
  ]);
  const result = await resolveHomepageCollections(input, async () => null);
  assert.deepEqual(result.carousels, input.carousels);
});

test("a published but empty collection empties the carousel (an editor may clear it)", async () => {
  const result = await resolveHomepageCollections(
    config([{ id: "c", title: "Bound", type: "product", active: true, order: 0, collectionKey: "empty", items: [inline] }]),
    async (key) => ({ key, name: "Empty", products: [] }),
  );
  assert.deepEqual(result.carousels[0].items, []);
});

test("no collection keys means no reads", async () => {
  const input = config([{ id: "c", title: "Plain", type: "product", active: true, order: 0, items: [inline] }]);
  assert.equal(await resolveHomepageCollections(input, async () => { throw new Error("must not read"); }), input);
});
