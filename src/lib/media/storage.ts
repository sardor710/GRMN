import * as js from "./storage.js";

export type ImageType = "jpeg" | "png" | "webp" | "avif";

export const MAX_UPLOAD_BYTES: number = js.MAX_UPLOAD_BYTES;

export function uploadDir(): string {
  return js.uploadDir();
}

export function sniffImageType(buf: Uint8Array): ImageType | null {
  return js.sniffImageType(buf) as ImageType | null;
}

export function saveImage(buf: Uint8Array, opts: { folder: string }): Promise<{ src: string; file: string; type: ImageType }> {
  return js.saveImage(buf, opts) as Promise<{ src: string; file: string; type: ImageType }>;
}

export function resolveUploadFile(segments: string[]): string | null {
  return js.resolveUploadFile(segments);
}

export function contentTypeFor(file: string): string {
  return js.contentTypeFor(file);
}

export type DownloadResult = { src: string; bytes: number } | { error: string };

export function downloadRemoteImage(
  url: string,
  opts: { folder: string; cache?: Map<string, DownloadResult> },
): Promise<DownloadResult> {
  return js.downloadRemoteImage(url, opts) as Promise<DownloadResult>;
}
