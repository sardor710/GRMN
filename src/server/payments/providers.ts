import "server-only";
import { createDemoProvider } from "./demo.ts";
import { createPaymentProviders, type PaymentProviders } from "./provider.ts";

// Task 14B. The providers this application registers: only the simulated demo adapter (D03).
// Real providers, their webhook secrets and sandbox purchases are in the deferred activation
// backlog; until one is added every webhook path answers 404.
let providers: PaymentProviders | undefined;
export function paymentProviders(): PaymentProviders {
  return providers ??= createPaymentProviders([createDemoProvider()]);
}
