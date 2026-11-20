import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Task 18B: SQL dashboard summaries (?view=summary) and the low-stock list (?view=low_stock).
// Task 4.1: ?view=status_counts, ?view=recent_orders and ?view=best_sellers (see server/reports/runtime.ts).
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("reports", request);
}
