import { handleAdminMe } from "../../../../../server/auth/admin-runtime.ts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminMe(request);
}
