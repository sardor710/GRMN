import { handlePaymentWebhook } from "../../../../../server/payments/runtime.ts";

// Task 14B: provider webhooks land in the durable inbox. Only the simulated demo provider is
// registered (D03) and it has no webhooks, so this answers 404 until a real provider is added.
export const runtime = "nodejs";
export const POST = handlePaymentWebhook;
