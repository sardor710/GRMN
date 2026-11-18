import { handlePublicMedia } from "../../../server/content/runtime.ts";

// Task 18A: ready public media by immutable key. Private and unfinished uploads are never served.
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  return handlePublicMedia(key.length === 1 ? key[0] : "");
}
