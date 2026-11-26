// M8.5: the checkout delivery step. Kazakhstan only: signed-in customers choose a saved address
// (sent as {kind:"saved", addressId, version}) or a new one typed in AddressForm (sent as
// {kind:"inline", address}), optionally saved first; guests type one. Client validation asks for a
// region (or a listed city), city, street and an E.164 phone before any quote is requested.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as accountClient from "../../src/lib/account-client.ts";
import * as kzRegions from "../../src/lib/kz-regions.ts";
import * as analyticsEvents from "../../src/lib/analytics/events.ts";
import * as step from "../../src/lib/checkout-address.ts";
import * as pickupLib from "../../src/lib/pickup.ts";
import { createTranslator } from "use-intl/core";
import * as i18nConfig from "../../src/i18n/config.js";

const { NEW_ADDRESS, PICKUP, checkoutProblems, checkoutRegionCode, defaultDeliveryChoice, deliveryPayload, isDeliverable, normalizePhone } = step;
// The panel reads its text through next-intl: render with the real English catalog (ru/kk are covered by the i18n tests).
const enMessages = JSON.parse(fs.readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"));
const i18nModules = {
  "next-intl": { useTranslations: namespace => createTranslator({ locale: "en", messages: enMessages, namespace }), useLocale: () => "en" },
  "@/i18n/navigation": { Link: "a" }, "@/i18n/config": i18nConfig, "@/i18n/useAppLocale": { useAppLocale: () => "en" },
  "@/components/DemoBadge": { DemoBadge: "span" }, "@/lib/cart-client": { CartRequestError: class CartRequestError extends Error {} },
};
const source = fs.readFileSync(new URL("../../src/components/CheckoutPanel.tsx", import.meta.url), "utf8");
const kzt = amountMinor => ({ amountMinor, currency: "KZT" });
const CART = { id: "c1", version: 3, owner: "account", pendingMerge: false, expiresAt: "2026-12-01T00:00:00.000Z", subtotal: kzt("200000"), lines: [], notices: [], paymentMethods: ["manual"] };
const saved = (id, extra = {}) => ({ id, label: "Home", recipientName: "Synthetic Owner", phone: "+77000000001", countryCode: "KZ", region: "astana", city: "Astana", line1: "Kabanbay Batyr 53", isPrimary: false, version: 2, ...extra });
const HOME = saved("00000000-0000-4000-8000-0000000000b1", { isPrimary: true });
const OFFICE = saved("00000000-0000-4000-8000-0000000000b2", { label: "Office", region: "almaty-region", city: "Konaev", line1: "Abay Avenue 10", version: 5 });
const BERLIN = saved("00000000-0000-4000-8000-0000000000b3", { label: "Old flat", countryCode: "DE", region: "Berlin", city: "Berlin", line1: "Unter den Linden 1" });
const CONTACT = { name: "Synthetic Buyer", phone: "+7 701 123-45-67", email: "" };
const TYPED = { label: "Delivery", recipientName: "", phone: "", countryCode: "KZ", region: "almaty", city: "Almaty", line1: "Baitursynov Street, 104", line2: "", postalCode: "", lat: 43.238004, lng: 76.928505, geoPrecision: "exact" };

test("only Kazakhstan saved addresses ship; the primary one is preselected", () => {
  assert.equal(isDeliverable(HOME), true);
  assert.equal(isDeliverable(BERLIN), false);
  assert.equal(defaultDeliveryChoice([OFFICE, HOME, BERLIN]), HOME.id);
  assert.equal(defaultDeliveryChoice([{ ...BERLIN, isPrimary: true }, OFFICE]), OFFICE.id, "a primary outside Kazakhstan is skipped");
  assert.equal(defaultDeliveryChoice([BERLIN]), NEW_ADDRESS);
  assert.equal(defaultDeliveryChoice([]), NEW_ADDRESS);
});

test("regions resolve from a code, a name or a listed city; phones are normalised to E.164", () => {
  assert.equal(checkoutRegionCode({ region: "almaty", city: "", line1: "" }), "almaty");
  assert.equal(checkoutRegionCode({ region: "Алматинская область", city: "", line1: "" }), "almaty-region");
  assert.equal(checkoutRegionCode({ region: "", city: "Astana", line1: "" }), "astana");
  assert.equal(checkoutRegionCode({ region: "Berlin", city: "Astana", line1: "" }), "", "an unknown typed region is not replaced by the city");
  assert.equal(checkoutRegionCode({ region: "", city: "Springfield", line1: "" }), "");
  assert.equal(normalizePhone("+7 (701) 123-45.67"), "+77011234567");
});

test("validation: a new address needs name, E.164 phone, region (or listed city), city and street", () => {
  const empty = { region: "", city: "", line1: "" };
  assert.deepEqual(checkoutProblems({ name: "", phone: "", email: "" }, NEW_ADDRESS, [], empty),
    ["Enter the recipient's full name", "Enter a phone number", "Choose a region", "Enter the city or settlement", "Enter the street and house"]);
  assert.deepEqual(checkoutProblems({ ...CONTACT, phone: "87011234567" }, NEW_ADDRESS, [], TYPED), ["Enter the phone in international format, e.g. +77011234567"]);
  assert.deepEqual(checkoutProblems(CONTACT, NEW_ADDRESS, [], { ...TYPED, region: "", city: "Shymkent" }), [], "a listed city stands in for the region");
  assert.deepEqual(checkoutProblems(CONTACT, NEW_ADDRESS, [], { ...TYPED, region: "Tashkent" }), ["Choose a region of Kazakhstan from the list"]);
  assert.deepEqual(checkoutProblems({ ...CONTACT, email: "not-an-email" }, NEW_ADDRESS, [], TYPED), ["Enter a valid email or leave it empty"]);
  assert.deepEqual(checkoutProblems(CONTACT, NEW_ADDRESS, [], TYPED), []);
  // A saved choice brings its own recipient and phone: the contact fields are not required.
  assert.deepEqual(checkoutProblems({ name: "", phone: "", email: "" }, HOME.id, [HOME], empty), []);
  assert.match(checkoutProblems(CONTACT, BERLIN.id, [BERLIN], empty)[0], /outside Kazakhstan\. Edit it in your account/);
  assert.deepEqual(checkoutProblems(CONTACT, "missing-id", [HOME], empty), ["Choose a delivery address"]);
});

test("payload: saved choices send id and version; new ones send a KZ inline address without empty optionals", () => {
  assert.deepEqual(deliveryPayload(CONTACT, OFFICE.id, [HOME, OFFICE], TYPED), { kind: "saved", addressId: OFFICE.id, version: 5 });
  assert.deepEqual(deliveryPayload(CONTACT, NEW_ADDRESS, [HOME], TYPED), {
    kind: "inline", address: { recipientName: "Synthetic Buyer", phone: "+77011234567", countryCode: "KZ", region: "almaty", city: "Almaty", line1: "Baitursynov Street, 104" },
  });
  assert.deepEqual(deliveryPayload(CONTACT, NEW_ADDRESS, [], { ...TYPED, region: "", city: " Astana ", line2: " Apt 4 ", postalCode: "010000" }).address,
    { recipientName: "Synthetic Buyer", phone: "+77011234567", countryCode: "KZ", region: "astana", city: "Astana", line1: "Baitursynov Street, 104", line2: "Apt 4", postalCode: "010000" });
});

/** The real panel with stubbed hooks. Slots: 0 form, 1 quote, 2 busy, 3 error, 4 retry, 5 account, 6 choice, 7 address, 8 save-new, 9 pickup store. */
function load(seed = {}) {
  const state = [], quotes = [], requests = [];
  let index = 0;
  const hooks = { useState(initial) { const key = index++; if (!(key in state)) state[key] = key in seed ? seed[key] : typeof initial === "function" ? initial() : initial; return [state[key], value => { state[key] = typeof value === "function" ? value(state[key]) : value; }]; }, useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }) };
  const checkoutClient = {
    createCheckoutStorage: () => ({ get: () => null, set() {}, remove() {} }),
    createCheckoutClient: () => ({ quote: async body => { quotes.push(body); return null; }, placeOrder: async () => ({}) }),
    beginCheckout: () => "checkout-key-0000001", checkoutRecovery: () => "fail", forgetCheckoutKey() {}, settleCheckoutKey() {}, retryOrderPayment: async () => null, pollOrderStatus: async () => null, rememberOrder() {}, resumePendingCheckout: async () => null,
  };
  const fetcher = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method: init.method ?? "GET", body });
    if (url === "/api/account/addresses" && init.method === "POST") return { ok: true, status: 201, json: async () => ({ ...body, id: "00000000-0000-4000-8000-0000000000c1", version: 1 }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const AddressForm = function AddressForm() { return null; };
  const modules = {
    react: hooks, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, "next/link": "a", ...i18nModules,
    "@/lib/account-client": accountClient, "@/lib/checkout-client": checkoutClient, "@/lib/checkout-address": step, "@/lib/kz-regions": kzRegions, "@/lib/analytics/events": analyticsEvents,
    "@/components/address/AddressForm": { AddressForm }, "@/lib/pickup": pickupLib,
  };
  const output = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", "fetch", "sessionStorage", code)(id => modules[id] ?? {}, output, fetcher, {});
  const render = () => { index = 0; return output.CheckoutPanel({ cart: CART, disabled: false, onPlaced: () => {} }); };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const submit = async () => { nodes(render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); for (let i = 0; i < 5; i++) await flush(); };
  const field = name => nodes(render()).find(node => node.type === "input" && node.props.name === name);
  return { render, submit, field, form: () => nodes(render()).find(node => node.type === AddressForm), state, quotes, requests };
}
const signedIn = addresses => ({ status: "signed-in", addresses });

test("signed in: saved addresses are radio cards, the outside-Kazakhstan one disabled, and the saved choice is quoted by id and version", async () => {
  const panel = load({ 5: signedIn([HOME, OFFICE, BERLIN]), 6: HOME.id });
  const tree = panel.render(), radios = nodes(tree).filter(node => node.type === "input" && node.props.type === "radio");
  assert.deepEqual(radios.map(radio => [radio.props.value, radio.props.checked, radio.props.disabled]),
    [[HOME.id, true, false], [OFFICE.id, false, false], [BERLIN.id, false, true], [NEW_ADDRESS, false, false]]);
  const text = nodeText(tree);
  assert.match(text, /Edit in your account to ship in Kazakhstan/);
  assert.match(text, /Konaev, Almaty Region/, "the region code is shown as its name");
  assert.equal(panel.form(), undefined, "the address form stays hidden while a saved address is chosen");
  assert.equal(panel.field("name"), undefined, "a saved address brings its own recipient and phone");
  assert.equal(panel.field("countryCode"), undefined, "there is no free-text country input");
  assert.ok(panel.field("email"), "the optional email is always asked");
  radios[1].props.onChange();
  await panel.submit();
  assert.deepEqual(panel.quotes.map(body => body.delivery), [{ kind: "saved", addressId: OFFICE.id, version: 5 }]);
});

test("signed in: New address reveals AddressForm and the save option; saving stores it (not primary) and quotes it as saved", async () => {
  const panel = load({ 5: signedIn([HOME]), 6: HOME.id });
  nodes(panel.render()).find(node => node.props?.value === NEW_ADDRESS).props.onChange();
  const form = panel.form();
  assert.ok(form, "AddressForm is shown for a new address");
  assert.deepEqual([form.props.idPrefix, form.props.showLabel, form.props.showContact], ["checkout-address", false, false]);
  panel.field("name").props.onChange({ target: { value: "Synthetic Buyer" } });
  panel.field("phone").props.onChange({ target: { value: "+7 701 123 45 67" } });
  form.props.onChange(TYPED);
  panel.field("saveAddress").props.onChange({ target: { checked: true } });
  await panel.submit();
  const post = panel.requests.find(request => request.method === "POST");
  assert.equal(post.url, "/api/account/addresses");
  assert.deepEqual([post.body.label, post.body.countryCode, post.body.region, post.body.city, post.body.line1, post.body.phone, post.body.isPrimary, post.body.lat, post.body.geoPrecision],
    ["Delivery", "KZ", "almaty", "Almaty", "Baitursynov Street, 104", "+77011234567", false, 43.238004, "exact"]);
  assert.deepEqual(panel.quotes.map(body => body.delivery), [{ kind: "saved", addressId: "00000000-0000-4000-8000-0000000000c1", version: 1 }]);
  assert.equal(panel.state[6], "00000000-0000-4000-8000-0000000000c1", "the new saved address becomes the chosen card");
});

test("signed in: a new address without saving is quoted inline", async () => {
  const panel = load({ 0: { name: "Synthetic Buyer", phone: "+77011234567", email: "", coupon: "" }, 5: signedIn([HOME]), 6: NEW_ADDRESS, 7: TYPED });
  await panel.submit();
  assert.equal(panel.requests.filter(request => request.method === "POST").length, 0, "nothing is saved unless asked");
  assert.deepEqual(panel.quotes[0].delivery, { kind: "inline", address: { recipientName: "Synthetic Buyer", phone: "+77011234567", countryCode: "KZ", region: "almaty", city: "Almaty", line1: "Baitursynov Street, 104" } });
});

test("guest: AddressForm is shown directly, there is no save option, and missing fields stop the quote", async () => {
  const panel = load({ 5: { status: "guest" } });
  const tree = panel.render();
  assert.equal(nodes(tree).filter(node => node.props?.type === "radio").length, 0);
  assert.ok(panel.form(), "guests type their address");
  assert.equal(panel.field("saveAddress"), undefined);
  await panel.submit();
  assert.equal(panel.quotes.length, 0);
  assert.match(panel.state[3], /Enter the recipient's full name.*Enter a phone number.*Choose a region.*Enter the city or settlement.*Enter the street and house/);
  panel.field("name").props.onChange({ target: { value: "Synthetic Guest" } });
  panel.field("phone").props.onChange({ target: { value: "87011234567" } });
  panel.form().props.onChange({ ...TYPED, region: "", city: "Shymkent", line1: "Tauke Khan 5", lat: null, lng: null, geoPrecision: null });
  await panel.submit();
  assert.equal(panel.quotes.length, 0);
  assert.match(panel.state[3], /international format/);
  panel.field("phone").props.onChange({ target: { value: "+77011234567" } });
  await panel.submit();
  assert.deepEqual(panel.quotes[0].delivery, { kind: "inline", address: { recipientName: "Synthetic Guest", phone: "+77011234567", countryCode: "KZ", region: "shymkent", city: "Shymkent", line1: "Tauke Khan 5" } });
});

// 0033 (owner 2026-11-26): pick up at the store.
const STORE = { enabled: true, name: { en: "Garmin showroom", ru: "Шоурум Garmin", kk: "Garmin шоурумы" }, address: { en: "154 Panfilov St, Almaty", ru: "ул. Панфилова, 154", kk: "Панфилов к-сі, 154" }, hours: { en: "Daily 10:00–19:00", ru: "Ежедневно 10:00–19:00", kk: "Күн сайын 10:00–19:00" }, phone: "+77270000000", lat: null, lng: null };

test("pickup: needs the collector's name and phone, and sends only the contact", () => {
  assert.deepEqual(checkoutProblems({ name: "", phone: "", email: "" }, PICKUP, [HOME], { region: "", city: "", line1: "" }), ["Enter the recipient's full name", "Enter a phone number"]);
  assert.deepEqual(checkoutProblems(CONTACT, PICKUP, [], { region: "", city: "", line1: "" }), []);
  assert.deepEqual(deliveryPayload(CONTACT, PICKUP, [HOME], TYPED), { kind: "pickup", contact: { recipientName: "Synthetic Buyer", phone: "+77011234567" } });
});

test("signed in: saved addresses, then Pick up at store with hours, then Another address; pickup shows the store card and is quoted as pickup", async () => {
  const panel = load({ 5: signedIn([HOME]), 6: HOME.id, 9: STORE });
  const radios = () => nodes(panel.render()).filter(node => node.type === "input" && node.props.type === "radio");
  assert.deepEqual(radios().map(radio => radio.props.value), [HOME.id, PICKUP, NEW_ADDRESS]);
  const text = nodeText(panel.render());
  assert.match(text, /Pick up at store/); assert.match(text, /Daily 10:00–19:00/); assert.match(text, /Another address/);
  radios()[1].props.onChange();
  const card = nodeText(panel.render());
  assert.match(card, /Opening hours: Daily 10:00–19:00/); assert.match(card, /Open in maps/); assert.match(card, /\+77270000000/);
  panel.field("name").props.onChange({ target: { value: "Synthetic Buyer" } });
  panel.field("phone").props.onChange({ target: { value: "+7 701 123 45 67" } });
  await panel.submit();
  assert.deepEqual(panel.quotes.map(body => body.delivery), [{ kind: "pickup", contact: { recipientName: "Synthetic Buyer", phone: "+77011234567" } }]);
});

test("guest: Pick up at store and Deliver to an address; without the store there are no choices", () => {
  const withStore = load({ 5: { status: "guest" }, 6: NEW_ADDRESS, 9: STORE });
  assert.deepEqual(nodes(withStore.render()).filter(node => node.type === "input" && node.props.type === "radio").map(radio => radio.props.value), [PICKUP, NEW_ADDRESS]);
  assert.match(nodeText(withStore.render()), /Deliver to an address/);
  const without = load({ 5: { status: "guest" }, 6: NEW_ADDRESS });
  assert.equal(nodes(without.render()).filter(node => node.type === "input" && node.props.type === "radio").length, 0);
});
