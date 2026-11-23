import test from "node:test";
import assert from "node:assert/strict";
import { generateProductSeo, generateVariantSeo, seoKind } from "../../src/lib/seo/generate.ts";
import { generateProductSEOMeta } from "../../src/lib/seo/analyzer.ts";

const LOCALES = ["en", "ru", "kk"];

// Each fixture holds the subject as a caller would pass it per locale (name, description and option values localized).
const fixtures = [
  {
    key: "fenix",
    base: { name: "fēnix® 9 Pro", family: "fēnix", kind: "device", categoryName: "Smartwatches" },
    description: {
      en: "Meet the fēnix® 9 Pro, our most capable multisport GPS smartwatch with a built-in LED flashlight, inReach® satellite messaging and a bright AMOLED display. It tracks every sport, maps every trail and lasts for weeks on a single charge. Dive-rated to 40 meters.",
      ru: "Знакомьтесь с fēnix® 9 Pro — самыми функциональными мультиспортивными GPS-часами Garmin со встроенным фонариком, спутниковой связью inReach® и ярким AMOLED-дисплеем. Они отслеживают любой спорт и работают неделями без подзарядки.",
      kk: "fēnix® 9 Pro — кірістірілген шамы, inReach® спутниктік байланысы және жарқын AMOLED дисплейі бар ең қабілетті мультиспорттық GPS смарт-сағат. Ол кез келген спортты бақылайды және бір зарядпен апталап жұмыс істейді.",
    },
    variants: {
      en: { sku: "010-03100-00", optionValues: [{ name: "Case Size", value: "43 mm" }, { name: "Model/Color", value: "Black" }] },
      ru: { sku: "010-03100-00", optionValues: [{ name: "Case Size", value: "43 mm" }, { name: "Model/Color", value: "черный" }] },
      kk: { sku: "010-03100-00", optionValues: [{ name: "Case Size", value: "43 mm" }, { name: "Model/Color", value: "қара" }] },
    },
  },
  {
    key: "venu",
    base: { name: "Venu® 4", family: "Venu", kind: "device", categoryName: "Smartwatches" },
    description: {
      en: "A stylish health smartwatch.",
      ru: "Стильные смарт-часы для здоровья.",
      kk: "Денсаулыққа арналған стильді смарт-сағат.",
    },
    variants: {
      en: { sku: "010-02900-00", optionValues: [{ name: "Color", value: "Slate Gray" }] },
      ru: { sku: "010-02900-00", optionValues: [{ name: "Color", value: "серый" }] },
      kk: { sku: "010-02900-00", optionValues: [{ name: "Color", value: "сұр" }] },
    },
  },
  {
    key: "lily",
    base: { name: "Lily® 2 Active", family: "Lily", kind: "device", categoryName: null },
    description: { en: "", ru: "", kk: "" },
    variants: {
      en: { sku: "010-02891-00", optionValues: [{ name: "Color", value: "Lunar Gold with Bone Silicone Band" }] },
      ru: { sku: "010-02891-00", optionValues: [{ name: "Color", value: "Lunar Gold with Bone Silicone Band" }] },
      kk: { sku: "010-02891-00", optionValues: [{ name: "Color", value: "Lunar Gold with Bone Silicone Band" }] },
    },
  },
  {
    key: "quickfit",
    base: { name: "QuickFit® 22 Watch Bands", family: null, kind: "accessory", categoryName: "Watch Bands" },
    description: {
      en: "Swap bands in seconds with QuickFit® 22 watch bands. Compatible with fēnix and other Garmin smartwatches.",
      ru: "Меняйте ремешки за секунды. Подходит для смарт-часов fēnix и других моделей Garmin.",
      kk: "Бауларды бірнеше секундта ауыстырыңыз. fēnix смарт-сағаттарына және басқа Garmin модельдеріне сәйкес келеді.",
    },
    variants: {
      en: { sku: "010-13111-00", optionValues: [{ name: "Color", value: "Black Silicone" }] },
      ru: { sku: "010-13111-00", optionValues: [{ name: "Color", value: "черный силикон" }] },
      kk: { sku: "010-13111-00", optionValues: [{ name: "Color", value: "қара силикон" }] },
    },
  },
  {
    key: "marq",
    base: {
      name: "MARQ® Adventurer (Gen 3)",
      family: "MARQ",
      kind: "device",
      categoryName: "Luxury Smartwatches",
      specs: [{ label: "Battery life", value: "Up to 25 days" }, { label: "Lens material", value: "Sapphire crystal" }],
    },
    description: {
      en: "The MARQ™ Adventurer (Gen 3) is a luxury tool watch crafted from titanium with a scratch-resistant sapphire crystal lens, a vivid AMOLED touchscreen and built-in LED flashlight for adventures that never really end",
      ru: "",
      kk: "MARQ™ Adventurer (Gen 3) — титаннан жасалған, сапфир шынысы және AMOLED сенсорлық экраны бар сәнді сағат, ол шытырман оқиғаларға арналған және ешқашан тоқтамайтын саяхатшыларға лайық жасалған жоғары сапалы құрал.",
    },
    variants: {
      en: { sku: "010-02977-00", optionValues: [{ name: "Case Size", value: "46 mm" }, { name: "Model/Color", value: "Titanium with Black Leather Strap" }] },
      ru: { sku: "010-02977-00", optionValues: [{ name: "Case Size", value: "46 mm" }, { name: "Model/Color", value: "титан с черным кожаным ремешком" }] },
      kk: { sku: "010-02977-00", optionValues: [{ name: "Case Size", value: "46 mm" }, { name: "Model/Color", value: "қара былғары баулы титан" }] },
    },
  },
];

const subjectFor = (fixture, locale) => ({ ...fixture.base, description: fixture.description[locale] });

function assertDescription(text, label) {
  assert.ok(text.length >= 120 && text.length <= 160, `${label}: description length ${text.length} not in [120,160]: ${text}`);
  assert.match(text, /[\p{L}\p{N}.!?)»"]$/u, `${label}: description ends mid-text: ${text}`);
  assert.ok(!text.endsWith("..."), `${label}: description ends with an ellipsis: ${text}`);
  assert.ok(!/[®™]/.test(text), `${label}: description keeps a trademark symbol: ${text}`);
}

test("ru variant title for fēnix 9 Pro keeps the option values, drops ® and fits 60 characters", () => {
  const fenix = fixtures[0];
  const seo = generateVariantSeo(subjectFor(fenix, "ru"), fenix.variants.ru, "ru");
  assert.ok(seo.title.includes("fēnix 9 Pro"), seo.title);
  assert.ok(seo.title.includes("43 mm"), seo.title);
  assert.ok(seo.title.includes("черный"), seo.title);
  assert.ok(!seo.title.includes("®"), seo.title);
  assert.ok(seo.title.length <= 60, `${seo.title.length}: ${seo.title}`);
});

test("accessories are never called a smartwatch", () => {
  const quickfit = fixtures[3];
  assert.doesNotMatch(generateProductSeo(subjectFor(quickfit, "en"), "en").title, /smartwatch/i);
  for (const locale of ["ru", "kk"]) {
    const product = generateProductSeo(subjectFor(quickfit, locale), locale);
    const variant = generateVariantSeo(subjectFor(quickfit, locale), quickfit.variants[locale], locale);
    for (const text of [product.title, product.description, variant.title, variant.description]) {
      assert.doesNotMatch(text, /смарт-час|смарт-сағат/i, `${locale}: ${text}`);
    }
  }
  const en = generateVariantSeo(subjectFor(quickfit, "en"), quickfit.variants.en, "en");
  assert.doesNotMatch(en.title + en.description, /smartwatch/i);
});

test("every title and description stays within Google's limits in every locale", () => {
  for (const fixture of fixtures) {
    for (const locale of LOCALES) {
      const subject = subjectFor(fixture, locale);
      const product = generateProductSeo(subject, locale);
      const variant = generateVariantSeo(subject, fixture.variants[locale], locale);
      for (const [label, seo] of [[`${fixture.key}/${locale}/product`, product], [`${fixture.key}/${locale}/variant`, variant]]) {
        assertDescription(seo.description, label);
        assert.ok(seo.title.length > 0 && seo.title.length <= 60, `${label}: title ${seo.title.length}: ${seo.title}`);
        assert.ok(!/[®™]/.test(seo.title), `${label}: ${seo.title}`);
        // Brand never repeats; product titles always carry it (a very long variant may give it up for its option values).
        const brand = seo.title.match(/garmin/gi)?.length ?? 0;
        assert.ok(seo === product ? brand === 1 : brand <= 1, `${label}: brand once: ${seo.title}`);
        assert.ok(seo.title === seo.title.trim() && !/[\s,;:–—|(-]$/.test(seo.title), `${label}: dangling title end: ${seo.title}`);
      }
    }
  }
});

test("a very long variant still fits and keeps its option values", () => {
  const subject = { name: "MARQ® Carbon Collection Commander (Gen 2)", kind: "device", categoryName: "Luxury Smartwatches" };
  const variant = { sku: "X-1", optionValues: [{ name: "Case Size", value: "46 mm" }, { name: "Color", value: "Carbon" }] };
  for (const locale of LOCALES) {
    const seo = generateVariantSeo(subject, variant, locale);
    assert.ok(seo.title.length <= 60, `${locale}: ${seo.title}`);
    assert.ok(seo.title.includes("46 mm") && seo.title.includes("Carbon"), `${locale}: ${seo.title}`);
    assertDescription(seo.description, `long/${locale}`);
  }
  // Option text too long for one description sentence is shortened, and Kazakhstan stays in the sentence.
  const huge = { sku: "X-2", optionValues: [{ name: "Color", value: "Carbon Gray DLC Titanium with Black and Pebble Gray Silicone Band, Extra Leather Strap and Nylon Strap in a Gift Box" }] };
  const kk = generateVariantSeo(subject, huge, "kk");
  assertDescription(kk.description, "huge/kk");
  assert.ok(kk.description.includes("Қазақстанда сатып алыңыз"), kk.description);
  assert.ok(generateVariantSeo(subject, huge, "ru").description.includes("в Казахстане"));
});

test("two variants of the same product get different titles", () => {
  const fenix = fixtures[0];
  for (const locale of LOCALES) {
    const subject = subjectFor(fenix, locale);
    const a = generateVariantSeo(subject, fenix.variants[locale], locale);
    const b = generateVariantSeo(subject, { sku: "010-03100-01", optionValues: [{ name: "Case Size", value: "47 mm" }, { name: "Model/Color", value: "Titanium" }] }, locale);
    assert.notEqual(a.title, b.title, locale);
  }
});

test("keywords are at most 8, unique case-insensitively and carry the buying intent", () => {
  for (const fixture of fixtures) {
    for (const locale of LOCALES) {
      const subject = subjectFor(fixture, locale);
      for (const seo of [generateProductSeo(subject, locale), generateVariantSeo(subject, fixture.variants[locale], locale)]) {
        assert.ok(seo.keywords.length > 0 && seo.keywords.length <= 8, `${fixture.key}/${locale}: ${seo.keywords.length}`);
        const lower = seo.keywords.map((k) => k.toLowerCase());
        assert.equal(new Set(lower).size, lower.length, `${fixture.key}/${locale}: ${seo.keywords.join(" | ")}`);
        assert.ok(seo.keywords.every((k) => !/[®™]/.test(k)), seo.keywords.join(" | "));
      }
    }
  }
  const fenix = fixtures[0];
  const ru = generateVariantSeo(subjectFor(fenix, "ru"), fenix.variants.ru, "ru").keywords;
  assert.ok(ru.includes("fēnix 9 Pro"), ru.join(" | "));
  assert.ok(ru.includes("fēnix 9 Pro 43 mm"), ru.join(" | "));
  assert.ok(ru.includes("fēnix 9 Pro черный"), ru.join(" | "));
  assert.ok(ru.includes("купить fēnix 9 Pro"), ru.join(" | "));
  assert.ok(ru.includes("fenix 9 Pro"), `ascii spelling people type: ${ru.join(" | ")}`);
  const kk = generateProductSeo(subjectFor(fenix, "kk"), "kk").keywords;
  assert.ok(kk.includes("fēnix 9 Pro сатып алу"), kk.join(" | "));
});

test("descriptions name Kazakhstan in every locale", () => {
  for (const fixture of fixtures) {
    const subjectKk = subjectFor(fixture, "kk");
    assert.ok(generateProductSeo(subjectKk, "kk").description.includes("Қазақстан"));
    assert.ok(generateVariantSeo(subjectKk, fixture.variants.kk, "kk").description.includes("Қазақстан"));
    assert.ok(generateProductSeo(subjectFor(fixture, "ru"), "ru").description.includes("Казахстан"));
    assert.ok(generateProductSeo(subjectFor(fixture, "en"), "en").description.includes("Kazakhstan"));
  }
});

test("ru and kk wording uses the buying phrases and leaves out text in another language", () => {
  const fenix = fixtures[0];
  const ru = generateProductSeo(subjectFor(fenix, "ru"), "ru");
  assert.match(ru.title + " " + ru.description, /купить .* в Казахстане/i);
  const kk = generateProductSeo(subjectFor(fenix, "kk"), "kk");
  assert.match(kk.title, /Қазақстанда сатып алу/);
  // An English description handed to a Russian page (missing translation) is not quoted in the meta description.
  const fallback = generateProductSeo({ ...fenix.base, description: fenix.description.en }, "ru");
  assert.doesNotMatch(fallback.description, /Meet the/);
});

test("brand is not doubled when the name already starts with Garmin", () => {
  const seo = generateProductSeo({ name: "Garmin Index™ S2 Smart Scale", kind: "device" }, "en");
  assert.equal(seo.title.match(/garmin/gi).length, 1, seo.title);
});

test("seoKind tells accessories from devices by category path", () => {
  assert.equal(seoKind(["accessories", "watch-bands"]), "accessory");
  assert.equal(seoKind(["wearables-smartwatches"]), "device");
  assert.equal(seoKind(["wearables-smartwatches", "wearables-smartwatches/fenix"]), "device");
  assert.equal(seoKind(["Accessories"]), "accessory");
  assert.equal(seoKind(["Watch Bands"]), "accessory");
  assert.equal(seoKind(["bands/quickfit-22-mm"]), "accessory");
  assert.equal(seoKind(["cables-chargers"]), "accessory");
  assert.equal(seoKind(["wearables-smartwatches-accessories"]), "accessory");
  assert.equal(seoKind(["sports-fitness/cirqa-smart-band"]), "device");
  assert.equal(seoKind([]), "device");
});

test("generateProductSEOMeta keeps its shape and now uses the localized generator", () => {
  const meta = generateProductSEOMeta({
    name: "QuickFit® 22 Watch Bands",
    category: "Accessories",
    subCategory: "Watch Bands",
    description: "Swap bands in seconds.",
    specs: [],
  });
  assert.deepEqual(Object.keys(meta).sort(), ["focusKeywords", "seoDescription", "seoTitle"]);
  assert.ok(meta.seoTitle.length <= 60 && !meta.seoTitle.includes("®"), meta.seoTitle);
  assert.doesNotMatch(meta.seoTitle, /smartwatch/i);
  assertDescription(meta.seoDescription, "analyzer");
  assert.ok(Array.isArray(meta.focusKeywords) && meta.focusKeywords.length > 0 && meta.focusKeywords.length <= 8);
  const empty = generateProductSEOMeta({});
  assert.equal(typeof empty.seoTitle, "string");
  assert.ok(empty.seoTitle.length > 0);
});
