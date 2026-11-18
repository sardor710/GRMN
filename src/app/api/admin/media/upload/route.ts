import { handleMediaUpload } from "../../../../../server/content/runtime.ts";

// Task 18A: PUT the file bytes for one signed, expiring upload grant (?grant=).
export const runtime = "nodejs";
export async function PUT(request: Request) {
  return handleMediaUpload(request);
}
