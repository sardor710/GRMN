// One image to /api/admin/uploads (the endpoint ProductImagesEditor uses); resolves to the stored src.
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Storage folder on the server; homepage images are kept apart from product photos. */
export type UploadFolder = "products" | "homepage";

export async function uploadImageFile(file: File, folder: UploadFolder = "products"): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG, WebP or AVIF image.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("The image is larger than 10 MB.");
  const form = new FormData();
  form.append("files", file);
  form.append("folder", folder);
  const response = await fetch("/api/admin/uploads", { method: "POST", body: form });
  const body = (await response.json().catch(() => null)) as { images?: { src: string }[]; error?: string } | null;
  if (response.ok && body?.images?.[0]?.src) return body.images[0].src;
  if (response.status === 401) throw new Error("Your admin session expired. Sign in again.");
  throw new Error(body?.error || `Upload failed (HTTP ${response.status}).`);
}
