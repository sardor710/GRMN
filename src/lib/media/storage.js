// Server-only media storage: uploads live in UPLOAD_DIR (outside public/) and are served by /uploads/[...path].
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;
export const REMOTE_IMAGE_TIMEOUT_MS = 15_000;
export const ALLOWED_IMAGE_HOSTS = ['res.garmin.com'];

const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };
export const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

export function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads'));
}

const ascii = (buf, start, end) => String.fromCharCode(...buf.subarray(start, end));

/** Detect the image type from its first bytes; null for anything else (including SVG). */
export function sniffImageType(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return 'png';
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 12 && ascii(buf, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(buf, 8, 12))) return 'avif';
  return null;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function safeFolder(folder) {
  const parts = String(folder || '').split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => !SAFE_SEGMENT.test(p) || p.includes('..'))) {
    throw new Error(`Unsafe upload folder: ${folder}`);
  }
  return parts;
}

/** Save image bytes under UPLOAD_DIR/<folder>/<yyyy>/<uuid>.<ext>. Rejects non-images. */
export async function saveImage(input, { folder }) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const type = sniffImageType(buf);
  if (!type) throw new Error('Not a supported image (JPEG, PNG, WebP or AVIF)');
  const parts = [...safeFolder(folder), String(new Date().getFullYear())];
  const name = `${randomUUID()}.${EXT[type]}`;
  const dir = path.join(uploadDir(), ...parts);
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await fsp.writeFile(file, buf);
  return { src: `/uploads/${[...parts, name].join('/')}`, file, type };
}

/** Map URL path segments to a file inside UPLOAD_DIR, or null (traversal, missing, not a file). */
export function resolveUploadFile(segments) {
  if (!Array.isArray(segments) || !segments.length) return null;
  const clean = [];
  for (const raw of segments) {
    let seg;
    try {
      seg = decodeURIComponent(String(raw));
    } catch {
      return null;
    }
    if (!SAFE_SEGMENT.test(seg) || seg.includes('..')) return null;
    clean.push(seg);
  }
  const root = uploadDir();
  const candidate = path.resolve(root, ...clean);
  if (!candidate.startsWith(root + path.sep)) return null;
  try {
    const real = fs.realpathSync(candidate);
    const realRoot = fs.realpathSync(root);
    if (!real.startsWith(realRoot + path.sep)) return null;
    return fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

export function contentTypeFor(file) {
  return CONTENT_TYPES[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
}

function allowedImageUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  if (!ALLOWED_IMAGE_HOSTS.includes(url.hostname)) return null;
  return url;
}

/** Download a Garmin-hosted image into UPLOAD_DIR. `cache` (Map url → result) de-duplicates within one import. */
export async function downloadRemoteImage(raw, { folder, cache } = {}) {
  const url = allowedImageUrl(raw);
  if (!url) return { error: `Blocked image URL: ${raw}` };
  if (cache?.has(url.href)) return cache.get(url.href);
  const result = await (async () => {
    try {
      const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS) });
      if (!res.ok || !res.body) return { error: `Image HTTP ${res.status}: ${url.href}` };
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > MAX_REMOTE_IMAGE_BYTES) return { error: `Image too large: ${url.href}` };
        chunks.push(chunk);
      }
      const saved = await saveImage(Buffer.concat(chunks), { folder });
      return { src: saved.src, bytes: size };
    } catch (err) {
      return { error: `Image download failed (${err instanceof Error ? err.message : 'error'}): ${url.href}` };
    }
  })();
  cache?.set(url.href, result);
  return result;
}
