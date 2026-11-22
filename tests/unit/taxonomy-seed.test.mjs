import assert from "node:assert/strict";
import test from "node:test";
import { LEGACY_CATALOG_SLUGS, taxonomySeed } from "../../src/server/catalog/taxonomy-seed.ts";
import fs from "node:fs";
import { megaNav } from "../../src/lib/homepage-nav.ts";

// Menu labels are message keys (Header namespace); the taxonomy mirrors their English text.
const enMessages = JSON.parse(fs.readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"));
const en = (key) => key ? key.split(".").reduce((node, part) => node?.[part], enMessages) : "";

// Same pattern as the categories_slug_valid check in migration 0013.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;
const byKey = new Map(taxonomySeed.map((node) => [node.key, node]));
const children = (parentKey) => taxonomySeed.filter((node) => node.parentKey === parentKey);
const categoryPath = (href) => href.match(/\/c\/([^?#]+?)\/?(?:[?#]|$)/)?.[1] ?? null;

test("keys and slugs are unique, valid and kinds are known", () => {
  assert.equal(byKey.size, taxonomySeed.length, "duplicate key");
  assert.equal(new Set(taxonomySeed.map((node) => node.slug)).size, taxonomySeed.length, "duplicate slug");
  for (const node of taxonomySeed) {
    assert.match(node.slug, SLUG, node.key);
    assert.equal(node.key, node.slug);
    assert.ok(node.name.trim().length > 0 && node.name === node.name.trim(), node.key);
    assert.ok(["catalog", "accessory", "group"].includes(node.kind), node.key);
    assert.equal(Object.getPrototypeOf(node.presetFilters), Object.prototype, node.key);
    for (const value of Object.values(node.presetFilters)) assert.ok(Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string"), node.key);
  }
});

test("every parent exists, precedes its children and keeps the kind hierarchy", () => {
  const seen = new Set();
  for (const node of taxonomySeed) {
    if (node.parentKey !== null) {
      assert.ok(seen.has(node.parentKey), `${node.key} precedes or lacks parent ${node.parentKey}`);
      const parent = byKey.get(node.parentKey);
      if (node.kind === "catalog") assert.equal(parent.kind, "catalog", node.key);
      if (node.kind === "group") assert.ok(["accessory", "group"].includes(parent.kind), node.key);
      assert.notEqual(node.kind, "accessory", `${node.key}: accessory nodes are top level`);
    }
    for (const menu of node.alsoListedUnder ?? []) {
      assert.equal(byKey.get(menu)?.parentKey, null, `${node.key} lists unknown menu ${menu}`);
      assert.notEqual(menu, node.parentKey, node.key);
    }
    seen.add(node.key);
  }
});

test("accessory roots keep the required order", () => {
  assert.deepEqual(children(null).filter((node) => node.kind === "accessory").map((node) => node.name), [
    "Apps", "Service Plans", "Bands", "Dive Bands", "MARQ Straps & Bracelets", "Cables & Chargers", "Cycling Accessories", "Heart Rate Monitors", "Sensors",
  ]);
});

test("groups cover band fittings, MARQ straps and watch series", () => {
  assert.deepEqual(children("bands").map((node) => node.name), ["QuickFit 20 mm", "QuickFit 22 mm", "QuickFit 26 mm", "Quick Release 18 mm", "Quick Release 20 mm", "Quick Release 22 mm", "Lily Bands"]);
  assert.deepEqual(children("marq-straps-bracelets").map((node) => node.name), ["MARQ Straps", "MARQ Bracelets"]);
  const series = children("watch-series");
  assert.deepEqual(series.map((node) => node.name), ["fēnix", "epix", "Forerunner", "Venu", "vívoactive", "Instinct", "Enduro", "MARQ", "quatix", "tactix", "D2", "Descent", "Approach", "Lily", "vívomove", "Bounce", "Edge"]);
  assert.ok(series.every((node) => node.kind === "group" && !node.navVisible && node.presetFilters.families?.[0] === node.name));
  assert.equal(byKey.get("watch-series").kind, "group");
});

test("the two existing local catalog slugs are kept exactly", () => {
  for (const slug of LEGACY_CATALOG_SLUGS) assert.equal(taxonomySeed.find((node) => node.slug === slug)?.kind, "catalog", slug);
  assert.equal(byKey.get("sports-fitness/running-smartwatches").parentKey, "wearables-smartwatches");
  assert.deepEqual(byKey.get("sports-fitness/running-smartwatches").presetFilters, { activities: ["running"] });
});

test("catalog nodes mirror the garmin.com mega-menu", () => {
  const roots = children(null).filter((node) => node.kind === "catalog");
  assert.deepEqual(roots.map((node) => node.name), megaNav.map((item) => en(item.labelKey)));
  const slugs = new Set(taxonomySeed.map((node) => node.slug));
  const names = new Set(taxonomySeed.map((node) => node.name));
  for (const item of megaNav) {
    const path = categoryPath(item.href);
    if (path) assert.ok(slugs.has(path), `${en(item.labelKey)}: ${path}`);
    for (const column of item.columns ?? []) for (const group of column) for (const link of group.links) {
      const linkPath = link.href.includes("garmin.com/") || link.href.startsWith("/c/") ? categoryPath(link.href) : null;
      if (linkPath) assert.ok(slugs.has(linkPath), `${en(item.labelKey)} > ${en(link.labelKey)}: ${linkPath}`);
      const productGroup = en(group.headingKey) === "Products" || !group.headingKey;
      // A product link is a node by label, or shares a node under another label (Adventure Watches).
      if (productGroup) assert.ok(names.has(en(link.labelKey)) || slugs.has(linkPath), `${en(item.labelKey)} > ${en(link.labelKey)}`);
    }
  }
});
