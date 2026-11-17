import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Staff inventory: GET ?variantId= (catalog:read) or ?view=reconciliation (inventory:write);
// POST records an audited stock adjustment (inventory:write). PostgreSQL mode only.
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("inventory", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("inventory", request);
}
