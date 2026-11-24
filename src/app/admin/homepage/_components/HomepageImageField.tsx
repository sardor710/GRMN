"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Upload, ImageOff } from "lucide-react";
import { Button } from "@/components/admin/ui";
import { ACCEPTED_IMAGE_TYPES, uploadImageFile } from "@/components/admin/product-editor/upload";

const ASPECT = { banner: "aspect-12/5", square: "aspect-square", tile: "aspect-3/2", promo: "aspect-8/7" } as const;

interface HomepageImageFieldProps {
  label: string;
  value: string;
  onChange: (src: string) => void;
  /** Recommended size shown next to the label, e.g. "1920 × 800 px". */
  target: string;
  aspect: keyof typeof ASPECT;
}

/** Owner 2026-11-23: homepage images are uploaded from the PC; a pasted link stays available. */
export function HomepageImageField({ label, value, onChange, target, aspect }: HomepageImageFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const linkId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The modal can close while an upload runs; its result is then dropped.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const src = await uploadImageFile(file, "homepage");
      if (alive.current) onChange(src);
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      if (alive.current) setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="block text-xs font-bold text-neutral-700">{label}</span>
        <span className="text-xs font-bold tabular-nums text-garmin-blue">Target: {target}</span>
      </div>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className={`relative w-full overflow-hidden border border-border bg-neutral-100 sm:w-48 ${ASPECT[aspect]}`}>
          {value ? (
            <Image src={value} alt={`${label} preview`} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageOff className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            data-testid="homepage-image-file"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <Button variant="primary" size="sm" loading={uploading} disabled={uploading} onClick={() => input.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : "Upload from PC"}
          </Button>
          <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or AVIF, up to 10 MB.</p>
          {error && (
            <p role="alert" className="text-xs font-semibold text-garmin-error">
              {error}
            </p>
          )}
          <div>
            <label htmlFor={linkId} className="block text-xs text-muted-foreground">
              or paste a link
            </label>
            <input
              id={linkId}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="mt-1 w-full border border-border px-3 py-1.5 text-xs focus:border-garmin-blue focus:outline-hidden"
              placeholder="/uploads/homepage/… or https://…"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
