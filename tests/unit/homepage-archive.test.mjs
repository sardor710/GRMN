import test from "node:test";
import assert from "node:assert/strict";
import { withoutArchived, setEntryArchived, removeEntry, moveEntry } from "../../src/lib/cms/homepage-archive.ts";
import { homepageInput } from "../../src/server/auth/admin-schemas.ts";

const banner = (id, extra = {}) => ({ id, key: id, title: id, subtitle: "", image: "/a.jpg", href: "/", active: true, order: 1, ...extra });
const item = (id, extra = {}) => ({ id, title: id, description: "", price: "", image: "/a.jpg", href: "/", order: 1, ...extra });
const tile = (id, extra = {}) => ({ id, title: id, image: "/a.jpg", href: "/", cta: "SHOP", order: 1, ...extra });
const carousel = (id, items, extra = {}) => ({ id, title: id, type: "product", active: true, order: 1, items, ...extra });

function sample() {
  return {
    heroBanners: [banner("A"), banner("B", { archived: true })],
    carousels: [
      carousel("C1", [item("I1"), item("I2", { archived: true }), item("I3")]),
      carousel("C2", [item("I4")], { archived: true }),
    ],
    promoTiles: [tile("P1", { archived: true })],
    storyTiles: [tile("S1", { archived: true })],
    categoryTiles: [tile("K1", { archived: true })],
  };
}

test("withoutArchived drops archived entries at every level", () => {
  const input = sample();
  const before = structuredClone(input);
  const out = withoutArchived(input);
  assert.deepEqual(out.heroBanners.map((b) => b.id), ["A"]);
  assert.deepEqual(out.carousels.map((c) => c.id), ["C1"]);
  assert.deepEqual(out.carousels[0].items.map((i) => i.id), ["I1", "I3"]);
  assert.equal(out.promoTiles.length, 0);
  assert.equal(out.storyTiles.length, 0);
  assert.equal(out.categoryTiles.length, 0);
  assert.deepEqual(input, before, "input must not be mutated");
});

test("withoutArchived with every banner archived returns heroBanners []", () => {
  const config = sample();
  config.heroBanners = [banner("A", { archived: true })];
  assert.deepEqual(withoutArchived(config).heroBanners, []);
});

test("setEntryArchived archives and restores without touching siblings", () => {
  const config = sample();
  const archived = setEntryArchived(config, { section: "carousels", id: "C1" }, true);
  assert.equal(archived.carousels[0].archived, true);
  assert.equal(archived.carousels[1].archived, true);
  const restored = setEntryArchived(archived, { section: "carousels", id: "C1" }, false);
  assert.equal("archived" in restored.carousels[0], false);
  assert.equal(restored.carousels[0].items[1].archived, true, "an archived card stays archived when its carousel is restored");
  const card = setEntryArchived(config, { section: "carouselItems", carouselId: "C1", id: "I1" }, true);
  assert.equal(card.carousels[0].items[0].archived, true);
  assert.equal("archived" in config.carousels[0].items[0], false, "input must not be mutated");
});

test("removeEntry removes only the referenced entry", () => {
  const config = sample();
  assert.deepEqual(removeEntry(config, { section: "heroBanners", id: "B" }).heroBanners.map((b) => b.id), ["A"]);
  assert.deepEqual(removeEntry(config, { section: "carouselItems", carouselId: "C1", id: "I3" }).carousels[0].items.map((i) => i.id), ["I1", "I2"]);
  assert.deepEqual(removeEntry(config, { section: "categoryTiles", id: "K1" }).categoryTiles, []);
  assert.equal(config.heroBanners.length, 2, "input must not be mutated");
});

test("moveEntry skips archived neighbours", () => {
  const config = sample();
  config.heroBanners = [banner("A", { order: 1 }), banner("B", { archived: true, order: 2 }), banner("C", { order: 3 })];
  const moved = moveEntry(config, { section: "heroBanners", id: "C" }, "up");
  assert.deepEqual(moved.heroBanners.map((b) => b.id), ["C", "B", "A"]);
  assert.deepEqual(moved.heroBanners.map((b) => b.order), [1, 2, 3]);
  const edge = moveEntry(moved, { section: "heroBanners", id: "C" }, "up");
  assert.deepEqual(edge.heroBanners.map((b) => b.id), ["C", "B", "A"], "first visible entry cannot move up");
});

test("unknown id is a no-op", () => {
  const config = sample();
  assert.deepEqual(setEntryArchived(config, { section: "heroBanners", id: "nope" }, true), config);
  assert.deepEqual(removeEntry(config, { section: "carouselItems", carouselId: "nope", id: "I1" }), config);
  assert.deepEqual(moveEntry(config, { section: "promoTiles", id: "nope" }, "down"), config);
});

test("homepageInput accepts archived booleans and rejects strings", () => {
  const config = sample();
  assert.doesNotThrow(() => homepageInput.parse(config));
  const bad = sample();
  bad.categoryTiles = [tile("K1", { archived: "yes" })];
  assert.throws(() => homepageInput.parse(bad));
});
