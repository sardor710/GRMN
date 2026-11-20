// Task C-c: the catalogue compare selection (src/lib/compare/selection.ts): pure list rules (add, remove, cap at
// five, duplicates, toggles, the compare link) and the localStorage store with its in-memory fallback.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as selection from "../../src/lib/compare/selection.ts";

const { findVariantEntry, toggleVariant, addItem, removeItem, toggleItem, toggleProduct, hasItem, hasProduct, isSelectionFull, parseSelection, serializeSelection, selectionHref, createCompareSelectionStore, COMPARE_SELECTION_KEY, COMPARE_SELECTION_EVENT } = selection;

const watch = { productId: "fenix-8", sku: "F8-47", name: "fēnix 8", image: "/f8.jpg" };
const ids = (items) => items.map((item) => (item.sku ? `${item.productId}~${item.sku}` : item.productId));

test("add appends, ignores duplicates (SKU case-insensitive) and stops at five", () => {
  let items = addItem([], watch);
  assert.deepEqual(items, [watch]);
  assert.equal(addItem(items, { productId: "fenix-8", sku: "f8-47" }), items, "same size is a duplicate");
  items = addItem(items, { productId: "fenix-8", sku: "F8-51" });
  assert.deepEqual(ids(items), ["fenix-8~F8-47", "fenix-8~F8-51"], "another size of the same product is its own item");
  for (const id of ["a", "b", "c"]) items = addItem(items, { productId: id });
  assert.equal(items.length, 5);
  assert.ok(isSelectionFull(items));
  assert.equal(addItem(items, { productId: "d" }), items, "a sixth item is refused");
  assert.equal(addItem([], { productId: "  " }).length, 0, "blank ids are refused");
});

test("remove and the two toggles", () => {
  const items = [watch, { productId: "fenix-8", sku: "F8-51" }, { productId: "venu" }];
  assert.deepEqual(ids(removeItem(items, { productId: "fenix-8", sku: "f8-51" })), ["fenix-8~F8-47", "venu"]);
  // Product page: exactly this size.
  assert.deepEqual(ids(toggleItem(items, { productId: "fenix-8", sku: "F8-47" })), ["fenix-8~F8-51", "venu"]);
  assert.deepEqual(ids(toggleItem([], watch)), ["fenix-8~F8-47"]);
  // Catalogue card: any size counts, removing drops every size.
  assert.ok(hasProduct(items, "fenix-8"));
  assert.deepEqual(ids(toggleProduct(items, { productId: "fenix-8" })), ["venu"]);
  assert.deepEqual(ids(toggleProduct(items, { productId: "instinct" })), ["fenix-8~F8-47", "fenix-8~F8-51", "venu", "instinct"]);
  assert.ok(hasItem(items, { productId: "venu" }));
  assert.ok(!hasItem(items, { productId: "venu", sku: "V1" }));
});

test("stored JSON round-trips; malformed or over-long input is cleaned", () => {
  const raw = serializeSelection([watch, { productId: "venu" }]);
  assert.deepEqual(parseSelection(raw), [watch, { productId: "venu" }]);
  assert.deepEqual(parseSelection("not json"), []);
  assert.deepEqual(parseSelection('{"productId":"a"}'), []);
  assert.deepEqual(ids(parseSelection(JSON.stringify([{ productId: "a" }, { productId: 4 }, null, { productId: "a" }, { productId: "b", sku: "x".repeat(300) }, ..."cdefg".split("").map((productId) => ({ productId }))]))), ["a", "c", "d", "e", "f"]);
});

test("the compare link uses compareHref (no locale prefix, SKU after ~)", () => {
  assert.equal(selectionHref([watch, { productId: "venu", name: "Venu" }]), "/compare?item=fenix-8~F8-47&item=venu");
  assert.equal(selectionHref([]), "/compare");
});

function memoryEnvironment({ blocked = false } = {}) {
  const data = new Map();
  const listeners = new Map();
  const storage = {
    getItem: (key) => { if (blocked) throw new Error("SecurityError"); return data.has(key) ? data.get(key) : null; },
    setItem: (key, value) => { if (blocked) throw new Error("QuotaExceededError"); data.set(key, String(value)); },
    removeItem: (key) => { if (blocked) throw new Error("SecurityError"); data.delete(key); },
  };
  const target = {
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) ?? []).filter((other) => other !== fn)),
    dispatchEvent: (event) => { (listeners.get(event.type) ?? []).forEach((fn) => fn(event)); return true; },
  };
  return { data, listeners, env: { storage: () => storage, target: () => target }, target };
}

test("the store writes localStorage, keeps a stable snapshot and notifies this tab and other tabs", () => {
  const { data, env, target, listeners } = memoryEnvironment();
  const store = createCompareSelectionStore(env);
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  const empty = store.getSnapshot();
  assert.deepEqual(empty, []);
  assert.equal(store.getSnapshot(), empty, "same array while nothing changed");
  store.update((items) => toggleProduct(items, watch));
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(data.get(COMPARE_SELECTION_KEY)), [watch]);
  const one = store.getSnapshot();
  assert.deepEqual(one, [watch]);
  assert.equal(store.getSnapshot(), one);
  store.update((items) => addItem(items, watch));
  assert.equal(calls, 1, "a no-op change neither writes nor notifies");
  // Another tab changes the key: the storage event reaches the subscriber; other keys are ignored.
  data.set(COMPARE_SELECTION_KEY, JSON.stringify([{ productId: "venu" }]));
  target.dispatchEvent(Object.assign(new Event("storage"), { key: COMPARE_SELECTION_KEY }));
  target.dispatchEvent(Object.assign(new Event("storage"), { key: "other" }));
  assert.equal(calls, 2);
  assert.deepEqual(store.getSnapshot(), [{ productId: "venu" }]);
  // Clearing removes the key.
  store.update(() => []);
  assert.equal(data.has(COMPARE_SELECTION_KEY), false);
  assert.equal(calls, 3);
  unsubscribe();
  assert.equal(listeners.get(COMPARE_SELECTION_EVENT).length, 0);
  assert.equal(listeners.get("storage").length, 0);
});

test("with storage blocked the selection lives in memory and still notifies", () => {
  const { env } = memoryEnvironment({ blocked: true });
  const store = createCompareSelectionStore(env);
  let calls = 0;
  store.subscribe(() => calls++);
  assert.deepEqual(store.getSnapshot(), []);
  store.update((items) => addItem(items, watch));
  store.update((items) => addItem(items, { productId: "venu" }));
  assert.equal(calls, 2);
  assert.deepEqual(ids(store.getSnapshot()), ["fenix-8~F8-47", "venu"]);
});

test("on the server (no window) the store is empty and inert", () => {
  const store = createCompareSelectionStore({ storage: () => null, target: () => null });
  assert.deepEqual(store.getSnapshot(), []);
  const unsubscribe = store.subscribe(() => assert.fail("no events on the server"));
  unsubscribe();
  assert.equal(selection.compareSelection.getSnapshot().length, 0);
});

test("product page toggle: exact size removes, a SKU-less card entry is replaced in place, otherwise adds", () => {
  const card = [{ productId: "venu" }, { productId: "fenix-8", name: "fēnix 8" }];
  assert.deepEqual(findVariantEntry(card, { productId: "fenix-8", sku: "F8-51" }), { item: card[1], exact: false });
  assert.equal(findVariantEntry(card, { productId: "instinct", sku: "I-1" }), null);
  const replaced = toggleVariant(card, { productId: "fenix-8", sku: "F8-51", name: "fēnix 8" });
  assert.deepEqual(ids(replaced), ["venu", "fenix-8~F8-51"]);
  assert.deepEqual(findVariantEntry(replaced, { productId: "fenix-8", sku: "f8-51" }).exact, true);
  assert.deepEqual(ids(toggleVariant(replaced, { productId: "fenix-8", sku: "F8-51" })), ["venu"]);
  // Another size of a product already compared by SKU is its own column.
  assert.deepEqual(ids(toggleVariant(replaced, { productId: "fenix-8", sku: "F8-47" })), ["venu", "fenix-8~F8-51", "fenix-8~F8-47"]);
  // A product without variants (no SKU) toggles exactly.
  assert.deepEqual(ids(toggleVariant(card, { productId: "venu" })), ["fenix-8"]);
  // Replacing works even when the list is full.
  const full = [{ productId: "a" }, { productId: "b" }, { productId: "c" }, { productId: "d" }, { productId: "fenix-8" }];
  assert.deepEqual(ids(toggleVariant(full, { productId: "fenix-8", sku: "F8-47" })).at(-1), "fenix-8~F8-47");
});

// Task C-d (from the C-c review): the product page before its variant loads asks with no SKU. It must find the size
// already compared for that product instead of adding a second, SKU-less entry.
test("product page toggle without a SKU (variant not loaded yet) matches any entry of the product, never duplicates", () => {
  const compared = [{ productId: "venu" }, { productId: "fenix-8", sku: "F8-51", name: "fēnix 8" }];
  assert.deepEqual(findVariantEntry(compared, { productId: "fenix-8" }), { item: compared[1], exact: true });
  assert.equal(findVariantEntry(compared, { productId: "instinct" }), null);
  const toggled = toggleVariant(compared, { productId: "fenix-8", name: "fēnix 8" });
  assert.deepEqual(ids(toggled), ["venu"], "the toggle removes the compared size; no SKU-less entry is added");
  assert.ok(!toggled.some((item) => item.productId === "fenix-8"));
  // With a SKU the rules are unchanged: another size is its own column.
  assert.deepEqual(ids(toggleVariant(compared, { productId: "fenix-8", sku: "F8-47" })), ["venu", "fenix-8~F8-51", "fenix-8~F8-47"]);
});
