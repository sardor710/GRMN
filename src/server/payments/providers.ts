import "server-only";
import { createDemoProvider } from "./demo.ts";
import { createSandboxProvider, demoPurchasesGate } from "./sandbox.ts";
import { createPaymentProviders, type PaymentProvider, type PaymentProviders } from "./provider.ts";

// Task 14B. The providers this application registers: the simulated demo adapter (D03) and, when
// demo purchases are enabled (D03a: DEMO_PURCHASES=1; refused with NODE_ENV=production unless
// DEMO_PURCHASES_ALLOW_PRODUCTION=1, and refused next to a live provider), the sandbox auto-capture
// adapter. Real providers, their webhook secrets and live purchases are in the deferred activation
// backlog; until one is added every webhook path answers 404.

/** The adapters for an environment. Exported for tests; the application uses paymentProviders(). */
export function configuredPaymentProviders(env: Readonly<Record<string, string | undefined>>): PaymentProvider[] {
  const list: PaymentProvider[] = [createDemoProvider()];
  const gate = demoPurchasesGate(env, list);
  if (gate.enabled) list.push(createSandboxProvider());
  else if (gate.reason !== "disabled")
    console.warn(`[payments] DEMO_PURCHASES=1 is ignored: ${gate.reason === "production" ? "NODE_ENV=production without DEMO_PURCHASES_ALLOW_PRODUCTION=1" : "a live payment provider is configured"}`);
  return list;
}

let providers: PaymentProviders | undefined;
export function paymentProviders(): PaymentProviders {
  return providers ??= createPaymentProviders(configuredPaymentProviders(process.env));
}
