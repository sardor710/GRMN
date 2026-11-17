import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Task 18B: SQL dashboard summaries (?view=summary) and the low-stock list (?view=low_stock).
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("reports", request);
}
