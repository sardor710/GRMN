import "server-only";
import type { PaymentProvenance, PaymentProvider } from "./provider.ts";

// Task 14B. The explicitly simulated demo adapter (decision D03). It opens a local, labelled demo
// session and nothing else: it has no webhooks (every request claiming to be a demo event is
// refused) and its reconciliation never reports a payment, so a demo order can never become paid
// and no real-capture fact is ever written for it (O07 stays open).

const PROVENANCE: PaymentProvenance = Object.freeze({ provider: "demo", environment: "demo", merchantAccount: "demo", simulated: true });

export function createDemoProvider(): PaymentProvider {
  return {
    name: "demo", environment: "demo", merchantAccount: "demo", simulated: true,
    async startSession(request) { return { sessionId: `demo-session:${request.attemptId}`, redirectUrl: null, provenance: { ...PROVENANCE } }; },
    verifySignature() { return false; },
    parseEvent() { return null; },
    async lookup() { return { state: "pending" }; },
  };
}
