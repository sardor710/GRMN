import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Task 18A: POST creates a scoped upload grant; PATCH edits alt text. Needs content:write.
// The file bytes go to ./upload with the signed grant.
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleAdminRequest("media", request);
}
export async function PATCH(request: Request) {
  return handleAdminRequest("media", request);
}
