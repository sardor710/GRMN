import test from "node:test";
import assert from "node:assert/strict";
import { CAROUSEL_BADGES, badgeCode, badgeSize, discountPercent, savingsParts } from "../../src/lib/cms/carousel-badges.ts";

// Owner 2026-11-23: garmin.ae-style starburst badges on homepage carousel cards.
test("the badge set is NEW, SALE, SOON, HIT, LIMITED, EXCLUSIVE, PREORDER", () => {
  assert.deepEqual(CAROUSEL_BADGES.map((b) => b.code), ["NEW", "SALE", "SOON", "HIT", "LIMITED", "EXCLUSIVE", "PREORDER"]);
  assert.ok(CAROUSEL_BADGES.every((b) => b.tone === "black"), "every badge is black, as on garmin.ae");
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

// Owner 2026-11-23: any badge text goes into the starburst; the text size follows the longest word and line count.
test("badgeSize: short words large, 6-7 letters medium, longer or multi-word text small", () => {
  for (const text of ["NEW", "Хит", "SOON", "SALE"]) assert.equal(badgeSize(text), "large", text);
  for (const text of ["НОВИНКА", "Скидка", "LIMITED", "ЖАҚЫНДА"]) assert.equal(badgeSize(text), "medium", text);
  for (const text of ["EXCLUSIVE", "Pre-order", "Save 50,000 KZT", "Экономия 125 000 KZT", "50 000 KZT үнемдеңіз", "Алдын ала тапсырыс"]) assert.equal(badgeSize(text), "small", text);
});

test("savingsParts splits catalog savings text into the word and a tenge amount", () => {
  assert.deepEqual(savingsParts("Save 50,000 KZT"), { word: "Save", amount: "50,000 ₸" });
  assert.deepEqual(savingsParts("Экономия 125 000 KZT"), { word: "Экономия", amount: "125 000 ₸" });
  assert.deepEqual(savingsParts("50 000 KZT үнемдеңіз"), { word: "үнемдеңіз", amount: "50 000 ₸" });
  assert.deepEqual(savingsParts("Save 25\u00a0000 ₸"), { word: "Save", amount: "25\u00a0000 ₸" });
  for (const text of ["NEW", "GARMIN SIGNATURE", "50 000"]) assert.equal(savingsParts(text), null, text);
});
