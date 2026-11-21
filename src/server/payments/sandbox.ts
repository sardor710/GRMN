import "server-only";
import { AuthFailure } from "../auth/config.ts";
import type { PaymentEvent, PaymentProvenance, PaymentProvider } from "./provider.ts";

// M7 (decision D03a, owner request 2026-11-21). Demo purchases: an honestly named sandbox adapter
// that captures every attempt at once, without any merchant or network call. Its facts go through
// the normal capture path in the `sandbox` environment (orders.payment_mode 'sandbox', migration
// 0015), so orders become paid, stock and coupons are consumed, and reports count them as a
// separate "Demo (sandbox)" series, never as live money. It has no webhooks. Its lookup reports the
// capture, so worker reconciliation also completes an attempt whose immediate capture was cut off.
// The `demo` adapter (D03) is unchanged and still never captures.

export const SANDBOX_MERCHANT = "sandbox-demo";
const PROVENANCE: PaymentProvenance = Object.freeze({ provider: "sandbox", environment: "sandbox", merchantAccount: SANDBOX_MERCHANT, simulated: false });

type Env = Readonly<Record<string, string | undefined>>;
export type DemoPurchasesGate =
  | { enabled: true; production: boolean }
  | { enabled: false; reason: "disabled" | "production" | "live_provider" };

/**
 * Whether demo purchases may run: only with DEMO_PURCHASES=1, never with NODE_ENV=production unless
 * DEMO_PURCHASES_ALLOW_PRODUCTION=1, and never next to a live payment provider.
 */
export function demoPurchasesGate(env: Env, otherProviders: readonly Pick<PaymentProvider, "environment">[] = []): DemoPurchasesGate {
  if (env.DEMO_PURCHASES !== "1") return { enabled: false, reason: "disabled" };
  const production = env.NODE_ENV === "production";
  if (production && env.DEMO_PURCHASES_ALLOW_PRODUCTION !== "1") return { enabled: false, reason: "production" };
  if (otherProviders.some(provider => provider.environment === "live")) return { enabled: false, reason: "live_provider" };
  return { enabled: true, production };
}

/**
 * M9.3: under NODE_ENV=production (the DEMO_PURCHASES_ALLOW_PRODUCTION override) a demo purchase still
 * consumes real stock and coupons and the order ships like a live one, so only a signed-in staff principal
 * may place one there (staffOnly). Guests and customers get 403 DEMO_PURCHASE_STAFF_ONLY before anything
 * is written. Outside production the adapter stays open to every shopper (the owner's local demo buying).
 */
export function assertDemoPurchaseActor(provider: Pick<PaymentProvider, "staffOnly">, actor: { userId: string | null; staff?: boolean }): void {
  if (provider.staffOnly && !(actor.userId && actor.staff === true))
    throw new AuthFailure("DEMO_PURCHASE_STAFF_ONLY", 403, "Demo purchases on this production store are limited to signed-in staff. No order was placed and nothing was charged.");
}

export function createSandboxProvider(options: { staffOnly?: boolean } = {}): PaymentProvider {
  return {
    name: "sandbox", environment: "sandbox", merchantAccount: SANDBOX_MERCHANT, simulated: false, webhooks: false, staffOnly: options.staffOnly === true,
    async startSession(request) { return { sessionId: `sandbox-session:${request.attemptId}`, redirectUrl: null, provenance: { ...PROVENANCE } }; },
    verifySignature() { return false; },
    parseEvent() { return null; },
    // Every session this adapter opened is captured. The ids are stable per attempt, so a repeated
    // lookup reports the same fact and the capture is recorded once (payment_transactions dedupe).
    async lookup(request) {
      if (!request.sessionId) return { state: "pending" };
      const event: PaymentEvent = {
        eventId: `sandbox-capture:${request.attemptId}`, kind: "captured", merchantAccount: SANDBOX_MERCHANT, environment: "sandbox",
        merchantReference: request.merchantReference, sessionId: request.sessionId, transactionId: `sandbox-txn:${request.attemptId}`,
        amountMinor: request.amountMinor, currency: "KZT", occurredAt: new Date().toISOString(),
      };
      return { state: "event", event };
    },
    // No money was taken, so refunding a sandbox capture always succeeds (staff can test the aftersales flow).
    async refund(request) { return { state: "succeeded", providerRefundId: `sandbox-refund:${request.refundId}` }; },
  };
}
