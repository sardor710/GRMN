import { handleAdminRequest } from "../../../../server/auth/admin-runtime.ts";

// Staff job queue (Task 12B): GET returns job-lag metrics and open dead letters (?kind= filters);
// POST { jobId, reason } replays one dead letter with an audit record. Needs settings:write with
// fresh MFA. PostgreSQL mode only.
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAdminRequest("operations", request);
}
export async function POST(request: Request) {
  return handleAdminRequest("operations", request);
}
