// The initial load files existing bands and straps under their accessory type so live type links work at once.
import assert from "node:assert/strict";
import test from "node:test";
import { accessoryTypeKey } from "../../src/server/catalog/taxonomy-load.ts";

test("band widths and families map to their type", () => {
  assert.equal(accessoryTypeKey("QuickFit 20 Watch Bands QuickFit® 20 Watch Bands", "bands"), "bands/quickfit-20-mm");
  assert.equal(accessoryTypeKey("QuickFit® 26 Watch Bands", "bands"), "bands/quickfit-26-mm");
  assert.equal(accessoryTypeKey("Quick Release Bands (20 mm)", "bands"), "bands/quick-release-20-mm");
  assert.equal(accessoryTypeKey("Lily 2 Bands", "bands"), "bands/lily-bands");
});
test("MARQ straps go to MARQ Straps or MARQ Bracelets, not QuickFit 22", () => {
  assert.equal(accessoryTypeKey("QuickFit 22 Watch Straps QuickFit® 22 Watch Straps", "marq-straps-bracelets"), "marq-straps-bracelets/marq-straps");
  assert.equal(accessoryTypeKey("MARQ Silicone Rubber Bracelet", "marq-straps-bracelets"), "marq-straps-bracelets/marq-bracelets");
});
test("watches and unknown accessories get no type", () => {
  assert.equal(accessoryTypeKey("fēnix 9 fēnix® 9 Pro", "outdoor-recreation/adventure-smartwatches"), null);
  assert.equal(accessoryTypeKey("Charging/Data Cable", "cables-chargers"), null);
});
