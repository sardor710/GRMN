"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Square product thumbnail for admin lists; a missing or broken image shows a quiet placeholder. */
export function Thumb({ src, size = "md" }: { src: string | null | undefined; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState<string | null>(null);
  const usable = src && failed !== src ? src : null;
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden border border-[#e5e5e5] bg-white", size === "md" ? "h-12 w-12" : "h-9 w-9")}>
      {usable ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails from uploads or garmin.com
        <img src={usable} alt="" loading="lazy" onError={() => setFailed(usable)} className="h-full w-full object-contain p-0.5" />
      ) : (
        <Package className="h-4 w-4 text-[#bfbfbf]" aria-hidden="true" />
      )}
    </span>
  );
}
