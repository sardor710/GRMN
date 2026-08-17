"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";

/**
 * Merged Cinematic Scene: Flame Eruption -> Damascus MARQ Adventurer Watch Reveal
 * 
 * 1. While scrolling, the flame video plays and erupts.
 * 2. At the peak of the flame in the center, the Damascus Steel MARQ Adventurer watch
 *    smoothly fades into the middle of the flame on its glowing pedestal.
 * 3. Sparks overlay the watch and the titles flank on left and right.
 * 4. Continues smoothly down into the next section.
 */
export function MarqFireDamascusMerged() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Scroll progress from 0.0 (top entered) to 1.0 (bottom reached)
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!containerRef.current) return;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const windowHeight = window.innerHeight;
          const totalScrollDistance = rect.height - windowHeight;

          // How far down has the top of container scrolled past the top of the viewport
          const currentScroll = -rect.top;
          const rawProgress = currentScroll / totalScrollDistance;
          const clamped = Math.max(0, Math.min(1, rawProgress));
          setProgress(clamped);

          // Scrub the fire video based on the first 65% of scroll progress
          if (videoRef.current && videoRef.current.duration) {
            const videoProgress = Math.min(1, clamped / 0.65);
            videoRef.current.currentTime = videoRef.current.duration * videoProgress;
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    // Prepare video
    const video = videoRef.current;
    if (video) {
      video.playsInline = true;
      video.muted = true;
      video.preload = "auto";
      video.pause();
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Compute opacity & transforms based on scroll progress:
  // Phase 1 (0.00 -> 0.35): Flame alone erupts, watch opacity 0
  // Phase 2 (0.35 -> 0.70): Watch emerges from the fire center, fading 0 -> 1 with scale 0.94 -> 1.0
  // Phase 3 (0.70 -> 1.00): Fully visible watch, sparks and flanking titles
  const watchOpacity = Math.max(0, Math.min(1, (progress - 0.30) / 0.35));
  const watchScale = 0.94 + 0.06 * watchOpacity;

  // Flame video stays full opacity until watch arrives, then stays glowing behind watch
  const flameOpacity = progress < 0.4 ? 1 : Math.max(0.35, 1 - (progress - 0.4) * 1.2);

  // Text titles fade in alongside the watch
  const textOpacity = Math.max(0, Math.min(1, (progress - 0.45) / 0.30));
  const textTranslateLeft = (1 - textOpacity) * -24;
  const textTranslateRight = (1 - textOpacity) * 24;

  return (
    <section
      ref={containerRef}
      className="relative h-[230vh] w-full bg-black"
    >
      {/* Sticky viewport viewport anchor */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black flex items-center justify-center">
        {/* 1. Fire Video Background Layer */}
        <div
          className="absolute inset-0 h-full w-full transition-opacity duration-150 ease-out"
          style={{ opacity: flameOpacity }}
        >
          <video
            ref={videoRef}
            src="/marq/video/fire.mp4"
            muted
            playsInline
            preload="auto"
            className="h-full w-full object-cover"
          />
          {/* Subtle vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black pointer-events-none opacity-60" />
        </div>

        {/* 2. Damascus Steel Watch & Pedestal Image Layer */}
        <div
          className="absolute inset-0 h-full w-full bg-cover bg-center transition-all duration-200 ease-out"
          style={{
            backgroundImage: "url(/marq/images/damascus-bg.jpg)",
            opacity: watchOpacity,
            transform: `scale(${watchScale})`,
          }}
        />

        {/* 3. Glowing Sparks & Embers Overlays */}
        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-cover bg-center opacity-85 mix-blend-screen transition-opacity duration-300"
          style={{
            backgroundImage: "url(/marq/images/damascus-bg-spark.png)",
            opacity: Math.min(1, watchOpacity * 1.2),
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-cover bg-center opacity-75 mix-blend-screen transition-opacity duration-300"
          style={{
            backgroundImage: "url(/marq/images/damascus-bg-spark-2.png)",
            opacity: Math.min(1, watchOpacity * 1.1),
          }}
        />

        {/* 4. Left & Right Overlay Titles matching screenshot */}
        <div
          className="relative z-[5] mx-auto flex w-full max-w-[1300px] items-center justify-between gap-6 px-8 transition-all duration-300 ease-out"
          style={{ opacity: textOpacity }}
        >
          {/* Left: Damascus Steel Edition */}
          <div
            className="text-center md:text-left transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${textTranslateLeft}px)` }}
          >
            <h3 className="marq-display text-[26px] uppercase leading-tight md:text-[34px] drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
              Damascus Steel Edition
            </h3>
            <p className="mt-3 text-[15px] font-medium uppercase tracking-[0.3em] text-white/90">
              <span className="text-white/50">|</span>&nbsp;New&nbsp;<span className="text-white/50">|</span>
            </p>
          </div>

          {/* Right: MARQ ADVENTURER + Learn More CTA */}
          <div
            className="text-center md:text-right transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${textTranslateRight}px)` }}
          >
            <h2 className="font-heading text-[56px] font-normal uppercase leading-none text-white md:text-[68px] drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
              MARQ
            </h2>
            <p className="mt-2 text-[15px] font-medium uppercase tracking-[0.35em] text-white/90">
              Adventurer
            </p>
            <span className="mt-4 block h-px w-full bg-white/40" />
            <Link
              href="/p/1228429"
              className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-white transition-colors hover:text-white/70"
            >
              Learn More
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
