import { handleAdminRequest } from "../../../../../server/auth/admin-runtime.ts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleAdminRequest("products", request);
}
