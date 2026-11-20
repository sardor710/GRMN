// Task 10C: the browser account client talks only to session-owned endpoints.
import assert from "node:assert/strict";
import test from "node:test";
import { createAccountClient, AccountRequestError, formatKzt, deliveryAddressLines, COUNTRY_OPTIONS } from "../../src/lib/account-client.ts";

function recorder(responses = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body === undefined ? undefined : JSON.parse(init.body), headers: init.headers ?? {}, cache: init.cache });
    const [status, body] = responses[`${init.method ?? "GET"} ${url}`] ?? [200, {}];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetcher };
}

test("reads use only session-owned account URLs, no-store, and never a contact selector", async () => {
  const { calls, fetcher } = recorder();
  const client = createAccountClient(fetcher);
  await client.session(); await client.profile(); await client.addresses(); await client.orders(); await client.orders("next.sig"); await client.order("00000000-0000-4000-8000-000000000001");
  assert.deepEqual(calls.map(call => call.url), ["/api/auth/get-session", "/api/account/profile", "/api/account/addresses", "/api/account/orders?limit=20", "/api/account/orders?limit=20&cursor=next.sig", "/api/account/orders/00000000-0000-4000-8000-000000000001"]);
  for (const call of calls) { assert.equal(call.cache, "no-store"); assert.doesNotMatch(call.url, /email|phone=|userId/); }
});

test("writes send strict JSON bodies with versions to the right endpoints", async () => {
  const { calls, fetcher } = recorder();
  const client = createAccountClient(fetcher);
  const address = { label: "Home", recipientName: "A", phone: "+77000000001", countryCode: "KZ", city: "Almaty", line1: "Street 1", isPrimary: false };
  await client.saveProfile({ name: "A", email: "a@example.invalid", phone: "+77000000001", expectedVersion: 0 });
  await client.saveAddress(address);
  await client.saveAddress({ ...address, line2: "" }, { id: "id-1", version: 3 });
  await client.deleteAddress({ id: "id-1", version: 4 });
  await client.sendCode("+77000000001", "phone_change_current");
  await client.verifySignIn({ phoneNumber: "+77000000001", challengeId: "c", code: "123456" });
  await client.completeProfile({ name: "A", email: "a@example.invalid", phoneNumber: "+77000000001" });
  await client.changePhone({ phoneNumber: "+77000000002", currentChallengeId: "c1", currentCode: "111111", challengeId: "c2", code: "222222", expectedVersion: 1 });
  await client.claimOrder({ orderId: "o", receiptToken: "r", challengeId: "c", code: "123456" });
  await client.changeStaffPassword({ currentPassword: "old", newPassword: "new" });
  await client.signOut();
  assert.deepEqual(calls.map(call => `${call.method} ${call.url}`), [
    "PUT /api/account/profile", "POST /api/account/addresses", "PUT /api/account/addresses/id-1", "DELETE /api/account/addresses/id-1",
    "POST /api/auth/grmn/phone/send", "POST /api/auth/grmn/phone/verify", "POST /api/auth/grmn/phone/complete",
    "POST /api/account/phone", "POST /api/account/claims", "POST /api/auth/change-password", "POST /api/auth/sign-out",
  ]);
  for (const call of calls) assert.equal(call.headers["content-type"], "application/json");
  assert.equal("id" in calls[1].body || "expectedVersion" in calls[1].body, false);
  assert.equal(calls[2].body.expectedVersion, 3); assert.equal("id" in calls[2].body, false); assert.equal("line2" in calls[2].body, false, "blank optional fields are omitted");
  assert.deepEqual(calls[3].body, { expectedVersion: 4 });
  assert.deepEqual(calls[4].body, { phoneNumber: "+77000000001", purpose: "phone_change_current" });
  assert.deepEqual(calls[9].body, { currentPassword: "old", newPassword: "new", revokeOtherSessions: true });
  assert.deepEqual(calls[10].body, {});
});

test("failures surface the server status, code and message instead of a fake success", async () => {
  const { fetcher } = recorder({ "GET /api/account/profile": [503, { error: { code: "DEPENDENCY_UNAVAILABLE", message: "Account services are unavailable" } }], "POST /api/auth/change-password": [403, { error: { code: "FORBIDDEN", message: "This account signs in with a verified phone; use phone verification instead" } }] });
  const client = createAccountClient(fetcher);
  await assert.rejects(client.profile(), error => error instanceof AccountRequestError && error.status === 503 && error.code === "DEPENDENCY_UNAVAILABLE");
  await assert.rejects(client.changeStaffPassword({ currentPassword: "a", newPassword: "b" }), error => error.status === 403 && /verified phone/.test(error.message));
  const broken = createAccountClient(async () => { throw new TypeError("network down"); });
  await assert.rejects(broken.profile(), error => error instanceof AccountRequestError && error.status === 0);
  const html = createAccountClient(async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError("not json"); } }));
  await assert.rejects(html.profile(), error => error.status === 500 && error.message.length > 0);
});

test("money is exact KZT from minor units and missing legacy money stays visibly missing", () => {
  // Task 5a.2: Garmin price rule, Intl currency KZT in the page locale (en default here), never USD.
  const plain = value => value.replace(/[\u00a0\u202f]/g, " ");
  assert.equal(plain(formatKzt({ amountMinor: "9007199254740993", currency: "KZT" })), "KZT 90,071,992,547,409.93");
  assert.equal(plain(formatKzt({ amountMinor: "9007199254740993", currency: "KZT" }, "ru-RU")), "90 071 992 547 409,93 ₸");
  assert.equal(plain(formatKzt({ amountMinor: "5", currency: "KZT" })), "KZT 0.05");
  assert.equal(formatKzt(null), "—");
  assert.equal(formatKzt(undefined), "—");
});

test("delivery addresses render structured, legacy raw and missing snapshots honestly", () => {
  assert.deepEqual(deliveryAddressLines({ kind: "structured", address: { recipientName: "A", phone: "+77000000001", countryCode: "KZ", city: "Almaty", line1: "Street 1", line2: "Apt 2", postalCode: "050000" } }), ["A", "Street 1", "Apt 2", "Almaty 050000", "Kazakhstan", "+77000000001"]);
  assert.deepEqual(deliveryAddressLines({ kind: "legacy_unstructured", raw: "old typed address" }), ["old typed address"]);
  assert.deepEqual(deliveryAddressLines(null), []);
  assert.ok(COUNTRY_OPTIONS.every(option => /^[A-Z]{2}$/.test(option.code)));
});
