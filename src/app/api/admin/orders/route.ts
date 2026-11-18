import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("orders", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("orders", request);
}

