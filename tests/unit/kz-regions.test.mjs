// M8.1: Kazakhstan regions data used by the address form and the server validation.
import assert from "node:assert/strict";
import test from "node:test";
import { KZ_REGIONS, KZ_BBOX, getKzRegion, resolveKzRegion, findKzCity, findKzCityAnywhere, kzRegionLabel, isInsideKazakhstan, normalizePlaceName } from "../../src/lib/kz-regions.ts";

const EXPECTED_REGIONS = ["abai", "akmola", "aktobe", "almaty-region", "atyrau", "east-kazakhstan", "jambyl", "jetisu", "karaganda", "kostanay", "kyzylorda", "mangystau", "north-kazakhstan", "pavlodar", "turkistan", "ulytau", "west-kazakhstan"];

test("17 regions plus Astana, Almaty and Shymkent as cities of republican significance", () => {
  assert.equal(KZ_REGIONS.length, 20);
  assert.deepEqual(KZ_REGIONS.filter(region => region.kind === "region").map(region => region.code).sort(), EXPECTED_REGIONS);
  assert.deepEqual(KZ_REGIONS.filter(region => region.kind === "city").map(region => region.code).sort(), ["almaty", "astana", "shymkent"]);
});

test("region codes are unique slugs and city codes are unique within each region", () => {
  const codes = KZ_REGIONS.map(region => region.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const region of KZ_REGIONS) {
    assert.match(region.code, /^[a-z]+(-[a-z]+)*$/);
    const cityCodes = region.cities.map(city => city.code);
    assert.equal(new Set(cityCodes).size, cityCodes.length, region.code);
    assert.ok(region.cities.length >= 1, region.code);
  }
});

test("every region has en/ru/kk names, a listed administrative centre and a zoom", () => {
  for (const region of KZ_REGIONS) {
    for (const language of ["en", "ru", "kk"]) assert.ok(region[language].trim().length > 1, `${region.code} ${language}`);
    assert.ok(region.cities.some(city => city.code === region.center), `${region.code} centre ${region.center} is one of its cities`);
    assert.ok(Number.isInteger(region.zoom) && region.zoom >= 5 && region.zoom <= 12, region.code);
    for (const city of region.cities) for (const language of ["en", "ru", "kk"]) assert.ok(city[language].trim().length > 1, `${city.code} ${language}`);
  }
  assert.equal(getKzRegion("almaty-region").center, "konaev");
  assert.equal(getKzRegion("jetisu").center, "taldykorgan");
  assert.equal(getKzRegion("abai").center, "semey");
  assert.equal(getKzRegion("ulytau").center, "zhezkazgan");
});

test("every region and city centre lies inside Kazakhstan", () => {
  for (const region of KZ_REGIONS) {
    assert.ok(isInsideKazakhstan(region.lat, region.lng), region.code);
    for (const city of region.cities) assert.ok(isInsideKazakhstan(city.lat, city.lng), `${region.code}/${city.code}`);
  }
  assert.equal(isInsideKazakhstan(35.6892, 51.389), false, "Tehran is outside (the box is rough; the geocoder also checks the country)");
  assert.equal(isInsideKazakhstan(55.7558, 37.6173), false, "Moscow is outside");
  assert.ok(KZ_BBOX.minLat < KZ_BBOX.maxLat && KZ_BBOX.minLng < KZ_BBOX.maxLng);
});

test("names in any language and Yandex spellings map to a code; Almaty city and region are told apart", () => {
  const cases = [
    ["Almaty Region", "almaty-region"], ["Алматинская область", "almaty-region"], ["Алматы облысы", "almaty-region"],
    ["Almaty City of Republican Significance", "almaty"], ["Алматы", "almaty"], ["almaty", "almaty"],
    ["Astana City of Republican Significance", "astana"], ["город республиканского значения Астана", "astana"],
    ["Zhetysu Region", "jetisu"], ["область Жетысу", "jetisu"], ["Abay Region", "abai"], ["область Абай", "abai"],
    ["Zhambyl Region", "jambyl"], ["Восточно-Казахстанская область", "east-kazakhstan"], ["область Улытау", "ulytau"],
    ["Шымкент", "shymkent"], ["Қарағанды облысы", "karaganda"], ["west-kazakhstan", "west-kazakhstan"],
  ];
  for (const [input, code] of cases) assert.equal(resolveKzRegion(input)?.code, code, input);
  assert.equal(resolveKzRegion("Tashkent Region"), undefined);
  assert.equal(resolveKzRegion(""), undefined);
});

test("cities resolve by any spelling within their region and across regions", () => {
  assert.equal(findKzCity("east-kazakhstan", "Усть-Каменогорск")?.code, "oskemen");
  assert.equal(findKzCity("karaganda", "Karagandy")?.code, "karaganda");
  assert.equal(findKzCity("almaty-region", "Kapchagay")?.code, "konaev");
  assert.equal(findKzCity("akmola", "Oral"), undefined);
  assert.equal(findKzCityAnywhere("Уральск")?.region.code, "west-kazakhstan");
  assert.equal(kzRegionLabel("north-kazakhstan"), "North Kazakhstan Region");
  assert.equal(kzRegionLabel("north-kazakhstan", "ru"), "Северо-Казахстанская область");
  assert.equal(kzRegionLabel("Bavaria"), "Bavaria", "unknown legacy values display as stored");
  assert.equal(normalizePlaceName("City of Ayagoz"), "ayagoz");
});
