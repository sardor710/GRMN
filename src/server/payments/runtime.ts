import "server-only";
import { getDatabase } from "../db/client.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { cmsBackend } from "../cms/source.ts";
import { paymentProviders } from "./providers.ts";
import { createWebhookHandler, handlePaymentReturn } from "./http.ts";

const webhook = createWebhookHandler({ pool: () => getDatabase().pool, providers: paymentProviders });
export async function handlePaymentWebhook(request: Request): Promise<Response> {
  try {
    if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Payments are not available");
    return await webhook(request);
  } catch (error) { return authErrorResponse(error); }
}
export { handlePaymentReturn };
