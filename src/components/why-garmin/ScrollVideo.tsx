"use client";

import { useEffect, useRef } from "react";

interface ScrollVideoProps {
  id: string;
  src: string;
  className?: string;
  /** Autoplay immediately regardless of scroll position (used inside sliders) */
  autoPlay?: boolean;
}

/**
 * Video that starts playing when it scrolls into view, mirroring the original
 * `.scroll-play` ScrollTrigger behavior (start: "top 75%"). Muted + playsInline
 * so browsers allow programmatic playback.
 */
export function ScrollVideo({ id, src, className, autoPlay }: ScrollVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (autoPlay) {
      video.play().catch(() => {});
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          }
        });
      },
      { rootMargin: "0px 0px -25% 0px" },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [autoPlay]);

  return (
    <video id={id} className={className} playsInline muted ref={ref}>
      <source src={src} type="video/mp4" />
    </video>
  );
}
