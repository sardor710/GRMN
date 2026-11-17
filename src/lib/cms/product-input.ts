import * as js from "./product-input.js";

export function isAllowedImageSrc(src: string): boolean {
  return js.isAllowedImageSrc(src);
}

/** `existing` is the stored product; ru/kk overlays absent from `body.translations` are kept from it. */
export function sanitizeProductInput<T extends Record<string, unknown>>(
  body: T,
  existing?: { translations?: unknown },
): { ok: true; product: T } | { ok: false; error: string } {
  return js.sanitizeProductInput(body, existing) as { ok: true; product: T } | { ok: false; error: string };
}
