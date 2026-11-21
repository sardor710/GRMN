// M8.3: the geocoder proxy maps Yandex results to Kazakhstan address parts, filters everything
// outside Kazakhstan, answers {found:false} honestly and never leaks the key. Fetch is mocked.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createYandexGeocoder, mapGeoObject, cleanLocality } from "../../src/server/geo/geocoder.ts";
import { createGeocodeHandler } from "../../src/server/geo/http.ts";

const KEY = "test-key-0000-SECRET";
const ORIGIN = "http://localhost:3206";

const geoObject = ({ pos, precision = "exact", kind = "house", country = "KZ", formatted = "", components }) => ({
  GeoObject: { Point: { pos }, metaDataProperty: { GeocoderMetaData: { precision, kind, text: formatted, Address: { country_code: country, formatted, Components: components.map(([k, name]) => ({ kind: k, name })) } } } },
});
const collection = (...members) => ({ response: { GeoObjectCollection: { featureMember: members } } });
const ASTANA_HOUSE = geoObject({ pos: "71.398746 51.090319", formatted: "Kazakhstan, Astana, Kabanbay Batyr Avenue, 53", components: [["country", "Kazakhstan"], ["province", "Astana City of Republican Significance"], ["locality", "Astana"], ["street", "Kabanbay Batyr Avenue"], ["house", "53"]] });
const ALMATY_RU = geoObject({ pos: "76.928505 43.238004", formatted: "Казахстан, Алматы, улица Байтурсынова, 104", components: [["country", "Казахстан"], ["province", "Алматы"], ["locality", "Алматы"], ["street", "улица Байтурсынова"], ["house", "104"]] });
const TASHKENT = geoObject({ pos: "69.279737 41.311151", country: "UZ", formatted: "Uzbekistan, Tashkent, Amir Temur Avenue, 1", components: [["country", "Uzbekistan"], ["province", "Tashkent"], ["locality", "Tashkent"], ["street", "Amir Temur Avenue"], ["house", "1"]] });
const ASTANA_LOCALITY = geoObject({ pos: "71.430429 51.128201", precision: "other", kind: "locality", formatted: "Kazakhstan, Astana", components: [["country", "Kazakhstan"], ["province", "Astana City of Republican Significance"], ["locality", "Astana"]] });

function mockFetch(respond) {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url: new URL(url), init }); return respond(new URL(url)); };
  return { calls, fetcher };
}
const ok = body => ({ ok: true, status: 200, json: async () => body });

function handlerWith(geocoder, limit = async () => {}) {
  return createGeocodeHandler({ geocoder, origins: [ORIGIN], limit });
}
const post = (body, { origin = ORIGIN, url = `${ORIGIN}/api/geo/geocode` } = {}) => new Request(url, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });

test("forward: a typed Astana address is found with region code, city, line and exact precision", async () => {
  const { calls, fetcher } = mockFetch(() => ok(collection(ASTANA_HOUSE)));
  const geocoder = createYandexGeocoder({ apiKey: KEY, fetcher });
  const result = await geocoder.forward({ text: "Kabanbay Batyr 53", lang: "en", regionCode: "astana" });
  assert.deepEqual(result, { found: true, candidates: [{ regionCode: "astana", city: "Astana", line1: "Kabanbay Batyr Avenue, 53", lat: 51.090319, lng: 71.398746, precision: "exact", formatted: "Kazakhstan, Astana, Kabanbay Batyr Avenue, 53" }] });
  const url = calls[0].url;
  assert.equal(url.origin + url.pathname, "https://geocode-maps.yandex.ru/1.x/");
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.get("lang"), "en_US");
  assert.equal(url.searchParams.get("geocode"), "Astana, Kabanbay Batyr 53", "biased to the chosen city of republican significance");
  assert.equal(url.searchParams.get("ll"), "71.430429,51.128201");
  assert.equal(url.searchParams.get("apikey"), KEY);
  assert.ok(calls[0].init.signal instanceof AbortSignal, "every upstream call has a timeout signal");
});

test("forward without a region searches only inside the Kazakhstan box and uses ru_RU for Russian", async () => {
  const { calls, fetcher } = mockFetch(() => ok(collection(ALMATY_RU)));
  const result = await createYandexGeocoder({ apiKey: KEY, fetcher }).forward({ text: "Байтурсынова 104", lang: "ru" });
  assert.equal(result.found, true);
  assert.equal(result.candidates[0].regionCode, "almaty");
  assert.equal(result.candidates[0].city, "Алматы");
  assert.equal(result.candidates[0].line1, "улица Байтурсынова, 104");
  assert.equal(calls[0].url.searchParams.get("lang"), "ru_RU");
  assert.equal(calls[0].url.searchParams.get("rspn"), "1");
  assert.match(calls[0].url.searchParams.get("bbox"), /^46\.4,40\.5~87\.4,55\.5$/);
});

test("forward: nonsense that only matches the city itself, or nothing, is {found:false}", async () => {
  const onlyCity = createYandexGeocoder({ apiKey: KEY, fetcher: mockFetch(() => ok(collection(ASTANA_LOCALITY))).fetcher });
  assert.deepEqual(await onlyCity.forward({ text: "qwzx plmk 999", lang: "en", regionCode: "astana" }), { found: false });
  const empty = createYandexGeocoder({ apiKey: KEY, fetcher: mockFetch(() => ok(collection())).fetcher });
  assert.deepEqual(await empty.forward({ text: "qwzx plmk 999", lang: "en" }), { found: false });
});

test("forward: a fuzzy Yandex guess that shares no typed word is not a match; transliterated words are", async () => {
  const farabi = geoObject({ pos: "76.915039 43.21105", formatted: "Казахстан, Алматы, проспект Аль-Фараби, 77", components: [["country", "Казахстан"], ["province", "Алматы"], ["locality", "Алматы"], ["street", "проспект Аль-Фараби"], ["house", "77"]] });
  const guess = createYandexGeocoder({ apiKey: KEY, fetcher: mockFetch(() => ok(collection(farabi))).fetcher });
  assert.deepEqual(await guess.forward({ text: "фывапролд 77", lang: "ru", regionCode: "almaty" }), { found: false });
  assert.deepEqual(await guess.forward({ text: "Алматы, фывапролд 77", lang: "ru" }), { found: false }, "the typed city name alone proves nothing");
  assert.equal((await guess.forward({ text: "Al-Farabi 77", lang: "ru", regionCode: "almaty" })).found, true);
  const english = createYandexGeocoder({ apiKey: KEY, fetcher: mockFetch(() => ok(collection(geoObject({ pos: "76.928505 43.238004", formatted: "Kazakhstan, Almaty, Baitursynov Street, 104", components: [["country", "Kazakhstan"], ["province", "Almaty City of Republican Significance"], ["locality", "Almaty"], ["street", "Baitursynov Street"], ["house", "104"]] })))).fetcher });
  assert.equal((await english.forward({ text: "Байтурсынова 104", lang: "en", regionCode: "almaty" })).found, true);
});

test("reverse: a rural point gives its region without a street; a house far from the pin is ignored", async () => {
  const farHouse = geoObject({ pos: "71.5 51.1", formatted: "Kazakhstan, Akmola Region, Village of Talapker, 68th Street, 48", components: [["country", "Kazakhstan"], ["province", "Akmola Region"], ["locality", "Village of Talapker"], ["street", "68th Street"], ["house", "48"]] });
  const area = geoObject({ pos: "68.18081 48.501833", precision: "other", kind: "area", formatted: "Kazakhstan, Ulytau Region, Sarykengir Rural District", components: [["country", "Kazakhstan"], ["province", "Ulytau Region"], ["area", "Zhezkazgan City Akimat"], ["area", "Sarykengir Rural District"]] });
  const { calls, fetcher } = mockFetch(() => ok(collection(area)));
  const result = await createYandexGeocoder({ apiKey: KEY, fetcher }).reverse({ lat: 48.5, lng: 68, lang: "en" });
  assert.deepEqual(result, { found: true, candidates: [{ regionCode: "ulytau", city: "", line1: "", lat: 48.5, lng: 68, precision: "locality", formatted: "Kazakhstan, Ulytau Region, Sarykengir Rural District" }] });
  assert.equal(calls[0].url.searchParams.get("geocode"), "68.000000,48.500000", "fixed decimals so Yandex reads a point, not text");
  const lonely = mockFetch(() => ok(collection(farHouse)));
  assert.deepEqual(await createYandexGeocoder({ apiKey: KEY, fetcher: lonely.fetcher }).reverse({ lat: 48.5, lng: 68, lang: "en" }), { found: false });
  assert.deepEqual(lonely.calls.map(call => call.url.searchParams.get("kind")), [null, "locality"]);
  const village = geoObject({ pos: "68.05 48.45", precision: "other", kind: "locality", formatted: "Kazakhstan, Ulytau Region, Village of Example", components: [["country", "Kazakhstan"], ["province", "Ulytau Region"], ["locality", "Village of Example"]] });
  const near = mockFetch(url => ok(url.searchParams.get("kind") === "locality" ? collection(village) : collection(farHouse)));
  const settled = await createYandexGeocoder({ apiKey: KEY, fetcher: near.fetcher }).reverse({ lat: 48.5, lng: 68, lang: "en" });
  assert.deepEqual([settled.candidates[0].regionCode, settled.candidates[0].city, settled.candidates[0].line1, settled.candidates[0].precision], ["ulytau", "Village of Example", "", "locality"]);
});

test("results outside Kazakhstan are filtered out", async () => {
  const geocoder = createYandexGeocoder({ apiKey: KEY, fetcher: mockFetch(() => ok(collection(TASHKENT, ASTANA_HOUSE))).fetcher });
  const result = await geocoder.forward({ text: "Kabanbay Batyr 53", lang: "en" });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].regionCode, "astana");
  assert.equal(mapGeoObject(TASHKENT.GeoObject, "en"), null);
  assert.deepEqual(await createYandexGeocoder({ apiKey: KEY, fetcher: mockFetch(() => ok(collection(TASHKENT))).fetcher }).forward({ text: "Amir Temur 1", lang: "en" }), { found: false });
});

test("reverse: a pin returns region/city/line for that place and keeps the pin coordinates", async () => {
  const { calls, fetcher } = mockFetch(() => ok(collection(ALMATY_RU)));
  const result = await createYandexGeocoder({ apiKey: KEY, fetcher }).reverse({ lat: 43.2380001, lng: 76.9286004, lang: "en" });
  assert.equal(result.found, true);
  assert.deepEqual({ ...result.candidates[0], formatted: undefined }, { regionCode: "almaty", city: "Almaty", line1: "улица Байтурсынова, 104", lat: 43.238, lng: 76.9286, precision: "exact", formatted: undefined });
  assert.equal(calls[0].url.searchParams.get("geocode"), "76.928600,43.238000");
  assert.equal(calls[0].url.searchParams.get("sco"), "longlat");
  const outside = mockFetch(() => ok(collection(ALMATY_RU)));
  assert.deepEqual(await createYandexGeocoder({ apiKey: KEY, fetcher: outside.fetcher }).reverse({ lat: 55.75, lng: 37.61, lang: "en" }), { found: false });
  assert.equal(outside.calls.length, 0, "a pin outside Kazakhstan never reaches Yandex");
});

test("Yandex regions, Almaty city vs region and village localities map correctly", () => {
  const konaev = geoObject({ pos: "77.061581 43.854849", components: [["country", "Kazakhstan"], ["province", "Almaty Region"], ["area", "Konaev City Akimat"], ["locality", "Konaev"], ["street", "Abay St"], ["house", "1"]] });
  assert.equal(mapGeoObject(konaev.GeoObject, "en").regionCode, "almaty-region");
  const village = geoObject({ pos: "78.621973 44.870332", precision: "street", kind: "street", components: [["country", "Казахстан"], ["province", "область Жетысу"], ["area", "Ескельдинский район"], ["locality", "село Жетысу"], ["street", "улица Абая"]] });
  const mapped = mapGeoObject(village.GeoObject, "ru");
  assert.deepEqual([mapped.regionCode, mapped.city, mapped.line1, mapped.precision], ["jetisu", "село Жетысу", "улица Абая", "street"]);
  const oskemen = geoObject({ pos: "82.627848 49.948325", components: [["country", "Kazakhstan"], ["province", "East Kazakhstan Region"], ["locality", "Oskemen"], ["street", "Lenin St"], ["house", "5"]] });
  assert.equal(mapGeoObject(oskemen.GeoObject, "ru").city, "Усть-Каменогорск", "a listed city is named in the UI language");
  assert.equal(cleanLocality("City of Ayagoz"), "Ayagoz");
  assert.equal(cleanLocality("город Шар"), "Шар");
});

test("HTTP: found and not-found responses are JSON, no-store; origin, method and input are checked", async () => {
  let reply = collection(ASTANA_HOUSE);
  const geocoder = createYandexGeocoder({ apiKey: KEY, fetcher: async () => ok(reply) });
  const handle = handlerWith(geocoder);
  const found = await handle(post({ mode: "forward", text: "Kabanbay Batyr 53", lang: "en", regionCode: "astana" }));
  assert.equal(found.status, 200);
  assert.equal(found.headers.get("cache-control"), "no-store");
  assert.equal((await found.json()).candidates[0].regionCode, "astana");
  reply = collection();
  assert.deepEqual(await (await handle(post({ mode: "forward", text: "qwzx plmk 999" }))).json(), { found: false });
  assert.equal((await handle(post({ mode: "forward", text: "x" }))).status, 400, "too short");
  assert.equal((await handle(post({ mode: "forward", text: "y".repeat(301) }))).status, 400, "too long");
  assert.equal((await handle(post({ mode: "reverse", lat: "43", lng: 76 }))).status, 400);
  assert.equal((await handle(post({ mode: "reverse", lat: 43, lng: 76, extra: 1 }))).status, 400, "strict fields");
  assert.equal((await handle(post({ mode: "forward", text: "Abay 1" }, { origin: "https://attacker.invalid" }))).status, 403);
  assert.equal((await handle(post({ mode: "forward", text: "Abay 1" }, { origin: null }))).status, 403);
  assert.equal((await handle(post({ mode: "forward", text: "Abay 1" }, { url: `${ORIGIN}/api/geo/geocode?apikey=x` }))).status, 400);
  assert.equal((await handle(new Request(`${ORIGIN}/api/geo/geocode`, { method: "GET", headers: { origin: ORIGIN } }))).status, 405);
  const big = new Request(`${ORIGIN}/api/geo/geocode`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ mode: "forward", text: "a".repeat(3000) }) });
  assert.equal((await handle(big)).status, 413);
});

test("HTTP: a Yandex error, timeout or bad body is 502 without the key or upstream text", async () => {
  const cases = [
    async () => ({ ok: false, status: 403, json: async () => ({ error: `Invalid key ${KEY}` }) }),
    async () => { throw new TypeError(`fetch failed for https://geocode-maps.yandex.ru/1.x/?apikey=${KEY}`); },
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } }),
    async () => ok({ statusCode: 429, message: `quota for ${KEY}` }),
  ];
  for (const fetcher of cases) {
    const response = await handlerWith(createYandexGeocoder({ apiKey: KEY, fetcher }))(post({ mode: "forward", text: "Abay 10", lang: "en" }));
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.doesNotMatch(text, new RegExp(KEY));
    assert.doesNotMatch(text, /yandex|quota|Invalid key/i);
    assert.deepEqual(JSON.parse(text), { error: { code: "GEOCODER_UNAVAILABLE", message: "The map search is unavailable right now" } });
  }
});

test("HTTP: a missing key is 503 (the form works without the map) and the rate limit answers 429", async () => {
  const missing = await handlerWith(null)(post({ mode: "forward", text: "Abay 10" }));
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, "GEOCODER_NOT_CONFIGURED");
  let called = 0;
  const limited = handlerWith(createYandexGeocoder({ apiKey: KEY, fetcher: async () => { called++; return ok(collection()); } }), async () => {
    const error = new Error("Too many requests; try again shortly"); Object.assign(error, { code: "RATE_LIMITED", status: 429, retryAfter: 30 }); throw error;
  });
  const response = await limited(post({ mode: "forward", text: "Abay 10" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.equal(called, 0, "a limited request never reaches Yandex");
});

test("the route reads the key on the server only and the rate limit is per trusted client address", () => {
  const runtime = readFileSync(new URL("../../src/server/geo/runtime.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../src/app/api/geo/geocode/route.ts", import.meta.url), "utf8");
  assert.match(runtime, /import "server-only"/);
  assert.match(runtime, /trustedClientAddress\(headers\)/);
  assert.match(runtime, /enforceRateLimit\(/);
  assert.match(route, /export const POST/);
  assert.doesNotMatch(route, /export const GET/);
  assert.throws(() => createYandexGeocoder({ apiKey: "" }), /key is missing/);
});
