import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";

// Task 18A. Authorized, scoped media uploads for editors.
// 1. createUploadGrant (content:write) records a `pending` asset with the declared MIME type, size,
//    SHA-256 and alt text, and returns a signed grant for exactly that asset (default 15 minutes).
// 2. upload(grant, bytes) checks the grant signature and expiry, that it is unused, the exact size,
//    the file's magic bytes against the declared type, and the checksum; then writes the file under
//    an immutable key (never overwritten) and marks the asset `ready`.
// Public files live in <storage>/public and are served by /media/<key>; private files live in
// <storage>/private and are never served by the public route. cleanupOrphanMedia archives uploads
// that never finished, and finished uploads nothing references, after a grace period; archived
// files are kept on disk so they stay recoverable, but are no longer served.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: (bytes: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", magic: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  "image/jpeg": { ext: "jpg", magic: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/gif": { ext: "gif", magic: b => b.length > 6 && Buffer.from(b.subarray(0, 6)).toString("latin1").match(/^GIF8[79]a$/) !== null },
  "image/webp": { ext: "webp", magic: b => b.length > 12 && Buffer.from(b.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(b.subarray(8, 12)).toString("latin1") === "WEBP" },
};
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([mime, type]) => [type.ext, mime]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const grantInput = z.strictObject({
  mimeType: z.enum(Object.keys(TYPES) as [string, ...string[]]),
  byteSize: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  altText: z.string().trim().min(1).max(300),
  visibility: z.enum(["public", "private"]),
});
const altInput = z.strictObject({ mediaId: z.string().regex(UUID), altText: z.string().trim().min(1).max(300) });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

export interface MediaDTO { id: string; status: "pending" | "ready" | "quarantined" | "archived"; mimeType: string | null; byteSize: number | null; altText: string | null; visibility: "public" | "private"; storageKey: string; url: string | null }
interface MediaRow { id: string; storage_namespace: string; storage_key: string; visibility: "public" | "private"; status: MediaDTO["status"]; mime_type: string | null; byte_size: string | null; checksum_sha256: string | null; alt_text: string | null }
const COLUMNS = "id,storage_namespace,storage_key,visibility,status,mime_type,byte_size::text AS byte_size,checksum_sha256,alt_text";
const NAMESPACE = { public: "cms-public", private: "cms-private" } as const;
const folder = (storageDir: string, visibility: "public" | "private") => path.join(/*turbopackIgnore: true*/ storageDir, visibility);
function dto(row: MediaRow): MediaDTO {
  return { id: row.id, status: row.status, mimeType: row.mime_type, byteSize: row.byte_size === null ? null : Number(row.byte_size), altText: row.alt_text, visibility: row.visibility, storageKey: row.storage_key,
    url: row.visibility === "public" && row.status === "ready" ? `/media/${row.storage_key}` : null };
}

interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal>; secret: string; storageDir: string; grantTtlMs?: number }

export function createMediaService({ pool, authorize, secret, storageDir, grantTtlMs = 15 * 60 * 1000 }: Options) {
  const sign = (id: string, expires: number) => createHmac("sha256", secret).update(`media-grant:v1:${id}:${expires}`).digest("hex");
  return {
    async createUploadGrant(headers: Headers, input: unknown): Promise<{ mediaId: string; token: string; uploadUrl: string; expiresAt: string }> {
      const principal = await authorize(headers, "content:write");
      const command = parse(grantInput, input);
      const id = randomUUID(), key = `${id}.${TYPES[command.mimeType].ext}`;
      await pool.query(
        "INSERT INTO media_assets(id,storage_namespace,storage_key,kind,visibility,status,mime_type,byte_size,checksum_sha256,alt_text) VALUES($1,$2,$3,'image',$4,'pending',$5,$6,$7,$8)",
        [id, NAMESPACE[command.visibility as "public" | "private"], key, command.visibility, command.mimeType, command.byteSize, command.checksumSha256, command.altText]);
      await pool.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'media.upload_granted','media',$3,$4,$5)",
        [randomUUID(), principal.userId, id, `media-grant:${id}`, JSON.stringify({ mimeType: command.mimeType, byteSize: command.byteSize, visibility: command.visibility })]);
      const expires = Date.now() + grantTtlMs, token = `${id}.${expires}.${sign(id, expires)}`;
      return { mediaId: id, token, uploadUrl: `/api/admin/media/upload?grant=${encodeURIComponent(token)}`, expiresAt: new Date(expires).toISOString() };
    },

    /** Verifies and stores the bytes for one grant. The grant itself is the authorization. */
    async upload(token: string, bytes: Uint8Array): Promise<MediaDTO> {
      const parts = token.split(".");
      if (parts.length !== 3 || !UUID.test(parts[0]) || !/^\d{1,15}$/.test(parts[1]) || !/^[0-9a-f]{64}$/.test(parts[2])) fail("FORBIDDEN", 403, "Invalid upload grant");
      const [id, expiresText, signature] = parts, expires = Number(expiresText);
      const expected = Buffer.from(sign(id, expires), "hex"), given = Buffer.from(signature, "hex");
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) fail("FORBIDDEN", 403, "Invalid upload grant");
      if (Date.now() > expires) fail("GRANT_EXPIRED", 410, "This upload grant has expired; request a new one");
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query("BEGIN");
        const row = (await client.query<MediaRow>(`SELECT ${COLUMNS} FROM media_assets WHERE id=$1 FOR UPDATE`, [id])).rows[0] ?? fail("FORBIDDEN", 403, "Invalid upload grant");
        if (row.status !== "pending") fail("GRANT_USED", 409, "This upload grant was already used");
        if (bytes.length !== Number(row.byte_size)) invalid();
        if (!TYPES[row.mime_type ?? ""]?.magic(bytes)) fail("MEDIA_CONTENT_MISMATCH", 400, "The file content does not match its declared type");
        if (sha256(bytes) !== row.checksum_sha256) fail("CHECKSUM_MISMATCH", 409, "The file checksum does not match the grant");
        const dir = folder(storageDir, row.visibility), file = path.join(dir, row.storage_key);
        await mkdir(dir, { recursive: true });
        // Immutable keys: never overwrite. A file left by a crash before commit is accepted only if identical.
        try { await writeFile(file, bytes, { flag: "wx" }); }
        catch (error) {
          if ((error as { code?: string }).code !== "EEXIST" || sha256(await readFile(file)) !== row.checksum_sha256) throw error;
        }
        const ready = (await client.query<MediaRow>(`UPDATE media_assets SET status='ready',updated_at=now() WHERE id=$1 RETURNING ${COLUMNS}`, [id])).rows[0];
        await client.query("COMMIT");
        return dto(ready);
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { broken = true; }
        throw error;
      } finally { client.release(broken); }
    },

    async setAltText(headers: Headers, input: unknown): Promise<MediaDTO> {
      const principal = await authorize(headers, "content:write");
      const command = parse(altInput, input);
      const row = (await pool.query<MediaRow>(`UPDATE media_assets SET alt_text=$2,updated_at=now() WHERE id=$1 AND storage_namespace LIKE 'cms-%' RETURNING ${COLUMNS}`, [command.mediaId, command.altText])).rows[0]
        ?? fail("NOT_FOUND", 404, "Not found");
      await pool.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'media.alt_text_changed','media',$3,$4,'{}')",
        [randomUUID(), principal.userId, command.mediaId, `media-alt:${randomUUID()}`]);
      return dto(row);
    },
  };
}
export type MediaService = ReturnType<typeof createMediaService>;

/** A ready public asset's bytes for the /media route, or null (private, pending, archived, unknown). */
export async function readPublicMedia(pool: Pool, storageDir: string, key: string): Promise<{ bytes: Buffer; mimeType: string; checksum: string } | null> {
  if (!PUBLIC_KEY.test(key)) return null;
  const row = (await pool.query<{ mime_type: string; checksum_sha256: string }>(
    "SELECT mime_type,checksum_sha256 FROM media_assets WHERE storage_key=$1 AND storage_namespace='cms-public' AND visibility='public' AND status='ready'", [key])).rows[0];
  if (!row || MIME_BY_EXT[key.split(".")[1]] !== row.mime_type) return null;
  try { return { bytes: await readFile(path.join(folder(storageDir, "public"), key)), mimeType: row.mime_type, checksum: row.checksum_sha256 }; }
  catch { return null; }
}

/**
 * Archives editor uploads past the grace period that either never finished (pending: the partial
 * file is removed) or that nothing references any more (ready: the file is kept for recovery).
 */
export async function cleanupOrphanMedia(pool: Pool, storageDir: string, options: { graceMs?: number; limit?: number } = {}): Promise<{ archived: number }> {
  const graceMs = Math.max(options.graceMs ?? 24 * 60 * 60 * 1000, 0), limit = Math.min(Math.max(Math.trunc(options.limit ?? 200), 1), 1000);
  const pending = (await pool.query<{ id: string; storage_key: string; visibility: "public" | "private" }>(
    `UPDATE media_assets SET status='archived',updated_at=now() WHERE id IN (
       SELECT id FROM media_assets WHERE status='pending' AND storage_namespace LIKE 'cms-%' AND created_at<now()-($1::bigint*interval '1 millisecond') ORDER BY created_at,id LIMIT $2)
     RETURNING id,storage_key,visibility`, [graceMs, limit])).rows;
  for (const row of pending) await unlink(path.join(folder(storageDir, row.visibility), row.storage_key)).catch(() => undefined);
  const unused = (await pool.query<{ id: string }>(
    `UPDATE media_assets SET status='archived',updated_at=now() WHERE id IN (
       SELECT m.id FROM media_assets m WHERE m.status='ready' AND m.storage_namespace LIKE 'cms-%' AND m.updated_at<now()-($1::bigint*interval '1 millisecond')
         AND NOT EXISTS (SELECT 1 FROM product_media x WHERE x.media_id=m.id)
         AND NOT EXISTS (SELECT 1 FROM page_version_media x WHERE x.media_id=m.id)
         AND NOT EXISTS (SELECT 1 FROM export_jobs x WHERE x.result_media_id=m.id)
         AND NOT EXISTS (SELECT 1 FROM migration_runs x WHERE x.archive_media_id=m.id)
         AND NOT EXISTS (SELECT 1 FROM blog_posts x WHERE x.cover_source='/media/'||m.storage_key)
         AND NOT EXISTS (SELECT 1 FROM banners x WHERE x.image_source='/media/'||m.storage_key)
         AND NOT EXISTS (SELECT 1 FROM page_versions x WHERE x.og_image_source='/media/'||m.storage_key OR strpos(x.blocks::text,'/media/'||m.storage_key)>0 OR strpos(x.body,'/media/'||m.storage_key)>0)
         AND NOT EXISTS (SELECT 1 FROM products x WHERE strpos(x.legacy_content::text,'/media/'||m.storage_key)>0)
       ORDER BY m.updated_at,m.id LIMIT $2)
     RETURNING id`, [graceMs, limit])).rows;
  return { archived: pending.length + unused.length };
}
