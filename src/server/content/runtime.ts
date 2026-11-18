import "server-only";
import path from "node:path";
import { getDatabase } from "../db/client.ts";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import type { Permission } from "../context.ts";
import { cmsBackend } from "../cms/source.ts";
import { createPublishingService } from "./publishing.ts";
import { createMediaService, MAX_IMAGE_BYTES, readPublicMedia } from "./media.ts";

// Task 18A routes, PostgreSQL mode only:
// /api/admin/content  GET ?pageId= (version history) | POST { action: publish | unpublish | restore |
//                     change_slug | save_collection | publish_collection, ... }      (content:write)
// /api/admin/media    POST upload grant | PATCH { mediaId, altText }                 (content:write)
// /api/admin/media/upload?grant=  PUT the file bytes (the signed grant is the authorization)
// /media/<key>        GET a ready public asset (private assets are never served here)

const bad = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid or unknown fields"); };
// Storage lives outside the build: the ignore comments keep Next from tracing the whole project.
export const mediaStorageDir = () => process.env.MEDIA_STORAGE_DIR
  ? path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_STORAGE_DIR)
  : path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "media");
function ready() {
  if (cmsBackend() !== "postgres") throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Content services are not available");
  const runtime = getAuthRuntime(), secret = process.env.AUTH_SECRET ?? "";
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Content services are not available");
  const authorize = async (headers: Headers, permission: Permission) => { await requireStaffPrincipal(runtime, headers); return requirePermission(runtime, headers, permission); };
  const pool = getDatabase().pool;
  return { publishing: createPublishingService({ pool, authorize }), media: createMediaService({ pool, authorize, secret, storageDir: mediaStorageDir() }), baseURL: new URL(process.env.AUTH_BASE_URL!).origin };
}
function sameOrigin(request: Request, baseURL: string) {
  const url = new URL(request.url);
  if (url.origin !== baseURL) bad();
  if (request.method !== "GET" && request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
  return url;
}

export async function handleContentRequest(request: Request): Promise<Response> {
  try {
    const { publishing, baseURL } = ready(), url = sameOrigin(request, baseURL);
    const params = [...url.searchParams];
    if (request.method === "GET") {
      if (params.length !== 1 || params[0][0] !== "pageId") bad();
      return adminJSON(await publishing.versions(request.headers, params[0][1]));
    }
    if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
    if (params.length) bad();
    const body = await readAdminJSON(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad();
    const { action, ...rest } = body as Record<string, unknown>;
    switch (action) {
      case "publish": return adminJSON(await publishing.publish(request.headers, rest));
      case "unpublish": return adminJSON(await publishing.unpublish(request.headers, rest));
      case "restore": return adminJSON(await publishing.restore(request.headers, rest));
      case "change_slug": return adminJSON(await publishing.changeSlug(request.headers, rest));
      case "save_collection": return adminJSON(await publishing.saveCollection(request.headers, rest));
      case "publish_collection": return adminJSON(await publishing.publishCollection(request.headers, rest));
      default: return bad();
    }
  } catch (error) { return authErrorResponse(error); }
}

export async function handleMediaRequest(request: Request): Promise<Response> {
  try {
    const { media, baseURL } = ready(), url = sameOrigin(request, baseURL);
    if ([...url.searchParams].length) bad();
    if (request.method === "POST") return adminJSON(await media.createUploadGrant(request.headers, await readAdminJSON(request)));
    if (request.method === "PATCH") return adminJSON(await media.setAltText(request.headers, await readAdminJSON(request)));
    throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
  } catch (error) { return authErrorResponse(error); }
}

export async function handleMediaUpload(request: Request): Promise<Response> {
  try {
    const { media, baseURL } = ready(), url = sameOrigin(request, baseURL);
    if (request.method !== "PUT") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
    const params = [...url.searchParams];
    if (params.length !== 1 || params[0][0] !== "grant") bad();
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_IMAGE_BYTES)) { await request.body?.cancel().catch(() => {}); throw new AuthFailure("INVALID_INPUT", 413, "The file is too large"); }
    const reader = request.body?.getReader();
    if (!reader) return bad();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_IMAGE_BYTES) { await reader.cancel().catch(() => {}); throw new AuthFailure("INVALID_INPUT", 413, "The file is too large"); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    return adminJSON(await media.upload(params[0][1], Buffer.concat(chunks)));
  } catch (error) { return authErrorResponse(error); }
}

export async function handlePublicMedia(key: string): Promise<Response> {
  try {
    if (cmsBackend() !== "postgres") return new Response("Not found", { status: 404 });
    const found = await readPublicMedia(getDatabase().pool, mediaStorageDir(), key);
    if (!found) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(found.bytes), { headers: {
      "Content-Type": found.mimeType, "Content-Length": String(found.bytes.length), "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${found.checksum}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return new Response("Unavailable", { status: 503 }); }
}
