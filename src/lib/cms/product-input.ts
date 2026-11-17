import * as js from "./product-input.js";

export function isAllowedImageSrc(src: string): boolean {
  return js.isAllowedImageSrc(src);
}

export function sanitizeProductInput<T extends Record<string, unknown>>(
  body: T,
): { ok: true; product: T } | { ok: false; error: string } {
  return js.sanitizeProductInput(body) as { ok: true; product: T } | { ok: false; error: string };
}
