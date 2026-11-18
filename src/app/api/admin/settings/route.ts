import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Legacy mode: the JSON settings store. PostgreSQL mode (Task 18B): typed, versioned settings
// (PUT) and the audited KZT-per-USD rate editor (POST { action: "set_exchange_rate" }).
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("settings", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("settings", request);
}
export async function PUT(request: Request) {
  return handleAdminRequest("settings", request);
}
