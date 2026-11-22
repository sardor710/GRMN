import "server-only";
import type { PaymentProvenance, PaymentProvider } from "./provider.ts";

// Owner decision O07 (Task 21C). The manual adapter: real money (not simulated) in the live
// environment, confirmed by staff (see manual.ts). It opens a local session and nothing else: no
// webhooks, no lookups, and refunds are paid out by staff, so the workers never call it.
const PROVENANCE: PaymentProvenance = Object.freeze({ provider: "manual", environment: "live", merchantAccount: "manual", simulated: false });

export function createManualProvider(): PaymentProvider {
  return {
    name: "manual", environment: "live", merchantAccount: "manual", simulated: false, webhooks: false,
    async startSession(request) { return { sessionId: `manual-session:${request.attemptId}`, redirectUrl: null, provenance: { ...PROVENANCE } }; },
    verifySignature() { return false; },
    parseEvent() { return null; },
    async lookup() { return { state: "pending" }; },
    // Never called by the workers: staff pay manual refunds out by hand (completeRefund in manual.ts).
    async refund() { return { state: "pending", providerRefundId: null }; },
  };
}

