import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Task 18A: version history, publish/schedule, unpublish, restore, slug change and homepage
// collections. The content runtime needs content:write; PostgreSQL mode only.
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("content", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("content", request);
}
