// Task 5.2: GA4 ecommerce events. track() pushes GTM-style objects onto window.dataLayer, or calls gtag()
// when the storefront loaded plain gtag.js; purchase is sent once per order.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gaPriceFromMinor, initAnalytics, toGaItem, track, trackPurchaseOnce } from "../../src/lib/analytics/events.ts";

function withWindow(win, work) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
  try { return work(); } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else delete globalThis.window;
  }
}
const item = toGaItem({ productCode: "1953727", name: "Forerunner 965", sku: "010-02809-10", variantName: "47 mm / Black", priceMajor: 349999 });

test("toGaItem maps the variant: item_id is the SKU, item_group_id the product code", () => {
  assert.deepEqual(item, { item_id: "010-02809-10", item_name: "Forerunner 965", item_group_id: "1953727", item_variant: "47 mm / Black", item_brand: "Garmin", price: 349999, quantity: 1 });
  const full = toGaItem({ productCode: "1", name: "A", sku: "S", priceMajor: 10.5, quantity: 3, category: "Running" });
  assert.equal(full.quantity, 3);
  assert.equal(full.item_category, "Running");
  assert.equal("item_variant" in full, false, "no variant name, no item_variant");
  assert.equal(typeof full.price, "number");
});

test("prices are KZT majors as numbers from exact minor-unit strings", () => {
  assert.equal(gaPriceFromMinor("18999000"), 189990);
  assert.equal(gaPriceFromMinor("12345"), 123.45);
  assert.equal(gaPriceFromMinor("0"), 0);
  assert.equal(gaPriceFromMinor("bad"), 0);
});

test("track pushes { ecommerce: null } and then the event onto window.dataLayer, creating it", () => {
  const win = {};
  withWindow(win, () => track("view_item", { currency: "KZT", value: 349999, items: [item] }));
  assert.deepEqual(win.dataLayer, [{ ecommerce: null }, { event: "view_item", ecommerce: { currency: "KZT", value: 349999, items: [item] } }]);
  const existing = [{ already: true }], second = { dataLayer: existing };
  withWindow(second, () => track("add_to_cart", { currency: "KZT", value: 1, items: [] }));
  assert.equal(second.dataLayer, existing, "an existing dataLayer is reused");
  assert.equal(existing.length, 3);
});

test("track is a no-op without a window (server render)", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.doesNotThrow(() => track("view_item", { currency: "KZT", value: 1, items: [] }));
});

test("with plain gtag.js the event goes through gtag('event', name, params)", () => {
  const win = {};
  withWindow(win, () => {
    initAnalytics({ ga4Id: "G-ABC123" });
    assert.equal(typeof win.gtag, "function");
    const commands = win.dataLayer.map(entry => Array.from(entry));
    assert.equal(commands[0][0], "js");
    assert.deepEqual(commands[1], ["config", "G-ABC123", { send_page_view: true }]);
    track("begin_checkout", { currency: "KZT", value: 5, items: [item] });
    const last = win.dataLayer.at(-1);
    assert.equal(Object.prototype.toString.call(last), "[object Arguments]", "gtag.js reads Arguments objects");
    assert.deepEqual(Array.from(last), ["event", "begin_checkout", { currency: "KZT", value: 5, items: [item] }]);
    // Initializing twice (a remounted layout) sends no second config.
    const length = win.dataLayer.length;
    initAnalytics({ ga4Id: "G-ABC123" });
    assert.equal(win.dataLayer.length, length);
  });
});

test("with GTM set, gtag is not defined and events stay GTM ecommerce objects", () => {
  const win = {};
  withWindow(win, () => {
    initAnalytics({ gtmId: "GTM-ABCD12", ga4Id: "G-ABC123" });
    assert.equal(win.gtag, undefined);
    assert.equal(win.dataLayer[0].event, "gtm.js");
    assert.equal(typeof win.dataLayer[0]["gtm.start"], "number");
    track("view_item", { currency: "KZT", value: 1, items: [] });
    assert.deepEqual(win.dataLayer.slice(1), [{ ecommerce: null }, { event: "view_item", ecommerce: { currency: "KZT", value: 1, items: [] } }]);
  });
});

test("trackPurchaseOnce sends one purchase per order number", () => {
  const store = new Map();
  const win = { sessionStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) } };
  const params = { currency: "KZT", value: 349999, items: [item], transaction_id: "GR-1001" };
  withWindow(win, () => { trackPurchaseOnce("GR-1001", params); trackPurchaseOnce("GR-1001", params); });
  assert.deepEqual(win.dataLayer.filter(entry => entry.event === "purchase").length, 1);
  assert.equal(store.get("ga-purchase-GR-1001"), "1");
  withWindow(win, () => trackPurchaseOnce("GR-1002", { ...params, transaction_id: "GR-1002" }));
  assert.equal(win.dataLayer.filter(entry => entry.event === "purchase").length, 2);
});

test("trackPurchaseOnce still sends (once per page) when sessionStorage throws", () => {
  const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); } };
  const win = {};
  Object.defineProperty(win, "sessionStorage", { get() { throw new Error("blocked"); } });
  const params = { currency: "KZT", value: 1, items: [], transaction_id: "GR-7" };
  withWindow(win, () => { assert.doesNotThrow(() => { trackPurchaseOnce("GR-7", params); trackPurchaseOnce("GR-7", params); }); });
  assert.equal(win.dataLayer.filter(entry => entry.event === "purchase").length, 1);
  const win2 = { sessionStorage: broken };
  withWindow(win2, () => { assert.doesNotThrow(() => trackPurchaseOnce("GR-8", { ...params, transaction_id: "GR-8" })); });
  assert.equal(win2.dataLayer.filter(entry => entry.event === "purchase").length, 1);
});

test("admin pages never load tags; the storefront layout renders <Analytics/> and verification meta", () => {
  const admin = readFileSync("src/app/admin/layout.tsx", "utf8");
  assert.doesNotMatch(admin, /@\/components\/analytics\/Analytics|components\/analytics/);
  const storefront = readFileSync("src/app/[lang]/layout.tsx", "utf8");
  assert.match(storefront, /from "@\/components\/analytics\/Analytics"/);
  assert.match(storefront, /<Analytics\b/);
  assert.match(storefront, /verification/);
  const component = readFileSync("src/components/analytics/Analytics.tsx", "utf8");
  assert.match(component, /^"use client";/);
  assert.match(component, /from "next\/script"/);
  assert.match(component, /googletagmanager\.com\/gtm\.js\?id=/);
  assert.match(component, /googletagmanager\.com\/gtag\/js\?id=/);
  assert.match(component, /googletagmanager\.com\/ns\.html\?id=/);
});

test("storefront event calls are wired: view_item, add_to_cart, begin_checkout and purchase", () => {
  const top = readFileSync("src/components/ProductTop.tsx", "utf8");
  assert.match(top, /track\("view_item"/);
  assert.match(top, /track\("add_to_cart"/);
  const checkout = readFileSync("src/components/CheckoutPanel.tsx", "utf8");
  assert.match(checkout, /track\("begin_checkout"/);
  assert.match(checkout, /trackPurchaseOnce\(/);
});
