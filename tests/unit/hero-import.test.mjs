import test from "node:test";
import assert from "node:assert/strict";
import { appendHeroBanners } from "../../src/lib/cms/hero-import.ts";

const banner = (id, order, extra = {}) => ({ id, key: id, title: id, subtitle: "", image: "/a.jpg", href: "/", active: true, order, ...extra });
const base = () => ({
  heroBanners: [banner("live-1", 1), banner("live-2", 2)],
  carousels: [], promoTiles: [], storyTiles: [], categoryTiles: [],
  translations: { ru: { heroBanners: { "live-1": { title: "ЖИВОЙ" } } } },
});
const imported = [
  { key: "marq", title: "MARQ® GEN 3", subtitle: "Luxury", href: "/minisite/marq", image: "/uploads/homepage/2026/a.webp", translations: { ru: { title: "MARQ® GEN 3", subtitle: "Люкс" }, kk: { subtitle: "Люкс" } } },
  { key: "edge-1060", title: "EDGE® 1060", subtitle: "Bike", href: "/c/x", image: "/uploads/homepage/2026/b.webp" },
];

test("appendHeroBanners keeps current slides and appends the imported ones after them", () => {
  const input = base();
  const { config, added, skipped } = appendHeroBanners(input, imported);
  assert.deepEqual(config.heroBanners.map((b) => b.id), ["live-1", "live-2", "tr-marq", "tr-edge-1060"]);
  assert.deepEqual(config.heroBanners.map((b) => b.order), [1, 2, 3, 4]);
  assert.deepEqual(added, ["tr-marq", "tr-edge-1060"]);
  assert.deepEqual(skipped, []);
  const marq = config.heroBanners[2];
  assert.deepEqual(marq, { id: "tr-marq", key: "tr-marq", title: "MARQ® GEN 3", subtitle: "Luxury", image: "/uploads/homepage/2026/a.webp", href: "/minisite/marq", active: true, order: 3 });
  assert.equal(input.heroBanners.length, 2, "input is not mutated");
});

test("appendHeroBanners merges ru/kk text without touching existing translations", () => {
  const { config } = appendHeroBanners(base(), imported);
  assert.deepEqual(config.translations.ru.heroBanners["live-1"], { title: "ЖИВОЙ" });
  assert.deepEqual(config.translations.ru.heroBanners["tr-marq"], { title: "MARQ® GEN 3", subtitle: "Люкс" });
  assert.deepEqual(config.translations.kk.heroBanners["tr-marq"], { subtitle: "Люкс" });
  assert.equal(config.translations.ru.heroBanners["tr-edge-1060"], undefined);
});

test("appendHeroBanners is idempotent: a second run adds nothing", () => {
  const first = appendHeroBanners(base(), imported).config;
  const second = appendHeroBanners(first, imported);
  assert.deepEqual(second.added, []);
  assert.deepEqual(second.skipped, ["tr-marq", "tr-edge-1060"]);
  assert.deepEqual(second.config, first);
});
