import "server-only";
import { createDemoProvider } from "./demo.ts";
import { createManualProvider } from "./manual-provider.ts";
import { createPaymentProviders, type PaymentProviders } from "./provider.ts";

// The providers this application registers (Task 14B, O07):
// - demo: simulated, for tests and development only; production checkout refuses it;
// - manual: real money that staff confirm by hand (Task 21C). It takes no webhooks.
// Real online providers, their webhook secrets and sandbox purchases are in the deferred activation
// backlog; until one is added every webhook path answers 404.
let providers: PaymentProviders | undefined;
export function paymentProviders(): PaymentProviders {
  return providers ??= createPaymentProviders([createDemoProvider(), createManualProvider()]);
}
