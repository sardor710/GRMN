import "server-only";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { MEDIA_NAMESPACE } from "./variant-sync.ts";

// Verified file metadata for catalog images, as syncProductVariants needs it before an image becomes a
// `ready` public media asset. Same-site paths resolve to /uploads/* → UPLOAD_DIR (default storage/uploads)
// or anything else → public/. Remote URLs (e.g. garmin.com CDN images that were not downloaded) have no
// file and stay out of product_media; the editor still keeps them in its image list.
// A path already registered as a ready asset reuses the stored metadata, so re-saving a product with
// hundreds of photos does not re-read and re-hash every file.

export interface ImageFile { byteSize: number; checksumSha256: string; mimeType: string }

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif" };
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function uploadRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "uploads"));
}

/** The local file behind a same-site image path, or null (remote, traversal, unknown type). */
export function localImagePath(src: string): { file: string; mimeType: string } | null {
  const clean = src.split(/[?#]/)[0];
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.includes("\\") || clean.split("/").includes("..")) return null;
  const uploads = clean.startsWith("/uploads/");
  const base = uploads ? uploadRoot() : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
  let parts: string[];
  // A malformed percent-escape (e.g. /uploads/%E0.jpg) names no file: same as any other unusable path.
  try { parts = (uploads ? clean.slice("/uploads/".length) : clean.slice(1)).split("/").map(part => decodeURIComponent(part)); } catch { return null; }
  const file = path.resolve(base, ...parts);
  const mimeType = MIME[path.extname(file).toLowerCase()];
  if (!mimeType || !file.startsWith(base + path.sep)) return null;
  return { file, mimeType };
}

export async function resolveImageFiles(client: Pick<PoolClient, "query">, sources: readonly string[]): Promise<Map<string, ImageFile | null>> {
  const unique = [...new Set(sources)], result = new Map<string, ImageFile | null>();
  if (!unique.length) return result;
  const known = (await client.query<{ storage_key: string; byte_size: string; checksum_sha256: string; mime_type: string }>(
    "SELECT storage_key,byte_size::text AS byte_size,checksum_sha256,mime_type FROM media_assets WHERE storage_namespace=$1 AND storage_key=ANY($2::text[]) AND status='ready'",
    [MEDIA_NAMESPACE, unique])).rows;
  for (const row of known) result.set(row.storage_key, { byteSize: Number(row.byte_size), checksumSha256: row.checksum_sha256, mimeType: row.mime_type });
  for (const src of unique) {
    if (result.has(src)) continue;
    const local = localImagePath(src);
    if (!local) { result.set(src, null); continue; }
    try {
      const info = await stat(local.file);
      if (!info.isFile() || info.size > MAX_IMAGE_BYTES) { result.set(src, null); continue; }
      const bytes = await readFile(local.file);
      result.set(src, { byteSize: bytes.length, checksumSha256: createHash("sha256").update(bytes).digest("hex"), mimeType: local.mimeType });
    } catch { result.set(src, null); }
  }
  return result;
}
