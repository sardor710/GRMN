import { handleAdminAuth } from "../../../../../server/auth/admin-runtime.ts";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleAdminAuth(request, "sign-out");
}
