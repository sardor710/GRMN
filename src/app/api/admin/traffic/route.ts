import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Owner 2026-11-25: Admin ▸ Traffic reports and campaign links (see server/traffic/runtime.ts).
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("traffic", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("traffic", request);
}
