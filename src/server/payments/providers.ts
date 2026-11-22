import "server-only";
import { createDemoProvider } from "./demo.ts";
import { createManualProvider } from "./manual-provider.ts";
import { createSandboxProvider, demoPurchasesGate } from "./sandbox.ts";
import { createPaymentProviders, type PaymentProvider, type PaymentProviders } from "./provider.ts";

// Task 14B, O07, D03a. The providers this application registers:
// - demo: simulated; checkout offers it while the "Demo checkout" setting is on (Task 3.1) and demo purchases are not enabled;
// - manual: real money that staff confirm by hand (Task 21C), offered while "Demo checkout" is off. It takes no webhooks;
// - sandbox: the auto-capture adapter for demo purchases, only when they are enabled (D03a: DEMO_PURCHASES=1;
//   refused with NODE_ENV=production unless DEMO_PURCHASES_ALLOW_PRODUCTION=1, and refused next to a live
//   provider). While registered it replaces demo as the "Demo checkout" method.
// Real online providers, their webhook secrets and live purchases are in the deferred activation
// backlog; until one is added every webhook path answers 404.

/** The adapters for an environment. Exported for tests; the application uses paymentProviders(). */
export function configuredPaymentProviders(env: Readonly<Record<string, string | undefined>>): PaymentProvider[] {
  const list: PaymentProvider[] = [createDemoProvider(), createManualProvider()];
  // The manual adapter is environment 'live' but takes no automated money, so it does not block demo purchases.
  const gate = demoPurchasesGate(env, list.filter(provider => provider.name !== "manual"));
  // Under the production override only signed-in staff may demo-buy (M9.3): real stock and coupons are consumed.
  if (gate.enabled) list.push(createSandboxProvider({ staffOnly: gate.production }));
  else if (gate.reason !== "disabled")
    console.warn(`[payments] DEMO_PURCHASES=1 is ignored: ${gate.reason === "production" ? "NODE_ENV=production without DEMO_PURCHASES_ALLOW_PRODUCTION=1" : "a live payment provider is configured"}`);
  return list;
}

let providers: PaymentProviders | undefined;
export function paymentProviders(): PaymentProviders {
  return providers ??= createPaymentProviders(configuredPaymentProviders(process.env));
}
