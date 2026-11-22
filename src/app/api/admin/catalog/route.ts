import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// /api/admin/catalog itself has no resource; the guarded handler answers 404 (or 501 on the legacy backend).
// The resources live under /api/admin/catalog/* ([...path]/route.ts).
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("catalog", request);
}
