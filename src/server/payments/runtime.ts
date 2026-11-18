import "server-only";
import { getDatabase } from "../db/client.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { cmsBackend } from "../cms/source.ts";
import { paymentProviders } from "./providers.ts";
import { createWebhookHandler, handlePaymentReturn } from "./http.ts";
import { enforceRateLimit, trustedClientAddress } from "../operations/rate-limit.ts";

const webhook = createWebhookHandler({ pool: () => getDatabase().pool, providers: paymentProviders });
export async function handlePaymentWebhook(request: Request): Promise<Response> {
  try {
    if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Payments are not available");
    // Task 21A (14B review I7): webhook traffic is limited per trusted sender address before anything is
    // stored. One sender cannot use up another's budget (review I1), so junk cannot crowd out the provider.
    const address = trustedClientAddress(request.headers);
    if (address) await enforceRateLimit(getDatabase().pool, { scope: "payments:webhook", identifier: address, limit: 600, windowMs: 60_000 }, process.env.AUTH_SECRET);
    return await webhook(request);
  } catch (error) { return authErrorResponse(error); }
}
export { handlePaymentReturn };
