import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Staff-only legacy-order claim approval (customers:write with MFA admission); returns a single-use receipt.
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleAdminRequest("order-claims", request);
}