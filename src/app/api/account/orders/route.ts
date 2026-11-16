import { AuthFailure } from "../../../../server/auth/config.ts";
import { authErrorResponse } from "../../../../server/auth/http.ts";
export const runtime = "nodejs";
// Ownership and historical order claims are deliberately unavailable until10.
// Typed contact details can never select or claim another customer's records.
export async function GET() {
  return authErrorResponse(new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Account orders are not available yet"));
}
