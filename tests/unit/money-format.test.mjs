// Task 5a.2: the one storefront price format. garmin.com prints the locale's native currency format with two
// decimals; the store sells in tenge, so every price is Intl currency KZT in the page locale and never USD.
import test from "node:test";
import assert from "node:assert/strict";
import { formatKzt, formatUnconverted, kztIntlLocale, kztSaving, toMinor, groupMinor, minorToMajor } from "../../src/lib/money.ts";
import { componentFixture, nodeText, nodes } from "../helpers/component-fixture.mjs";

// Final review I2: the output is pinned, so SSR and every browser print the same string. Every separator is
// U+00A0 (written \u00a0 here), the currency token is KZT for en and ₸ for ru and kk, whatever ICU says.
const plain = value => value.replace(/[\u00a0\u202f]/g, " ");
const N = "\u00a0";

test("ru and kk format tenge the Kazakhstan way: 1 350 000,00 ₸", () => {
  assert.equal(formatKzt({ major: 1350000 }, "ru"), `1${N}350${N}000,00${N}₸`);
  assert.equal(formatKzt({ major: 1350000 }, "kk"), `1${N}350${N}000,00${N}₸`);
  assert.equal(formatKzt({ minor: "135000000" }, "ru-RU"), `1${N}350${N}000,00${N}₸`, "an Intl tag maps to ru-KZ");
  assert.equal(kztIntlLocale("ru"), "ru-KZ");
  assert.equal(kztIntlLocale("kk"), "kk-KZ");
  assert.equal(kztIntlLocale("en-US"), "en-KZ");
});

test("en formats tenge as KZT 1,350,000.00 with U+00A0, never ₸", () => {
  assert.equal(formatKzt({ major: "224995" }, "en"), `KZT${N}224,995.00`);
  assert.equal(formatKzt({ major: 1350000 }, "en"), `KZT${N}1,350,000.00`);
  assert.equal(formatKzt({ minor: "0" }, "en-US"), `KZT${N}0.00`);
  assert.equal(formatUnconverted({ major: 749.99 }, "en"), "749.99");
  assert.equal(formatUnconverted({ major: 1350000 }, "ru"), `1${N}350${N}000,00`);
});

test("the output never depends on the ICU currency token or its space", () => {
  // Simulate an ICU that prints ₸ with U+202F for en and KZT for ru: the pinned output must not change.
  const Original = Intl.NumberFormat;
  Intl.NumberFormat = function (locale, options = {}) {
    const real = new Original(locale, options);
    return { formatToParts: value => real.formatToParts(value).map(part =>
      part.type === "group" && /\s/.test(part.value) ? { ...part, value: "\u202f" } : part.type === "currency" ? { ...part, value: locale.startsWith("en") ? "₸" : "KZT" } : part) };
  };
  try {
    assert.equal(formatKzt({ major: 1350000 }, "en"), `KZT${N}1,350,000.00`);
    assert.equal(formatKzt({ major: 1350000 }, "ru"), `1${N}350${N}000,00${N}₸`);
    assert.equal(formatKzt({ major: 1350000 }, "kk"), `1${N}350${N}000,00${N}₸`);
  } finally { Intl.NumberFormat = Original; }
  for (const locale of ["en", "ru", "kk"]) assert.doesNotMatch(formatKzt({ major: 1350000 }, locale), /[ \u202f\u2009]/, locale);
});

test("two decimals always, never dropped", () => {
  assert.equal(formatKzt({ major: 5 }, "ru"), `5,00${N}₸`);
  assert.equal(formatKzt({ minor: "5" }, "ru"), `0,05${N}₸`);
  assert.equal(formatKzt({ major: "799.9" }, "ru"), `799,90${N}₸`);
  assert.equal(formatKzt({ major: 799.99 }, "kk"), `799,99${N}₸`);
  assert.equal(formatKzt({ major: 5 }, "en"), `KZT${N}5.00`);
});

test("minor-unit strings above 2^53 stay exact", () => {
  assert.equal(formatKzt({ minor: "9007199254740993" }, "ru"), `90${N}071${N}992${N}547${N}409,93${N}₸`);
  assert.equal(formatKzt({ minor: 9007199254740993n }, "kk"), `90${N}071${N}992${N}547${N}409,93${N}₸`);
  assert.equal(formatKzt({ major: "90071992547409.93" }, "ru"), `90${N}071${N}992${N}547${N}409,93${N}₸`);
  assert.equal(formatKzt({ minor: "123456789012345678901" }, "en"), `KZT${N}1,234,567,890,123,456,789.01`);
  assert.equal(toMinor({ major: "90071992547409.93" }), "9007199254740993");
  assert.equal(minorToMajor("9007199254740993"), "90071992547409.93");
  assert.equal(groupMinor("9007199254740993", "en-US"), "90,071,992,547,409.93");
});

test("negative nets keep their sign and invalid amounts show a dash instead of throwing", () => {
  assert.equal(formatKzt({ minor: "-150" }, "ru"), `-1,50${N}₸`);
  assert.equal(formatKzt({ minor: "-150" }, "en"), `-KZT${N}1.50`);
  for (const bad of [{ minor: "1.5" }, { minor: "1e3" }, { minor: 1.5 }, { minor: Number.MAX_SAFE_INTEGER + 2 }, { major: "abc" }, { major: Number.NaN }, { major: "1.234" }]) {
    assert.equal(formatKzt(bad, "ru"), "—", JSON.stringify(bad, (_k, v) => (typeof v === "bigint" ? String(v) : v)));
  }
});

test("a sale saving is exact and only exists when the original is higher", () => {
  assert.deepEqual(kztSaving({ major: 274995 }, { major: 224995 }), { minor: 5000000n });
  assert.equal(formatKzt(kztSaving({ major: 274995 }, { major: 224995 }), "ru"), `50${N}000,00${N}₸`);
  assert.equal(kztSaving({ major: 100 }, { major: 100 }), null);
  assert.equal(kztSaving({ major: 90 }, { major: 100 }), null);
});

test("no output is ever USD, whatever the locale or amount", () => {
  for (const locale of ["en", "ru", "kk", "en-US", "ru-RU", "kk-KZ", "de-DE", "fr"]) {
    for (const amount of [{ major: 649.99 }, { major: "1350000.00" }, { minor: "9007199254740993" }, { minor: 0 }]) {
      const value = formatKzt(amount, locale);
      assert.doesNotMatch(value, /\$|USD|US\$/, `${locale} ${value}`);
      assert.match(value, /₸|KZT/, `${locale} ${value}`);
    }
  }
});

test("<Price> card and PDP show strike, Save and the bold price in that order, never red", () => {
  const fixture = componentFixture("src/components/ui/price.tsx", { modules: { "@/lib/money": { formatKzt, kztSaving }, "@/lib/utils": { cn: (...c) => c.filter(Boolean).join(" ") } } });
  const pdp = fixture.render({ size: "pdp", locale: "ru", amount: { major: 224995 }, compareAt: { major: 274995 }, saveLabel: amount => `Save ${amount}` });
  assert.equal(plain(nodeText(pdp)).replace(/\s+/g, " ").trim(), "274 995,00 ₸ Save 50 000,00 ₸ 224 995,00 ₸");
  const classes = nodes(pdp).map(n => n.props?.className ?? "").join(" ");
  assert.match(classes, /line-through/);
  assert.match(classes, /text-\[20px\] font-bold leading-\[24px\]/);
  assert.doesNotMatch(classes, /red/);

  const card = fixture.render({ size: "card", locale: "kk", amount: { major: 224995 }, compareAt: { major: 274995 } });
  assert.equal(plain(nodeText(card)).replace(/\s+/g, " ").trim(), "274 995,00 ₸ 224 995,00 ₸", "Garmin cards show no Save text");
  assert.match(card.props.className, /text-\[16px\] font-bold leading-\[24px\]/);

  const regular = fixture.render({ size: "card", locale: "ru", amount: { major: 1350000 }, compareAt: { major: 1350000 } });
  assert.equal(plain(nodeText(regular)).trim(), "1 350 000,00 ₸", "no sale when the original is not higher");
});
