import "server-only";
import type { PaymentProvenance, PaymentProvider } from "./provider.ts";

// Task 14B, changed by Task 3.2 (owner decision 2026-11-19 "full demo", replacing D03). The
// explicitly simulated demo adapter. It opens a local, labelled demo session and nothing outside
// talks to it: it has no webhooks (every request claiming to be a demo event is refused before its
// body is read) and its reconciliation never reports a payment. A demo order is captured once,
// right after checkout, by confirmDemoCapture (payments/service.ts); its refunds succeed locally
// with a `demo-refund:<refundId>` id and never reach a live provider. Every fact it leads to carries
// provider, environment and merchant account 'demo', so it is never counted as money.

const PROVENANCE: PaymentProvenance = Object.freeze({ provider: "demo", environment: "demo", merchantAccount: "demo", simulated: true });

/** The provider refund id a demo refund records (local and deterministic; nothing is sent anywhere). */
export const demoRefundId = (refundId: string) => `demo-refund:${refundId}`;

export function createDemoProvider(): PaymentProvider {
  return {
    name: "demo", environment: "demo", merchantAccount: "demo", simulated: true,
    async startSession(request) { return { sessionId: `demo-session:${request.attemptId}`, redirectUrl: null, provenance: { ...PROVENANCE } }; },
    verifySignature() { return false; },
    parseEvent() { return null; },
    async lookup() { return { state: "pending" }; },
    // A demo capture is refunded locally: nothing is sent anywhere and the refund always succeeds.
    async refund(request) { return { state: "succeeded", providerRefundId: demoRefundId(request.refundId) }; },
  };
}
