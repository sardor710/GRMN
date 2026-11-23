import { NextResponse } from "next/server";
import { requireMediaWriter } from "@/lib/cms/admin-guard";
import { MAX_UPLOAD_BYTES, saveImage, sniffImageType } from "@/lib/media/storage";

export const runtime = "nodejs";

const MAX_FILES = 20;
/** Storage folders a client may ask for; anything else falls back to "products". */
const FOLDERS = new Set(["products", "homepage"]);
/** 20 files × 10 MB plus multipart overhead: refuse bigger bodies before parsing them into memory. */
const MAX_REQUEST_BYTES = MAX_FILES * MAX_UPLOAD_BYTES + 1024 * 1024;

/** POST multipart `files` (1–20 images), optional `folder` ("products" | "homepage") → { images: { src }[] }. Staff with catalog:write or content:write. */
export async function POST(request: Request) {
  const denied = await requireMediaWriter(request);
  if (denied) return denied;

  const declared = Number(request.headers.get("content-length") || 0);
  if (!declared || declared > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Upload is too large (max 20 files of 10 MB)" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at once` }, { status: 400 });
  }

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `${file.name} is larger than 10 MB` }, { status: 413 });
    }
  }

  const buffers = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  const bad = files.find((_, i) => !sniffImageType(buffers[i]));
  if (bad) {
    return NextResponse.json({ error: `${bad.name} is not a JPEG, PNG, WebP or AVIF image` }, { status: 400 });
  }

  const requested = form.get("folder");
  const folder = typeof requested === "string" && FOLDERS.has(requested) ? requested : "products";
  const images = [];
  for (const buf of buffers) {
    const { src } = await saveImage(buf, { folder });
    images.push({ src });
  }
  return NextResponse.json({ images });
}
