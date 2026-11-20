// Final review M17: a stored NEW / SALE badge uses the page's messages (en/ru/kk) like the computed sale badge;
// other stored labels stay the owner's text. M18: the accessory ribbon's position classes are merged with cn().
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as utils from "../../src/lib/utils.ts";
import { componentFixture, nodes } from "../helpers/component-fixture.mjs";

const messages = Object.fromEntries(["en", "ru", "kk"].map(locale => [locale, JSON.parse(fs.readFileSync(`messages/${locale}.json`, "utf8"))]));
const badge = props => componentFixture("src/components/GarminBadge.tsx", { modules: { "@/lib/utils": utils } }).render(props);

test("every locale has the ProductBadge messages, and sale matches the computed sale badge", () => {
  for (const locale of ["en", "ru", "kk"]) {
    assert.ok(messages[locale].ProductBadge?.new, `${locale} ProductBadge.new`);
    assert.equal(messages[locale].ProductBadge.sale, messages[locale].ProductTop.sale, `${locale} sale wording`);
  }
});

test("stored NEW and SALE badges render the localized words; other labels keep their text", () => {
  for (const locale of ["en", "ru", "kk"]) {
    const labels = messages[locale].ProductBadge;
    assert.equal(badge({ badge: "SALE", labels }).props.children, labels.sale);
    assert.equal(badge({ badge: "new", labels }).props.children, labels.new);
    assert.equal(badge({ badge: "LIMITED EDITION", labels }).props.children, "Limited edition");
  }
  assert.equal(messages.ru.ProductBadge.new, "Новинка");
  // Without labels (admin) the English wording stays.
  assert.equal(badge({ badge: "SALE" }).props.children, "Sale");
});

test("the ribbon's default position is replaced by the caller's, not doubled", () => {
  const className = badge({ badge: "NEW", variant: "ribbon", className: "left-0 top-0" }).props.className;
  assert.match(className, /\bleft-0\b/);
  assert.match(className, /\btop-0\b/);
  assert.doesNotMatch(className, /\bleft-4\b|\btop-4\b/);
  assert.match(badge({ badge: "NEW", variant: "ribbon" }).props.className, /absolute left-4 top-4 z-10/);
});

test("ProductCard passes the localized badge words", () => {
  const product = { id: "p", name: "Venu", image: null, badge: "SALE", price: 1000, currency: "KZT" };
  const tree = componentFixture("src/components/ProductCard.tsx", { modules: { "@/i18n/navigation": { Link: "a" } } }).render({ product });
  const ribbon = nodes(tree).find(node => node.props?.badge === "SALE");
  assert.deepEqual(ribbon.props.labels, messages.en.ProductBadge);
});
