import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Owner 2026-11-23: the storefront header shows the Garmin "Authorised Distributor" lockup (as on garmin.com.tr).
test("storefront header uses the authorised distributor logo", () => {
  const header = fs.readFileSync("src/components/home/HomeHeader.tsx", "utf8");
  assert.match(header, /<GarminDistributorLogo\b/);
  assert.doesNotMatch(header, /<GarminLogo\b/);
  const icons = fs.readFileSync("src/components/icons.tsx", "utf8");
  assert.match(icons, /export function GarminDistributorLogo/);
  assert.match(icons, /aria-label="Garmin Authorised Distributor"/);
});
