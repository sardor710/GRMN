// M7 / decision D03a: demo purchases are an env-gated sandbox auto-capture adapter.
import assert from "node:assert/strict";
import test from "node:test";
import { assertDemoPurchaseActor, createSandboxProvider, demoPurchasesGate, SANDBOX_MERCHANT } from "../../src/server/payments/sandbox.ts";
import { configuredPaymentProviders } from "../../src/server/payments/providers.ts";
import { acceptsWebhooks, createPaymentProviders } from "../../src/server/payments/provider.ts";
import { createDemoProvider } from "../../src/server/payments/demo.ts";

const live = { name: "kaspi", environment: "live", merchantAccount: "m", simulated: false };
const quiet = fn => { const warn = console.warn, lines = []; console.warn = line => lines.push(line); try { return { value: fn(), lines }; } finally { console.warn = warn; } };

test("the gate opens only with DEMO_PURCHASES=1", () => {
  assert.deepEqual(demoPurchasesGate({}), { enabled: false, reason: "disabled" });
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "0" }), { enabled: false, reason: "disabled" });
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "true" }), { enabled: false, reason: "disabled" });
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "1", NODE_ENV: "development" }), { enabled: true, production: false });
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "1", NODE_ENV: "test" }), { enabled: true, production: false });
});

test("production refuses demo purchases unless DEMO_PURCHASES_ALLOW_PRODUCTION=1", () => {
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "1", NODE_ENV: "production" }), { enabled: false, reason: "production" });
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "1", NODE_ENV: "production", DEMO_PURCHASES_ALLOW_PRODUCTION: "yes" }), { enabled: false, reason: "production" });
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "1", NODE_ENV: "production", DEMO_PURCHASES_ALLOW_PRODUCTION: "1" }), { enabled: true, production: true });
});

test("a configured live provider refuses demo purchases", () => {
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "1" }, [createDemoProvider(), live]), { enabled: false, reason: "live_provider" });
  assert.deepEqual(demoPurchasesGate({ DEMO_PURCHASES: "1" }, [createDemoProvider(), { ...live, environment: "sandbox" }]), { enabled: true, production: false });
  assert.throws(() => createPaymentProviders([createSandboxProvider(), live]), /refused while a live payment provider/);
  assert.throws(() => createPaymentProviders([{ ...createSandboxProvider(), environment: "live" }]), /only in the sandbox environment/);
  // beta5 merge: the manual adapter (O07, live but confirmed by staff) does not block demo purchases.
  const manual = { ...live, name: "manual", merchantAccount: "manual", webhooks: false };
  assert.deepEqual([...createPaymentProviders([createDemoProvider(), manual, createSandboxProvider()]).keys()], ["demo", "manual", "sandbox"]);
});

test("the application registry adds the sandbox adapter only when the gate is open", () => {
  assert.deepEqual(configuredPaymentProviders({}).map(p => p.name), ["demo", "manual"]);
  assert.deepEqual(configuredPaymentProviders({ DEMO_PURCHASES: "1", NODE_ENV: "development" }).map(p => p.name), ["demo", "manual", "sandbox"]);
  const refused = quiet(() => configuredPaymentProviders({ DEMO_PURCHASES: "1", NODE_ENV: "production" }));
  assert.deepEqual(refused.value.map(p => p.name), ["demo", "manual"]);
  assert.match(refused.lines.join("\n"), /DEMO_PURCHASES=1 is ignored: NODE_ENV=production/);
  assert.deepEqual(configuredPaymentProviders({ DEMO_PURCHASES: "1", NODE_ENV: "production", DEMO_PURCHASES_ALLOW_PRODUCTION: "1" }).map(p => p.name), ["demo", "manual", "sandbox"]);
  const registry = createPaymentProviders(configuredPaymentProviders({ DEMO_PURCHASES: "1" }));
  assert.equal(registry.get("sandbox").environment, "sandbox");
});

test("the sandbox adapter is honest: sandbox environment, no webhooks, stable capture per attempt", async () => {
  const sandbox = createSandboxProvider();
  assert.deepEqual([sandbox.name, sandbox.environment, sandbox.merchantAccount, sandbox.simulated], ["sandbox", "sandbox", SANDBOX_MERCHANT, false]);
  assert.equal(acceptsWebhooks(sandbox), false, "no webhook path for the sandbox");
  assert.equal(acceptsWebhooks(createDemoProvider()), false);
  assert.equal(acceptsWebhooks({ ...live, environment: "sandbox" }), true);
  assert.equal(sandbox.verifySignature(new Uint8Array(), new Headers()), false);
  assert.equal(sandbox.parseEvent(new Uint8Array()), null);
  const session = await sandbox.startSession({ attemptId: "a1", orderId: "o1", idempotencyKey: "payment:k", merchantReference: "GRM-1", amountMinor: "123400", currency: "KZT" });
  assert.deepEqual(session, { sessionId: "sandbox-session:a1", redirectUrl: null, provenance: { provider: "sandbox", environment: "sandbox", merchantAccount: SANDBOX_MERCHANT, simulated: false } });
  assert.deepEqual(await sandbox.lookup({ attemptId: "a1", merchantReference: "GRM-1", sessionId: null, idempotencyKey: "payment:k", amountMinor: "123400" }), { state: "pending" }, "no session, nothing captured");
  const first = await sandbox.lookup({ attemptId: "a1", merchantReference: "GRM-1", sessionId: session.sessionId, idempotencyKey: "payment:k", amountMinor: "123400" });
  const second = await sandbox.lookup({ attemptId: "a1", merchantReference: "GRM-1", sessionId: session.sessionId, idempotencyKey: "payment:k", amountMinor: "123400" });
  assert.equal(first.state, "event");
  const { occurredAt, ...event } = first.event;
  assert.match(occurredAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(event, { eventId: "sandbox-capture:a1", kind: "captured", merchantAccount: SANDBOX_MERCHANT, environment: "sandbox", merchantReference: "GRM-1", sessionId: "sandbox-session:a1", transactionId: "sandbox-txn:a1", amountMinor: "123400", currency: "KZT" });
  assert.equal(second.event.transactionId, first.event.transactionId, "the same attempt always reports the same capture");
  assert.deepEqual(await sandbox.refund({ refundId: "r1", orderId: "o1", idempotencyKey: "refund:r1", transactionExternalId: "sandbox-txn:a1", amountMinor: "100", currency: "KZT" }), { state: "succeeded", providerRefundId: "sandbox-refund:r1" });
});

// M9.3 review finding 2: the production override admits signed-in staff only.
test("with the production override the sandbox adapter is staff-only; elsewhere it is open", () => {
  const prod = configuredPaymentProviders({ DEMO_PURCHASES: "1", NODE_ENV: "production", DEMO_PURCHASES_ALLOW_PRODUCTION: "1" }).find(p => p.name === "sandbox");
  const dev = configuredPaymentProviders({ DEMO_PURCHASES: "1", NODE_ENV: "development" }).find(p => p.name === "sandbox");
  assert.equal(prod.staffOnly, true);
  assert.equal(dev.staffOnly, false);
  assert.equal(createSandboxProvider().staffOnly, false);
  const refused = actor => assert.throws(() => assertDemoPurchaseActor(prod, actor), error => error.status === 403 && error.code === "DEMO_PURCHASE_STAFF_ONLY" && /staff/i.test(error.message));
  refused({ userId: null, staff: false });
  refused({ userId: null, staff: true }); // a guest is never staff, whatever the flag says
  refused({ userId: "u1", staff: false });
  refused({ userId: "u1" });
  assert.doesNotThrow(() => assertDemoPurchaseActor(prod, { userId: "u1", staff: true }));
  for (const actor of [{ userId: null }, { userId: "u1", staff: false }]) assert.doesNotThrow(() => assertDemoPurchaseActor(dev, actor));
});
