"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Loader2, Star, Trash2, UploadCloud, X } from "lucide-react";
import type { ProductImage } from "@/lib/cms/types";
import { inputClass, labelClass, linkButtonClass, newId, secondaryButtonClass } from "./shared";

interface ProductImagesEditorProps {
  images: ProductImage[];
  defaultImageId: string;
  onChange: (images: ProductImage[], defaultImageId: string) => void;
}

interface PendingUpload {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;
const COLLAPSED_COUNT = 30;

const altFromFileName = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();

/** Upload one file to /api/admin/uploads with progress; resolves to the stored src. */
function uploadFile(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.onload = () => {
      const body = xhr.response as { images?: { src: string }[]; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.images?.[0]?.src) resolve(body.images[0].src);
      else if (xhr.status === 401) reject(new Error("Your admin session expired — sign in again"));
      else reject(new Error(body?.error || `Upload failed (HTTP ${xhr.status})`));
    };
    const form = new FormData();
    form.append("files", file);
    xhr.send(form);
  });
}

export function ProductImagesEditor({ images, defaultImageId, onChange }: ProductImagesEditorProps) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Uploads finish asynchronously; keep the latest props so concurrent completions never overwrite each other.
  const latest = useRef({ images, defaultImageId });
  useEffect(() => {
    latest.current = { images, defaultImageId };
  }, [images, defaultImageId]);

  const commit = (next: ProductImage[], nextDefault?: string) => {
    let def = nextDefault ?? latest.current.defaultImageId;
    if (!next.some((i) => i.id === def)) def = next[0]?.id ?? "";
    latest.current = { images: next, defaultImageId: def };
    onChange(next, def);
  };

  const patchPending = (key: string, patch: Partial<PendingUpload>) =>
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const queue: { file: File; key: string }[] = [];
    const entries: PendingUpload[] = files.map((file) => {
      const key = newId("up");
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return { key, name: file.name, progress: 0, error: "Not a JPEG, PNG, WebP or AVIF image" };
      }
      if (file.size > MAX_BYTES) return { key, name: file.name, progress: 0, error: "Larger than 10 MB" };
      queue.push({ file, key });
      return { key, name: file.name, progress: 0 };
    });
    setPending((list) => [...list, ...entries]);

    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const { file, key } = queue[cursor++];
        try {
          const src = await uploadFile(file, (pct) => patchPending(key, { progress: pct }));
          const image: ProductImage = { id: newId("img"), src, alt: altFromFileName(file.name), source: "upload" };
          commit([...latest.current.images, image]);
          setPending((list) => list.filter((p) => p.key !== key));
        } catch (err) {
          patchPending(key, { error: err instanceof Error ? err.message : "Upload failed" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker));
  };

  const addByUrl = () => {
    const src = urlDraft.trim();
    if (!src) return;
    commit([...images, { id: newId("img"), src, alt: "", source: "url" }]);
    setUrlDraft("");
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  };

  const remove = (id: string) => commit(images.filter((i) => i.id !== id));
  const setAlt = (id: string, alt: string) => commit(images.map((i) => (i.id === id ? { ...i, alt } : i)));

  const visible = showAll ? images : images.slice(0, COLLAPSED_COUNT);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={labelClass}>Product Photos ({images.length})</span>
        <span className="text-xs text-muted-foreground">
          Drag to reorder · <Star className="inline h-3 w-3 fill-garmin-badge-gold text-black" /> marks the default photo
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setIsDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 border border-dashed px-4 py-6 text-center transition-colors rounded-none ${
          isDragOver ? "border-garmin-blue bg-muted" : "border-border bg-neutral-50"
        }`}
      >
        <UploadCloud className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <p className="text-[13px] text-neutral-700">
          Drop photos here or{" "}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="font-semibold text-garmin-blue underline">
            choose files from your computer
          </button>
        </p>
        <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or AVIF · up to 10 MB each · several at once</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          aria-label="Upload product photos"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Upload progress / errors */}
      {pending.length > 0 && (
        <ul className="space-y-1" aria-live="polite">
          {pending.map((p) => (
            <li
              key={p.key}
              className={`flex items-center gap-2 border px-2.5 py-1.5 text-xs rounded-none ${
                p.error ? "border-garmin-error bg-white text-garmin-error" : "border-border bg-white text-neutral-700"
              }`}
            >
              {!p.error && <Loader2 className="h-3.5 w-3.5 animate-spin text-garmin-blue" aria-hidden="true" />}
              <span className="truncate tabular-nums">{p.name}</span>
              {p.error ? (
                <span className="ml-auto shrink-0">{p.error}</span>
              ) : (
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <progress value={p.progress} max={100} aria-label={`Uploading ${p.name}`} className="h-1.5 w-24 accent-garmin-blue" />
                  <span className="w-8 text-right tabular-nums">{p.progress}%</span>
                </span>
              )}
              {p.error && (
                <button
                  type="button"
                  aria-label={`Dismiss error for ${p.name}`}
                  onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}
                  className="p-0.5 hover:text-black"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add by URL */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addByUrl();
              }
            }}
            placeholder="…or paste an image URL / path (e.g. /images/products/1228429.jpg)"
            aria-label="Image URL"
            className={`${inputClass} pl-8 tabular-nums`}
          />
        </div>
        <button type="button" onClick={addByUrl} className={secondaryButtonClass} disabled={!urlDraft.trim()}>
          <ImagePlus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {/* Gallery */}
      {images.length === 0 ? (
        <p className="border border-border bg-white p-4 text-center text-xs text-muted-foreground">
          No photos yet. The first photo you add becomes the default.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {visible.map((img, idx) => {
            const isDefault = img.id === defaultImageId;
            return (
              <li
                key={img.id}
                draggable
                onDragStart={(e) => {
                  setDragIndex(idx);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  move(dragIndex, idx);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`group flex flex-col border bg-white rounded-none ${
                  isDefault ? "border-black ring-1 ring-black" : "border-neutral-200"
                } ${dragIndex === idx ? "opacity-40" : ""}`}
              >
                <div className="relative aspect-square cursor-grab bg-neutral-50 active:cursor-grabbing">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of arbitrary upload/remote paths */}
                  <img src={img.src} alt={img.alt} loading="lazy" className="h-full w-full object-contain p-1.5" />
                  <span className="absolute left-1 top-1 bg-white/90 px-1 tabular-nums text-xs text-muted-foreground">{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => commit(images, img.id)}
                    aria-label={isDefault ? "Default photo" : "Make default photo"}
                    aria-pressed={isDefault}
                    title={isDefault ? "Default photo" : "Make default photo"}
                    className="absolute right-1 top-1 bg-white/90 p-1 hover:bg-white"
                  >
                    <Star className={`h-4 w-4 ${isDefault ? "fill-garmin-badge-gold text-black" : "text-neutral-400"}`} />
                  </button>
                </div>
                <div className="space-y-1 border-t border-neutral-100 p-1.5">
                  <input
                    type="text"
                    value={img.alt}
                    onChange={(e) => setAlt(img.id, e.target.value)}
                    placeholder="Alt text"
                    aria-label={`Alt text for photo ${idx + 1}`}
                    className="h-7 w-full border border-border px-1.5 text-xs focus:border-black focus:outline-none rounded-none"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => move(idx, idx - 1)}
                        disabled={idx === 0}
                        aria-label="Move photo left"
                        className="p-1 text-muted-foreground hover:text-black disabled:opacity-30"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, idx + 1)}
                        disabled={idx === images.length - 1}
                        aria-label="Move photo right"
                        className="p-1 text-muted-foreground hover:text-black disabled:opacity-30"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(img.id)}
                      aria-label={`Remove photo ${idx + 1}`}
                      className="p-1 text-muted-foreground hover:text-garmin-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {images.length > COLLAPSED_COUNT && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className={linkButtonClass}>
          {showAll ? "Show fewer photos" : `Show all ${images.length} photos`}
        </button>
      )}
    </div>
  );
}
