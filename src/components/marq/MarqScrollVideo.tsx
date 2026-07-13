"use client";

import { useEffect, useRef } from "react";
import { PlayIcon } from "@/components/icons";

interface MarqScrollVideoProps {
  src: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
}

/**
 * Sections 3 & 8 — full-viewport video that plays through when scrolled into
 * view (mirrors the site's fixed scroll-play video). Optional centered overlay.
 */
export function MarqScrollVideo({ src, title, subtitle, ctaLabel }: MarqScrollVideoProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(section);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[893px] w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={src}
        muted
        playsInline
        preload="metadata"
      />
      {(title || subtitle) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          {title && (
            <h2 className="marq-display text-[40px] leading-[1.2] text-white/90 md:text-[58px]">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-3 text-[18px] font-medium text-white md:text-[22px]">{subtitle}</p>
          )}
          {ctaLabel && (
            <button
              type="button"
              className="mt-8 inline-flex items-center gap-2 border border-white/80 px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-white hover:text-black"
            >
              {ctaLabel}
              <PlayIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
