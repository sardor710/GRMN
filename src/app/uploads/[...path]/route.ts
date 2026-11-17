import fs from "node:fs";
import { Readable } from "node:stream";
import { contentTypeFor, resolveUploadFile } from "@/lib/media/storage";

export const runtime = "nodejs";

/** Serves files from UPLOAD_DIR. Names are random UUIDs, so responses are immutable. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const file = resolveUploadFile(path);
  if (!file) return new Response("Not found", { status: 404 });

  const stat = fs.statSync(file);
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": contentTypeFor(file),
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
