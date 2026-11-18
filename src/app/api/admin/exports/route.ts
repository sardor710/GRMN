import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Task 18B: private, expiring CSV exports (exports:create). GET lists your exports or downloads one
// (?id=); POST requests a new one.
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("exports", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("exports", request);
}
