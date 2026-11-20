// Task 10C: the mounted account dashboard renders only session-owned API data, shows
// loading/empty/error states, keeps mutations off on failure and never fakes a credential reset.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";
import * as accountClient from "../../src/lib/account-client.ts";

const root = new URL("../../", import.meta.url);
const file = new URL("src/components/AccountDashboard.tsx", root);
const read = path => readFileSync(new URL(path, root), "utf8");
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };

const PROFILE = { id: "p1", name: "Synthetic Owner", email: "owner@example.invalid", emailVerified: false, phone: "+77000000001", phoneVerified: true, profileState: "complete", version: 2 };
const ADDRESS = { id: "a1", label: "Synthetic Home", recipientName: "Synthetic Owner", phone: "+77000000001", countryCode: "KZ", city: "Almaty", line1: "Synthetic street 1", isPrimary: true, version: 1 };
const ORDER = { id: "00000000-0000-4000-8000-000000000001", orderNumber: "GRM-SYN-1", createdAt: "2026-11-01T10:00:00.000Z", status: "placed", paymentStatus: "paid", fulfillmentStatus: "processing", total: { amountMinor: "12345", currency: "KZT" }, itemsCount: 1 };
const DETAIL = { ...ORDER, version: 1, contact: { name: "Synthetic Owner", phone: null, email: null }, deliveryAddress: { kind: "legacy_unstructured", raw: "Legacy typed street" }, dataQuality: "legacy_incomplete", items: [{ id: "i1", productKey: null, sku: null, name: "Legacy item", options: {}, quantity: 1, unitPrice: { amountMinor: "12345", currency: "KZT" }, discount: { amountMinor: "0", currency: "KZT" }, tax: { amountMinor: "0", currency: "KZT" }, total: { amountMinor: "12345", currency: "KZT" } }], subtotal: null, discount: null, shipping: null, tax: null, events: [] };

function signedIn(extra = {}) {
  return {
    "GET /api/auth/get-session": [200, { user: { id: "u1", name: "Synthetic Owner" }, staff: false }],
    "GET /api/account/profile": [200, PROFILE],
    "GET /api/account/addresses": [200, { items: [ADDRESS], nextCursor: null }],
    "GET /api/account/orders?limit=20": [200, { items: [], nextCursor: null }],
    ...extra,
  };
}

async function mount(routes) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const key = `${init.method ?? "GET"} ${url}`;
    calls.push({ key, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const route = routes[key];
    const [status, body] = (typeof route === "function" ? route(init.body === undefined ? undefined : JSON.parse(init.body)) : route) ?? [404, { error: { code: "NOT_FOUND", message: "Not found" } }];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  const fixture = componentFixture(file, { fetcher, modules: { "@/lib/account-client": accountClient } });
  let tree = fixture.render();
  const initial = tree;
  for (const effect of [...fixture.effects]) effect();
  await settle();
  tree = fixture.render();
  const view = {
    calls, routes, initial,
    get tree() { return tree; },
    text: () => nodeText(tree),
    rerender() { tree = fixture.render(); return tree; },
    button(label) { return nodes(tree).find(node => node.type === "button" && nodeText(node).includes(label)); },
    async click(label) { const button = view.button(label); assert.ok(button, `missing button ${label}`); assert.ok(!button.props.disabled, `${label} is disabled`); await button.props.onClick?.({ preventDefault() {}, stopPropagation() {} }); await settle(); view.rerender(); },
    input(name, value) { const node = nodes(tree).find(item => item.props?.name === name); assert.ok(node, `missing input ${name}`); node.props.onChange({ target: { value, checked: value } }); view.rerender(); },
    async submit(name) { const form = nodes(tree).find(item => item.type === "form" && item.props.name === name); assert.ok(form, `missing form ${name}`); await form.props.onSubmit({ preventDefault() {} }); await settle(); view.rerender(); },
  };
  return view;
}

test("the account page mounts the session-owned dashboard and the dashboard holds no demo or contact-selected data", () => {
  const page = read("src/app/[lang]/account/page.tsx");
  assert.match(page, /AccountDashboard/);
  assert.doesNotMatch(page, /data\.json|seed|cms\/store/);
  const source = read("src/components/AccountDashboard.tsx");
  for (const forbidden of [/Alex Rivera/, /alex\.rivera/, /\?email=/, /initialAccountOrders|initialAddresses|initialProfile/, /Send Reset Link/, /@\/lib\/cms/, /6J2004921|Outdoor Maps\+/]) assert.doesNotMatch(source, forbidden);
});

test("shows a loading state first and a phone sign-in panel without mutations when signed out", async () => {
  const view = await mount({ "GET /api/auth/get-session": [200, { user: null, staff: false }] });
  assert.match(nodeText(view.initial), /Loading your account/);
  assert.match(view.text(), /Sign in with your phone/);
  assert.equal(view.button("Edit Details"), undefined);
  assert.equal(view.button("Add Address"), undefined);
  assert.ok(!view.calls.some(call => call.key.startsWith("GET /api/account/")), "no account reads without a session");
});

test("an unavailable backend shows an honest error with mutations disabled", async () => {
  const view = await mount({ "GET /api/auth/get-session": [503, { error: { code: "DEPENDENCY_UNAVAILABLE", message: "Authentication is not enabled" } }] });
  assert.match(view.text(), /Account access is not available/);
  for (const label of ["Edit Details", "Add Address", "Sign Out", "Change phone number"]) assert.equal(view.button(label), undefined, label);
});

test("a partial load failure never shows half an account and offers a retry", async () => {
  const view = await mount(signedIn({ "GET /api/account/addresses": [500, { error: { code: "INTERNAL", message: "boom" } }] }));
  assert.match(view.text(), /could not load your account/i);
  assert.doesNotMatch(view.text(), /Synthetic Owner/);
  assert.equal(view.button("Add Address"), undefined);
  view.routes["GET /api/account/addresses"] = [200, { items: [ADDRESS], nextCursor: null }];
  await view.click("Try again");
  assert.match(view.text(), /Synthetic Owner/);
});

test("renders the real profile and addresses with an empty order history", async () => {
  const view = await mount(signedIn());
  const text = view.text();
  assert.match(text, /Synthetic Owner/);
  assert.match(text, /owner@example\.invalid/);
  assert.match(text, /Unverified/);
  assert.match(text, /Synthetic Home/);
  assert.match(text, /Synthetic street 1/);
  await view.click("Orders");
  assert.match(view.text(), /No orders yet/);
});

test("profile and address writes go to the API with versions and reload the server state", async () => {
  const view = await mount(signedIn({
    "PUT /api/account/profile": [200, { ...PROFILE, name: "Renamed Owner", version: 3 }],
    "POST /api/account/addresses": [200, { ...ADDRESS, id: "a2", label: "Office", isPrimary: false }],
  }));
  await view.click("Edit Details");
  view.input("name", "Renamed Owner");
  await view.submit("profile");
  assert.deepEqual(view.calls.find(call => call.key === "PUT /api/account/profile").body, { name: "Renamed Owner", email: "owner@example.invalid", phone: "+77000000001", expectedVersion: 2 });
  assert.match(view.text(), /Renamed Owner/);
  await view.click("Add Address");
  for (const [name, value] of [["label", "Office"], ["recipientName", "Synthetic Owner"], ["phone", "+77000000001"], ["city", "Astana"], ["line1", "Office street 2"]]) view.input(name, value);
  view.routes["GET /api/account/addresses"] = [200, { items: [ADDRESS, { ...ADDRESS, id: "a2", label: "Office", isPrimary: false }], nextCursor: null }];
  await view.submit("address");
  const created = view.calls.find(call => call.key === "POST /api/account/addresses").body;
  assert.equal(created.label, "Office"); assert.equal(created.countryCode, "KZ"); assert.equal("id" in created, false);
  assert.ok(view.calls.filter(call => call.key === "GET /api/account/addresses").length >= 2, "address book reloads from the server");
  assert.match(view.text(), /Office/);
});

test("a rejected write shows the server error and keeps the form open", async () => {
  const view = await mount(signedIn({ "POST /api/account/addresses": [409, { error: { code: "ADDRESS_LIMIT_REACHED", message: "At most 5 addresses can be saved" } }] }));
  await view.click("Add Address");
  for (const [name, value] of [["label", "Office"], ["recipientName", "A"], ["phone", "+77000000001"], ["city", "Astana"], ["line1", "Street"]]) view.input(name, value);
  await view.submit("address");
  assert.match(view.text(), /At most 5 addresses can be saved/);
  assert.ok(nodes(view.tree).some(node => node.type === "form" && node.props.name === "address"));
});

test("the wishlist tab lists the session's saved products, marks archived ones and removes by product key", async () => {
  const saved = { productKey: "fenix-8", name: "Saved watch", image: null, price: { amountMinor: "45000000", currency: "KZT" }, availability: "available", archived: false, addedAt: "2026-11-10T10:00:00.000Z" };
  const gone = { productKey: "old-watch", name: "Retired watch", image: null, price: null, availability: "unavailable", archived: true, addedAt: "2026-11-09T10:00:00.000Z" };
  const view = await mount(signedIn({ "GET /api/account/wishlist": [200, { items: [saved, gone] }], "DELETE /api/account/wishlist/old-watch": [200, { items: [saved] }] }));
  await view.click("Wishlist");
  assert.match(view.text(), /Saved watch/); assert.match(view.text(), /KZT\s?450,000\.00/);
  assert.match(view.text(), /Retired watch/); assert.match(view.text(), /no longer available/i);
  const remove = nodes(view.tree).find(node => node.type === "button" && node.props["aria-label"] === "Remove Retired watch from wishlist");
  assert.ok(remove); await remove.props.onClick(); await settle(); view.rerender();
  assert.ok(view.calls.some(call => call.key === "DELETE /api/account/wishlist/old-watch"));
  assert.doesNotMatch(view.text(), /Retired watch/);
});

test("the account tabs that are not built yet say so and show no records", async () => {
  const view = await mount(signedIn());
  for (const tab of ["Devices", "Subscriptions"]) { await view.click(tab); assert.match(view.text(), /not available yet/i); }
});

test("order detail shows exact KZT and marks missing legacy money and addresses", async () => {
  const view = await mount(signedIn({ "GET /api/account/orders?limit=20": [200, { items: [ORDER], nextCursor: null }], [`GET /api/account/orders/${ORDER.id}`]: [200, DETAIL] }));
  await view.click("Orders");
  assert.match(view.text(), /GRM-SYN-1/);
  assert.match(view.text(), /KZT\s?123\.45/);
  await view.click("GRM-SYN-1");
  const text = view.text();
  assert.match(text, /Legacy item/);
  assert.match(text, /Legacy typed street/);
  assert.match(text, /Subtotal\s+—/);
});

test("credential reset is real: customers change phone with two proofs and are signed out afterwards", async () => {
  const view = await mount(signedIn({
    "POST /api/auth/grmn/phone/send": body => [200, { challengeId: body.purpose === "phone_change_current" ? "00000000-0000-4000-8000-0000000000a1" : "00000000-0000-4000-8000-0000000000a2" }],
    "POST /api/account/phone": [200, { phone: "+77000000002", version: 3, signedOut: true }],
  }));
  assert.equal(view.button("Reset Password"), undefined);
  await view.click("Change phone number");
  view.input("newPhone", "+77000000002");
  await view.click("Send codes");
  const sends = view.calls.filter(call => call.key === "POST /api/auth/grmn/phone/send").map(call => call.body);
  assert.deepEqual(sends, [{ phoneNumber: "+77000000002", purpose: "phone_change_new" }, { phoneNumber: "+77000000001", purpose: "phone_change_current" }]);
  view.input("currentCode", "111111"); view.input("newCode", "222222");
  await view.submit("phone-change");
  assert.deepEqual(view.calls.find(call => call.key === "POST /api/account/phone").body, { phoneNumber: "+77000000002", currentChallengeId: "00000000-0000-4000-8000-0000000000a1", currentCode: "111111", challengeId: "00000000-0000-4000-8000-0000000000a2", code: "222222", expectedVersion: 2 });
  assert.match(view.text(), /Sign in with your phone/);
  assert.match(view.text(), /new number/);
});

test("staff change the password through the auth service and see its real errors", async () => {
  const view = await mount(signedIn({ "GET /api/auth/get-session": [200, { user: { id: "s1", name: "Staff" }, staff: true }], "POST /api/auth/change-password": [403, { error: { code: "FORBIDDEN", message: "Staff MFA verification is required" } }] }));
  assert.equal(view.button("Change phone number"), undefined);
  await view.click("Change password");
  view.input("currentPassword", "current-password-value"); view.input("newPassword", "a-new-password-of-length");
  await view.submit("password-change");
  assert.deepEqual(view.calls.find(call => call.key === "POST /api/auth/change-password").body, { currentPassword: "current-password-value", newPassword: "a-new-password-of-length", revokeOtherSessions: true });
  assert.match(view.text(), /Staff MFA verification is required/);
  assert.doesNotMatch(view.text(), /Password changed/);
});

test("phone sign-in verifies the code and loads the account; delivery failure is shown, not hidden", async () => {
  const routes = { "GET /api/auth/get-session": [200, { user: null, staff: false }], "POST /api/auth/grmn/phone/send": [503, { error: { code: "DEPENDENCY_UNAVAILABLE", message: "Phone delivery is not configured" } }] };
  const view = await mount(routes);
  view.input("signInPhone", "+77000000001");
  await view.submit("sign-in");
  assert.match(view.text(), /Phone delivery is not configured/);
  routes["POST /api/auth/grmn/phone/send"] = [200, { challengeId: "00000000-0000-4000-8000-0000000000bb" }];
  routes["POST /api/auth/grmn/phone/verify"] = [200, { state: "authenticated" }];
  await view.submit("sign-in");
  view.input("signInCode", "123456");
  Object.assign(routes, signedIn());
  await view.submit("sign-in-verify");
  assert.deepEqual(view.calls.find(call => call.key === "POST /api/auth/grmn/phone/verify").body, { phoneNumber: "+77000000001", challengeId: "00000000-0000-4000-8000-0000000000bb", code: "123456" });
  assert.match(view.text(), /Synthetic Owner/);
});

test("a legacy order claim uses the receipt, a fresh order_claim code and reloads orders", async () => {
  const view = await mount(signedIn({ "POST /api/auth/grmn/phone/send": [200, { challengeId: "00000000-0000-4000-8000-0000000000cc" }], "POST /api/account/claims": [200, { orderId: ORDER.id, claimed: true }] }));
  await view.click("Orders");
  view.input("claimOrderId", ORDER.id); view.input("claimReceipt", "r".repeat(43));
  await view.click("Send claim code");
  assert.deepEqual(view.calls.at(-1).body, { phoneNumber: "+77000000001", purpose: "order_claim" });
  view.input("claimCode", "654321");
  view.routes["GET /api/account/orders?limit=20"] = [200, { items: [ORDER], nextCursor: null }];
  await view.submit("claim");
  assert.deepEqual(view.calls.find(call => call.key === "POST /api/account/claims").body, { orderId: ORDER.id, receiptToken: "r".repeat(43), challengeId: "00000000-0000-4000-8000-0000000000cc", code: "654321" });
  assert.match(view.text(), /GRM-SYN-1/);
});

// ---------------------------------------------------------------- Task 10C review fixes
test("review I8: rendered text has no mis-encoded characters", () => {
  const source = read("src/components/AccountDashboard.tsx");
  assert.doesNotMatch(source, /вЂ|В·|Р[°-я]/);
  // Interface text lives in the message catalogs since the i18n merge.
  const en = read("messages/en.json");
  assert.doesNotMatch(en, /вЂ|В·|Р[°-я]/);
  assert.match(en, /Loading your account…/);
});

test("review I1: signing out clears every form so the next person on the device sees none of it", async () => {
  const routes = signedIn({ "POST /api/auth/sign-out": [200, { success: true }], "POST /api/auth/grmn/phone/send": [200, { challengeId: "00000000-0000-4000-8000-0000000000dd" }], "POST /api/auth/grmn/phone/verify": [200, { state: "authenticated" }] });
  const view = await mount(routes);
  await view.click("Edit Details");
  view.input("name", "First Person Typed");
  await view.click("Orders");
  view.input("claimOrderId", "first-person-order"); view.input("claimReceipt", "first-person-receipt");
  await view.click("Sign Out");
  assert.match(view.text(), /Sign in with your phone/);
  view.input("signInPhone", "+77000000003");
  await view.submit("sign-in");
  view.input("signInCode", "123456");
  routes["GET /api/account/profile"] = [200, { ...PROFILE, id: "p2", name: "Second Person", email: "second@example.invalid", phone: "+77000000003" }];
  await view.submit("sign-in-verify");
  assert.match(view.text(), /Second Person/);
  await view.click("Profile");
  assert.ok(!nodes(view.tree).some(node => node.type === "form" && node.props.name === "profile"), "edit form must not stay open");
  await view.click("Orders");
  for (const name of ["claimOrderId", "claimReceipt"]) assert.equal(nodes(view.tree).find(node => node.props?.name === name).props.value, "", name);
  assert.doesNotMatch(view.text(), /first-person/);
});

test("13A review I2: in-page sign-out and sign-in announce the session change so the server cart re-syncs and merges", async () => {
  const events = [], saved = globalThis.window;
  globalThis.window = { dispatchEvent: event => { events.push(event.type); return true; } };
  try {
    const routes = signedIn({ "POST /api/auth/sign-out": [200, { success: true }], "POST /api/auth/grmn/phone/send": [200, { challengeId: "00000000-0000-4000-8000-0000000000dd" }], "POST /api/auth/grmn/phone/verify": [200, { state: "authenticated" }] });
    const view = await mount(routes);
    await view.click("Sign Out");
    assert.deepEqual(events, ["grmn:session-changed"]);
    view.input("signInPhone", "+77000000003"); await view.submit("sign-in"); view.input("signInCode", "123456");
    await view.submit("sign-in-verify");
    assert.deepEqual(events, ["grmn:session-changed", "grmn:session-changed"]);
  } finally { if (saved === undefined) delete globalThis.window; else globalThis.window = saved; }
});

test("review I2: a saved address is reported saved even when the list refresh fails, so it is not resubmitted", async () => {
  const routes = signedIn({ "POST /api/account/addresses": [200, { ...ADDRESS, id: "a2", label: "Office", isPrimary: false }] });
  const view = await mount(routes);
  await view.click("Add Address");
  for (const [name, value] of [["label", "Office"], ["recipientName", "A"], ["phone", "+77000000001"], ["city", "Astana"], ["line1", "Street"]]) view.input(name, value);
  routes["GET /api/account/addresses"] = [500, { error: { code: "INTERNAL", message: "boom" } }];
  await view.submit("address");
  assert.ok(!nodes(view.tree).some(node => node.type === "form" && node.props.name === "address"), "modal closes after a successful write");
  assert.match(view.text(), /could not refresh/i);
  assert.equal(view.calls.filter(call => call.key === "POST /api/account/addresses").length, 1);
});

test("review I3: an address edit that hits a version conflict can be resubmitted with the fresh version", async () => {
  let attempt = 0;
  const routes = signedIn({ "PUT /api/account/addresses/a1": () => ++attempt === 1 ? [409, { error: { code: "VERSION_CONFLICT", message: "This record changed; reload and try again" } }] : [200, { ...ADDRESS, version: 3 }] });
  const view = await mount(routes);
  nodes(view.tree).find(node => node.type === "button" && node.props["aria-label"] === "Edit Synthetic Home").props.onClick();
  view.rerender();
  routes["GET /api/account/addresses"] = [200, { items: [{ ...ADDRESS, version: 2 }], nextCursor: null }];
  await view.submit("address");
  assert.match(view.text(), /This record changed/);
  await view.submit("address");
  const puts = view.calls.filter(call => call.key === "PUT /api/account/addresses/a1").map(call => call.body.expectedVersion);
  assert.deepEqual(puts, [1, 2]);
});

test("review I4/I5: a failed phone change asks for fresh codes, and a malformed new number texts nobody", async () => {
  const routes = signedIn({ "POST /api/auth/grmn/phone/send": body => [200, { challengeId: body.purpose === "phone_change_current" ? "00000000-0000-4000-8000-0000000000a1" : "00000000-0000-4000-8000-0000000000a2" }], "POST /api/account/phone": [401, { error: { code: "UNAUTHENTICATED", message: "Invalid or expired verification" } }] });
  const view = await mount(routes);
  await view.click("Change phone number");
  view.input("newPhone", "8 701 12");
  await view.click("Send codes");
  assert.equal(view.calls.filter(call => call.key === "POST /api/auth/grmn/phone/send").length, 0);
  assert.match(view.text(), /international format/i);
  view.input("newPhone", "+77000000002");
  await view.click("Send codes");
  view.input("currentCode", "111111"); view.input("newCode", "999999");
  await view.submit("phone-change");
  assert.match(view.text(), /Invalid or expired verification/);
  assert.ok(!nodes(view.tree).some(node => node.type === "form" && node.props.name === "phone-change"), "spent challenges are dropped");
  assert.match(view.text(), /send new codes/i);
  assert.ok(view.button("Send codes"));
});

test("review I6/I7: a failed claim drops its spent code, and one flow's send resets the other's", async () => {
  const routes = signedIn({ "POST /api/auth/grmn/phone/send": [200, { challengeId: "00000000-0000-4000-8000-0000000000cc" }], "POST /api/account/claims": [404, { error: { code: "NOT_FOUND", message: "Not found" } }] });
  const view = await mount(routes);
  await view.click("Change phone number");
  view.input("newPhone", "+77000000002");
  await view.click("Send codes");
  assert.ok(nodes(view.tree).some(node => node.type === "form" && node.props.name === "phone-change"));
  await view.click("Orders");
  view.input("claimOrderId", ORDER.id); view.input("claimReceipt", "r".repeat(43));
  await view.click("Send claim code");
  view.input("claimCode", "654321");
  await view.submit("claim");
  assert.match(view.text(), /Not found/);
  assert.equal(nodes(view.tree).find(node => node.props?.name === "claimCode"), undefined, "spent claim code input is gone");
  assert.ok(view.button("Send claim code"));
  await view.click("Profile");
  assert.ok(!nodes(view.tree).some(node => node.type === "form" && node.props.name === "phone-change"), "claim send consumed the phone-change current code");
});
