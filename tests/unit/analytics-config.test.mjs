// Task 5.1: the owner's Google tag ids and Search Console / Yandex Webmaster tokens live in
// store_settings.presentation_config.analytics. Invalid values are a field error on save and dropped on read.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAnalyticsConfig, validateAnalyticsInput } from "../../src/lib/analytics/config.ts";
import { componentFixture, nodes, nodeText } from "../helpers/component-fixture.mjs";

test("parseAnalyticsConfig keeps valid fields and silently drops invalid, blank and unknown ones", () => {
  assert.deepEqual(parseAnalyticsConfig({ ga4Id: "G-ABC123", gtmId: "GTM-1", googleVerification: "  abcdefghij_KLM-123 ", yandexVerification: "", extra: "x" }),
    { ga4Id: "G-ABC123", googleVerification: "abcdefghij_KLM-123" });
  assert.deepEqual(parseAnalyticsConfig({ ga4Id: "g-abc123", gtmId: "gtm-ab12cd", yandexVerification: "0123456789abcdef" }),
    { ga4Id: "G-ABC123", gtmId: "GTM-AB12CD", yandexVerification: "0123456789abcdef" });
  for (const value of [null, undefined, "G-ABC123", 42, [], { ga4Id: 5, gtmId: ["GTM-ABCD"] }]) assert.deepEqual(parseAnalyticsConfig(value), {});
});

test("validateAnalyticsInput reports a field error for each malformed id or token", () => {
  const { config, errors } = validateAnalyticsInput({ ga4Id: "UA-123", gtmId: "GTM-1", googleVerification: "bad token!", yandexVerification: "short" });
  assert.deepEqual(config, {});
  assert.deepEqual(Object.keys(errors).sort(), ["ga4Id", "googleVerification", "gtmId", "yandexVerification"]);
  for (const message of Object.values(errors)) assert.equal(typeof message, "string");
  assert.match(errors.ga4Id, /G-/);
  assert.match(errors.gtmId, /GTM-/);
});

test("validateAnalyticsInput trims, uppercases tag ids and treats blank as unset", () => {
  assert.deepEqual(validateAnalyticsInput({ ga4Id: " g-abc123 ", gtmId: "", googleVerification: "   ", yandexVerification: "abcdefghij" }),
    { config: { ga4Id: "G-ABC123", yandexVerification: "abcdefghij" }, errors: {} });
  assert.deepEqual(validateAnalyticsInput({}), { config: {}, errors: {} });
  // A verification token is case-sensitive: it is never uppercased.
  assert.equal(validateAnalyticsInput({ googleVerification: "AbCdEfGhIj-_9" }).config.googleVerification, "AbCdEfGhIj-_9");
  assert.ok(validateAnalyticsInput({ ga4Id: 123 }).errors.ga4Id, "a non-text value is an error");
});

test("the settings service stores analytics under presentation_config and returns it in the DTO", () => {
  const source = readFileSync("src/server/settings/service.ts", "utf8");
  assert.match(source, /presentation_config->'analytics'/);
  assert.match(source, /presentation_config\s*\|\|\s*jsonb_build_object\('analytics'/);
  assert.match(source, /analytics: AnalyticsConfig/);
  assert.match(source, /validateAnalyticsInput\(/);
  // The storefront reader needs no staff session.
  const reader = readFileSync("src/server/settings/public-analytics.ts", "utf8");
  assert.match(reader, /export (async )?function getPublicAnalyticsConfig|export const getPublicAnalyticsConfig/);
  assert.doesNotMatch(reader, /authorize|requireStaff|requirePermission/);
});

const FILE = "src/app/admin/settings/_components/StoreSettingsScreen.tsx";
const settings = (version, analytics) => ({
  version, storeName: "Store", contactEmail: null, supportPhone: null, baseCurrency: "KZT", usdDisplayEnabled: false, exchangeRate: null,
  freeShippingThresholdMinor: null, maintenanceMode: false, paymentMode: "live", seoTitle: null, seoDescription: null,
  manualPayment: { instructions: null, holdHours: 48 }, demoCheckout: { enabled: false, forcedOff: false }, ...(analytics ? { analytics } : {}),
});

test("Settings ▸ Google & analytics shows inline field errors and saves only valid, normalized ids", async () => {
  const puts = [];
  const fixture = componentFixture(FILE, {
    fetcher: async (_url, options = {}) => {
      if (options.method === "PUT") { const body = JSON.parse(options.body); puts.push(body); return { ok: true, status: 200, json: async () => settings(body.expectedVersion + 1, body.analytics) }; }
      return { ok: true, status: 200, json: async () => settings(3, { googleVerification: "abcdefghij" }) };
    },
  });
  fixture.render();
  fixture.effects[0]();
  for (let i = 0; i < 5; i++) await fixture.flush();
  let tree = fixture.render();
  assert.match(nodeText(tree), /Google & analytics/);
  const input = name => nodes(tree).find(node => node.type === "input" && node.props?.name === name);
  assert.equal(input("googleVerification").props.value, "abcdefghij", "the saved token is shown");
  input("ga4Id").props.onChange({ target: { value: "UA-123" } });
  tree = fixture.render();
  const save = () => nodes(tree).find(node => node.type === "button" && nodeText(node) === "Save Google settings").props.onClick();
  await save();
  for (let i = 0; i < 5; i++) await fixture.flush();
  tree = fixture.render();
  assert.deepEqual(puts, [], "nothing is sent while a field is invalid");
  assert.equal(input("ga4Id").props["aria-invalid"], true);
  const error = nodes(tree).find(node => node.props?.id === input("ga4Id").props["aria-describedby"]?.split(" ").find(id => id.endsWith("-error")));
  assert.match(nodeText(error), /G-/);
  input("ga4Id").props.onChange({ target: { value: " g-abc123 " } });
  tree = fixture.render();
  input("gtmId").props.onChange({ target: { value: "gtm-wxyz12" } });
  tree = fixture.render();
  await save();
  for (let i = 0; i < 5; i++) await fixture.flush();
  assert.deepEqual(puts, [{ expectedVersion: 3, analytics: { ga4Id: "G-ABC123", gtmId: "GTM-WXYZ12", googleVerification: "abcdefghij" } }]);
  tree = fixture.render();
  assert.equal(input("ga4Id").props.value, "G-ABC123");
  assert.equal(input("ga4Id").props["aria-invalid"], false);
});
