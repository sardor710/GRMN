import test from "node:test";
import assert from "node:assert/strict";
import { localizeHomepage } from "../../src/i18n/translate-record.ts";

// Owner 2026-11-23: a badge picked in admin (NEW, SALE, SOON…) is localized by the storefront, so an older
// translated badge text (e.g. auto-translated "Экономия 50 000 KZT") must not hide it in RU/KZ.
const config = () => ({
  heroBanners: [], promoTiles: [], storyTiles: [], categoryTiles: [],
  carousels: [{ id: "c", title: "Featured", type: "product", active: true, order: 1, items: [
    { id: "a", title: "A", description: "", image: "/a.jpg", href: "/", order: 1, badge: "NEW" },
    { id: "b", title: "B", description: "", image: "/b.jpg", href: "/", order: 2, badge: "Save 50,000 KZT" },
  ] }],
  translations: { ru: { carousels: { c: { items: { a: { badge: "Экономия 50 000 KZT" }, b: { badge: "Экономия 50 000 KZT" } } } } } },
});

test("a badge code from admin wins over a stale translated badge text", () => {
  const items = localizeHomepage(config(), "ru").carousels[0].items;
  assert.equal(items[0].badge, "NEW", "the storefront shows НОВИНКА for this code");
  assert.equal(items[1].badge, "Экономия 50 000 KZT", "free badge text still uses its translation");
});
