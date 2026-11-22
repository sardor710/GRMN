import assert from "node:assert/strict";
import test from "node:test";
import { enqueueOrderAlerts, formatKzt, orderAlertParameters, parseWhatsAppEnv, sendOrderAlert, templateText } from "../../src/server/notifications/whatsapp.ts";

const token = "EAAG" + "x".repeat(40);
const base = { WHATSAPP_ACCESS_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: "123456789012345", WHATSAPP_NOTIFY_TO: "+7 701 123 4567, 77017654321" };
const config = parseWhatsAppEnv(base);

test("alerts are off without any WHATSAPP_* variable and a partial setup names the field only", () => {
  assert.equal(parseWhatsAppEnv({}), null);
  assert.throws(() => parseWhatsAppEnv({ WHATSAPP_ACCESS_TOKEN: token }), (error) => {
    assert.equal(error.message, "Missing or invalid WhatsApp configuration: WHATSAPP_NOTIFY_TO");
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.throws(() => parseWhatsAppEnv({ ...base, WHATSAPP_NOTIFY_TO: "12345" }), /WHATSAPP_NOTIFY_TO/);
  assert.throws(() => parseWhatsAppEnv({ ...base, WHATSAPP_PHONE_NUMBER_ID: "+7701" }), /WHATSAPP_PHONE_NUMBER_ID/);
});

test("recipients are normalized and deduplicated, with defaults for the template", () => {
  assert.deepEqual(config.recipients, ["77011234567", "77017654321"]);
  assert.equal(parseWhatsAppEnv({ ...base, WHATSAPP_NOTIFY_TO: "77011234567,+77011234567" }).recipients.length, 1);
  assert.equal(config.templateName, "order_alert");
  assert.equal(config.templateLanguage, "en");
  assert.equal(config.graphVersion, "v23.0");
});

test("template parameters are flattened, bounded and never empty", () => {
  assert.equal(templateText("a\nb\t c     d"), "a b c d");
  assert.equal(templateText("   "), "-");
  assert.equal(templateText("x".repeat(500)).length, 200);
  assert.equal(formatKzt("45999000"), "459 990 ₸");
  assert.equal(formatKzt("12345"), "123.45 ₸");
  assert.deepEqual(orderAlertParameters("paid", {
    orderNumber: "GRM-1000001", totalMinor: "45999000", contactName: "Aida K.", contactPhone: "+77011234567",
    items: [{ name: "fēnix 8", quantity: 1 }, { name: "Strap", quantity: 2 }],
  }), ["Order paid", "GRM-1000001", "459 990 ₸", "Aida K., +77011234567", "1× fēnix 8; 2× Strap"]);
});

test("one job per recipient is queued in the caller's transaction, and a broken setup queues nothing", async () => {
  const queries = [];
  const client = { query: async (sql, params) => { queries.push(params); return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }] }; } };
  const orderId = "11111111-1111-4111-8111-111111111111";
  assert.equal(await enqueueOrderAlerts(client, orderId, "placed", base), 2);
  assert.equal(queries.length, 2);
  assert.equal(queries[0][0], "notifications.whatsapp.order");
  assert.equal(queries[0][1], `whatsapp:placed:${orderId}:77011234567`);
  assert.equal(await enqueueOrderAlerts(client, orderId, "placed", {}), 0);
  const original = console.error; console.error = () => {};
  try { assert.equal(await enqueueOrderAlerts(client, orderId, "placed", { WHATSAPP_ACCESS_TOKEN: token }), 0); } finally { console.error = original; }
  assert.equal(queries.length, 2);
});

test("the Cloud API request carries the template, and failures are classified for retry", async () => {
  let seen;
  await sendOrderAlert(config, "77011234567", ["a", "b"], { fetch: async (url, init) => { seen = { url, init }; return { status: 200 }; } });
  assert.equal(seen.url, "https://graph.facebook.com/v23.0/123456789012345/messages");
  assert.equal(seen.init.headers.authorization, `Bearer ${token}`);
  const body = JSON.parse(seen.init.body);
  assert.equal(body.to, "77011234567");
  assert.equal(body.template.name, "order_alert");
  assert.deepEqual(body.template.components[0].parameters, [{ type: "text", text: "a" }, { type: "text", text: "b" }]);

  const failWith = (status) => sendOrderAlert(config, "77011234567", ["a"], { fetch: async () => ({ status }) });
  await assert.rejects(failWith(503), (error) => error.code === "WHATSAPP_UNAVAILABLE" && error.retryable);
  await assert.rejects(failWith(429), (error) => error.retryable);
  await assert.rejects(failWith(400), (error) => error.code === "WHATSAPP_REJECTED" && !error.retryable);
  await assert.rejects(failWith(401), (error) => error.code === "WHATSAPP_UNAUTHORIZED" && !error.retryable);
  await assert.rejects(sendOrderAlert(config, "77011234567", ["a"], { fetch: async () => { throw new Error("offline"); } }),
    (error) => error.code === "WHATSAPP_UNREACHABLE" && error.retryable && !error.message.includes(token));
});
