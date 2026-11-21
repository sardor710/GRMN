// M8.4: the reusable Kazakhstan address form. Pure sync rules are tested directly; the component
// runs in the shallow fixture (no DOM, no map script) with a mocked geocoder.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as kz from "../../src/lib/kz-regions.ts";
import * as sync from "../../src/components/address/address-sync.ts";

const { MESSAGES, applyForward, applyReverse, chooseCity, chooseRegion, forwardRequest, mapView, placePin } = sync;
const file = new URL("../../src/components/address/AddressForm.tsx", import.meta.url);
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
const EMPTY = { label: "Home", recipientName: "Synthetic Owner", phone: "+77000000001", countryCode: "KZ", region: "", city: "", line1: "", line2: "", postalCode: "", lat: null, lng: null, geoPrecision: null, isPrimary: false };
const candidate = (extra = {}) => ({ regionCode: "almaty", city: "Almaty", line1: "Baitursynov Street, 104", lat: 43.238004, lng: 76.928505, precision: "exact", formatted: "Kazakhstan, Almaty, Baitursynov Street, 104", ...extra });

test("choosing a region pans the map there with no network; a city of republican significance fills the city", () => {
  const almaty = chooseRegion(EMPTY, "almaty");
  assert.equal(almaty.region, "almaty"); assert.equal(almaty.city, "Almaty"); assert.equal(almaty.isPrimary, false, "extra fields pass through");
  assert.deepEqual(mapView(almaty), { lat: 43.237163, lng: 76.945645, zoom: kz.KZ_CITY_ZOOM });
  const region = chooseRegion({ ...EMPTY, city: "Konaev" }, "almaty-region");
  assert.equal(region.city, "Konaev", "a listed city of the chosen region is kept");
  assert.deepEqual(mapView(region), { lat: 43.854849, lng: 77.061581, zoom: kz.KZ_CITY_ZOOM });
  const other = chooseRegion({ ...EMPTY, region: "almaty-region", city: "Konaev", lat: 43.85, lng: 77.06, geoPrecision: "exact" }, "pavlodar");
  assert.deepEqual([other.city, other.lat, other.lng, other.geoPrecision], ["", null, null, null], "a pin in another region is dropped");
  assert.deepEqual(mapView(other), { lat: 52.068499, lng: 76.242551, zoom: 6 });
  assert.deepEqual(mapView(EMPTY), { ...kz.KZ_DEFAULT_VIEW });
  assert.equal(chooseRegion(EMPTY, "almaty", "ru").city, "Алматы");
});

test("typing a listed city with no region sets the region; changing the city drops the old pin", () => {
  const next = chooseCity(EMPTY, "Taraz");
  assert.equal(next.region, "jambyl");
  assert.deepEqual(mapView(next), { lat: 42.899664, lng: 71.392727, zoom: kz.KZ_CITY_ZOOM });
  const kept = chooseCity({ ...EMPTY, region: "akmola", city: "Kokshetau" }, "Taraz");
  assert.equal(kept.region, "akmola", "an explicit region is not overridden by a typed city");
  const pinned = { ...EMPTY, region: "astana", city: "Astana", lat: 51.1, lng: 71.4, geoPrecision: "exact" };
  assert.equal(chooseCity(pinned, "Astana ").lat, 51.1);
  assert.equal(chooseCity(pinned, "Kosshy").lat, null);
});

test("a map pin fills region, city and line; after a failed search the typed line is kept (manual)", () => {
  const typed = { ...EMPTY, region: "astana", city: "Astana", line1: "My typed street 5" };
  const placed = placePin(typed, 43.2380049, 76.9285051);
  assert.deepEqual([placed.lat, placed.lng, placed.geoPrecision], [43.238005, 76.928505, "manual"]);
  const filled = applyReverse(placed, candidate(), false);
  assert.deepEqual([filled.region, filled.city, filled.line1, filled.geoPrecision], ["almaty", "Almaty", "Baitursynov Street, 104", "exact"]);
  const kept = applyReverse(placed, candidate(), true);
  assert.deepEqual([kept.region, kept.city, kept.line1, kept.geoPrecision], ["almaty", "Almaty", "My typed street 5", "manual"]);
  const rural = applyReverse(placed, candidate({ regionCode: "ulytau", city: "", line1: "", precision: "locality" }), false);
  assert.deepEqual([rural.region, rural.city, rural.line1, rural.geoPrecision], ["ulytau", "Astana", "My typed street 5", "manual"], "a place without a street fills only what it knows");
  assert.equal(applyReverse(placed, candidate({ precision: "street", line1: "Baitursynov Street" }), false).geoPrecision, "street");
});

test("a found typed address moves the pin and never rewrites the typed line", () => {
  const typed = { ...EMPTY, region: "astana", city: "Astana", line1: "Kabanbay 53" };
  const next = applyForward(typed, candidate({ regionCode: "astana", city: "Astana", line1: "Kabanbay Batyr Avenue, 53", lat: 51.090319, lng: 71.398746 }));
  assert.deepEqual([next.line1, next.lat, next.lng, next.geoPrecision, next.region, next.city], ["Kabanbay 53", 51.090319, 71.398746, "exact", "astana", "Astana"]);
  const moved = applyForward({ ...EMPTY, region: "pavlodar", city: "Pavlodar", line1: "Abay 10" }, candidate());
  assert.deepEqual([moved.region, moved.city], ["almaty", "Almaty"], "region and city follow the found address");
  assert.deepEqual(forwardRequest(typed), { mode: "forward", text: "Kabanbay 53", lang: "en", regionCode: "astana", city: "Astana" });
  assert.equal(forwardRequest({ ...typed, line1: "ab" }), null);
});

function mount(initial, geocode, props = {}) {
  let value = initial;
  const changes = [];
  const fixture = componentFixture(file, { modules: { "@/lib/kz-regions": kz, "@/components/address/address-sync": sync, "@/components/address/yandex-maps": { loadYandexMaps: () => Promise.reject(new Error("no map in tests")) } } });
  const view = {
    get value() { return value; }, changes,
    tree: null,
    render() { view.tree = fixture.render({ value, onChange: next => { value = next; changes.push(next); }, geocode, mapsApiKey: "", ...props }); return view.tree; },
    node(name) { return nodes(view.tree).find(node => node.props?.name === name); },
    text() { return nodeText(view.tree); },
  };
  view.render();
  return view;
}

test("the form has a fixed Kazakhstan country, a region select and a city combobox; no country select", () => {
  const view = mount({ ...EMPTY, region: "almaty-region" }, async () => ({ found: false }));
  assert.equal(nodes(view.tree).some(node => node.props?.name === "countryCode"), false);
  const country = view.node("country");
  assert.equal(country.props.readOnly, true); assert.equal(country.props.value, "Kazakhstan");
  const region = view.node("region");
  assert.equal(region.type, "select"); assert.equal(region.props.value, "almaty-region"); assert.equal(region.props.required, true);
  const optionValues = nodes(region).filter(node => node.type === "option").map(node => node.props.value);
  assert.equal(optionValues.length, 21, "placeholder + 20 regions");
  const city = view.node("city");
  assert.match(city.props.list, /city-options$/);
  const datalist = nodes(view.tree).find(node => node.type === "datalist");
  assert.deepEqual(nodes(datalist).filter(node => node.type === "option").map(node => node.props.value), ["Konaev", "Talgar", "Kaskelen", "Esik"]);
  assert.match(view.text(), /map is unavailable/, "without a key the form works and says the map is unavailable");
  region.props.onChange({ target: { value: "astana" } });
  assert.deepEqual([view.value.region, view.value.city], ["astana", "Astana"]);
});

test("typing an unknown address asks for a pin; a found address moves the pin with a state line", async () => {
  let reply = { found: false };
  const requests = [];
  const view = mount({ ...EMPTY, region: "astana", city: "Astana" }, async request => { requests.push(request); return reply; });
  view.node("line1").props.onChange({ target: { value: "qwzx plmk 999" } });
  view.render();
  await view.node("line1").props.onBlur();
  await settle(); view.render();
  assert.deepEqual(requests[0], { mode: "forward", text: "qwzx plmk 999", lang: "en", regionCode: "astana", city: "Astana" });
  assert.match(view.text(), new RegExp(MESSAGES.notFound.replace(/[.?]/g, "\\$&")));
  assert.equal(view.value.line1, "qwzx plmk 999", "the typed line stays");
  assert.equal(view.value.lat, null);
  reply = { found: true, candidates: [candidate({ regionCode: "astana", city: "Astana", line1: "Kabanbay Batyr Avenue, 53", lat: 51.090319, lng: 71.398746 })] };
  view.node("line1").props.onChange({ target: { value: "Kabanbay Batyr 53" } });
  view.render();
  await view.node("line1").props.onBlur();
  await settle(); view.render();
  assert.deepEqual([view.value.line1, view.value.lat, view.value.lng, view.value.geoPrecision], ["Kabanbay Batyr 53", 51.090319, 71.398746, "exact"]);
  assert.match(view.text(), /Pin from typed address/);
  assert.doesNotMatch(view.text(), /couldn't find/);
});

test("a geocoder failure is reported and the typed line is untouched", async () => {
  const view = mount({ ...EMPTY, region: "astana", city: "Astana" }, async () => { throw new Error("Geocoder 502"); });
  view.node("line1").props.onChange({ target: { value: "Kabanbay Batyr 53" } });
  view.render();
  await view.node("line1").props.onBlur();
  await settle(); view.render();
  assert.match(view.text(), /Address search is unavailable/);
  assert.equal(view.value.line1, "Kabanbay Batyr 53");
});

test("source: lazy single Yandex 2.1 script with the public maps key, client only, mobile height and labels", () => {
  const loader = readFileSync(new URL("../../src/components/address/yandex-maps.ts", import.meta.url), "utf8");
  const form = readFileSync(file, "utf8");
  assert.match(loader, /https:\/\/api-maps\.yandex\.ru\/2\.1\/\?apikey=/);
  assert.match(loader, /let loading: Promise<YMapsApi> \| null = null/);
  assert.match(form, /^"use client";/);
  assert.match(form, /NEXT_PUBLIC_YANDEX_MAPS_API_KEY/);
  assert.doesNotMatch(form + loader, /GEOCODER_API_KEY/, "the geocoder key never reaches client code");
  assert.match(form, /h-60 w-full/, "map is 240px tall on phones");
  for (const name of ["label", "recipient", "phone", "country", "region", "city", "postal", "line1", "line2"]) assert.match(form, new RegExp(`htmlFor=\\{id\\("${name}"\\)\\}`), `${name} has a label`);
});
