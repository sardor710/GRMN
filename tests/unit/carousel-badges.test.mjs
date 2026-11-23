import test from "node:test";
import assert from "node:assert/strict";
import { CAROUSEL_BADGES, badgeCode, discountPercent } from "../../src/lib/cms/carousel-badges.ts";

// Owner 2026-11-23: garmin.ae-style starburst badges on homepage carousel cards.
test("the badge set is NEW, SALE, SOON, HIT, LIMITED, EXCLUSIVE, PREORDER", () => {
  assert.deepEqual(CAROUSEL_BADGES.map((b) => b.code), ["NEW", "SALE", "SOON", "HIT", "LIMITED", "EXCLUSIVE", "PREORDER"]);
  assert.equal(new Set(CAROUSEL_BADGES.map((b) => b.tone)).size, 7, "every badge has its own colour");
});

test("badgeCode maps stored and catalog badge text to a code", () => {
  for (const [raw, code] of [["NEW", "NEW"], ["new", "NEW"], ["SALE", "SALE"], ["SOON", "SOON"], ["COMING SOON", "SOON"], ["BEST SELLER", "HIT"], ["POPULAR", "HIT"], ["HIT", "HIT"],
    ["LIMITED EDITION", "LIMITED"], ["LIMITED", "LIMITED"], ["EXCLUSIVE", "EXCLUSIVE"], ["PRE-ORDER", "PREORDER"], ["PREORDER", "PREORDER"]]) assert.equal(badgeCode(raw), code, raw);
  for (const raw of [undefined, "", "NONE", "GARMIN SIGNATURE", "CARBON EDITION"]) assert.equal(badgeCode(raw), null, String(raw));
});

test("discountPercent reads tenge price text and rounds the saving", () => {
  assert.equal(discountPercent("₸99 000", "₸120 000"), 18);
  assert.equal(discountPercent("99 000 KZT", "120 000 KZT"), 18);
  assert.equal(discountPercent("₸349 995", "₸399 995"), 13);
  for (const [price, old] of [["", "₸120 000"], ["₸99 000", ""], ["₸120 000", "₸99 000"], ["₸99 000", "₸99 000"], ["call us", "₸1"]]) assert.equal(discountPercent(price, old), null, `${price} / ${old}`);
});
