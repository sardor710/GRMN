"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { lifestyleSlides, accentColor } from "@/lib/marq";

const DURATION = 6000; // ms per slide

interface ModelSettings {
  watchWidth: number; // in px
  watchLeft: number; // in %
  watchBottom: number; // in px
  videoSize: number; // in %
  videoTop: number; // in %
  videoLeft: number; // in %
}

// Precision tuned coordinates per model
const MODEL_SETTINGS: Record<string, ModelSettings> = {
  CAPTAIN: {
    watchWidth: 380,
    watchLeft: 27,
    watchBottom: 60,
    videoSize: 53.2,
    videoTop: 50.4,
    videoLeft: 51.9,
  },
  GOLFER_CARBON: {
    watchWidth: 380,
    watchLeft: 27,
    watchBottom: 60,
    videoSize: 52.6,
    videoTop: 47.0,
    videoLeft: 50.6,
  },
  ATHLETE_CARBON: {
    watchWidth: 380,
    watchLeft: 27,
    watchBottom: 60,
    videoSize: 52.0,
    videoTop: 54.4,
    videoLeft: 49.7,
  },
  GOLFER_2: {
    watchWidth: 380,
    watchLeft: 27,
    watchBottom: 60,
    videoSize: 53.4,
    videoTop: 50.5,
    videoLeft: 51.2,
  },
  ATHLETE_2: {
    watchWidth: 380,
    watchLeft: 27,
    watchBottom: 60,
    videoSize: 56.8,
    videoTop: 53.5,
    videoLeft: 51.7,
  },
  ADVENTURER: {
    watchWidth: 380,
    watchLeft: 27,
    watchBottom: 60,
    videoSize: 56.2,
    videoTop: 48.3,
    videoLeft: 51.7,
  },
  AVIATOR: {
    watchWidth: 380,
    watchLeft: 27,
    watchBottom: 60,
    videoSize: 54.6,
    videoTop: 50.8,
    videoLeft: 52.3,
  },
};

const SLIDE_KEYS = [
  "CAPTAIN",
  "GOLFER_CARBON",
  "ATHLETE_CARBON",
  "GOLFER_2",
  "ATHLETE_2",
  "ADVENTURER",
  "AVIATOR",
];

/**
 * Section 5 — Auto-advancing Lifestyle Carousel
 * Features:
 * - High-res lifestyle background image per watch model
 * - Authentic circular AMOLED watchface video with sapphire crystal reflection
 * - Permanent calibrated watch sizing & coordinates per model
 * - Subtle Carousel Play/Pause button next to progress bars
 */
export function MarqLifestyleCarousel() {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const count = lifestyleSlides.length;

  const goTo = useCallback(
    (next: number) => {
      setActive((next + count) % count);
      setTick((t) => t + 1);
    },
    [count]
  );

  useEffect(() => {
    if (!autoPlay) return;
    timer.current = setTimeout(() => goTo(active + 1), DURATION);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, tick, autoPlay, goTo]);

  // Ensure active slide video starts playing immediately on slide switch
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [active]);

  const slide = lifestyleSlides[active];
  const slideKey = SLIDE_KEYS[active] || "CAPTAIN";
  const currentSettings = MODEL_SETTINGS[slideKey] || MODEL_SETTINGS.CAPTAIN;

  return (
    <section id="product" className="relative h-[893px] w-full overflow-hidden bg-black select-none">
      {/* 1. Lifestyle Background Image per Slide (Crossfading) */}
      {lifestyleSlides.map((s, i) => (
        <div
          key={s.poster + i}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out ${
            i === active ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
          }`}
          style={{ backgroundImage: `url(${s.poster})` }}
        />
      ))}

      {/* 2. Left Vignette Gradient for Text Contrast */}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-r from-black/85 via-black/40 to-transparent" />

      {/* 3. Text / Edition Details Overlay (Left) */}
      <div className="absolute left-[6%] top-[24%] z-[10] max-w-[380px]">
        <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.25em] text-white/80">
          <span className="text-white/40">|</span> {slide.edition} <span className="text-white/40">|</span>
        </p>
        <h2 className="font-heading text-[64px] font-normal uppercase leading-none text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] md:text-[76px]">
          MARQ
        </h2>
        <p className="mt-1 text-[20px] font-medium uppercase tracking-[0.3em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          {slide.model}
        </p>
        <span
          className="my-5 block h-[2px] w-full max-w-[200px]"
          style={{ backgroundColor: accentColor[slide.accent] || "#fff" }}
        />
        <a
          href={slide.href}
          className="inline-flex items-center gap-1.5 text-[15px] font-medium uppercase tracking-wider text-white transition-colors hover:text-white/70"
        >
          Learn More
          <ChevronRightIcon className="h-4 w-4" />
        </a>
      </div>

      {/* 4. Watch with Calibrated Coordinates & AMOLED Dial Video */}
      <div
        className="absolute z-[8] flex items-end justify-center transition-all duration-75"
        style={{
          bottom: `${currentSettings.watchBottom}px`,
          left: `${currentSettings.watchLeft}%`,
          width: `${currentSettings.watchWidth}px`,
          maxWidth: `${currentSettings.watchWidth}px`,
        }}
      >
        <div className="relative flex items-center justify-center w-full aspect-[600/850]">
          {/* Watch Body & Casing Base */}
          <Image
            key={slide.watch}
            src={slide.watch}
            alt={`MARQ ${slide.model}`}
            width={600}
            height={850}
            priority
            className="relative z-[2] h-full w-full object-contain pointer-events-none drop-shadow-[0_25px_50px_rgba(0,0,0,0.95)]"
          />

          {/* Animated Circular Watchface Video */}
          <div
            className="absolute z-[5] overflow-hidden rounded-full aspect-square shadow-[inset_0_0_8px_rgba(0,0,0,0.9)]"
            style={{
              top: `${currentSettings.videoTop}%`,
              left: `${currentSettings.videoLeft}%`,
              width: `${currentSettings.videoSize}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <video
              ref={videoRef}
              key={slide.video}
              src={slide.video}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="h-full w-full object-cover scale-[1.02]"
            />
            {/* Subtle sapphire glass reflection overlay */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 via-transparent to-transparent opacity-40" />
          </div>
        </div>
      </div>

      {/* 5. Navigation Arrows */}
      <button
        type="button"
        aria-label="Previous Slide"
        onClick={() => goTo(active - 1)}
        className="absolute left-4 top-1/2 z-[20] -translate-y-1/2 rounded-full p-3 text-white/70 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white"
      >
        <ChevronLeftIcon className="h-9 w-9 drop-shadow-lg" />
      </button>
      <button
        type="button"
        aria-label="Next Slide"
        onClick={() => goTo(active + 1)}
        className="absolute right-4 top-1/2 z-[20] -translate-y-1/2 rounded-full p-3 text-white/70 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white"
      >
        <ChevronRightIcon className="h-9 w-9 drop-shadow-lg" />
      </button>

      {/* 6. Progress Indicator Bar with Clean Play/Pause Button */}
      <div className="absolute bottom-7 left-1/2 z-[20] flex items-center justify-center -translate-x-1/2 gap-3 w-full max-w-[620px] px-4">
        {/* Play / Pause Toggle Button */}
        <button
          type="button"
          onClick={() => setAutoPlay(!autoPlay)}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/60 border border-white/30 text-white/80 hover:bg-white hover:text-black hover:border-white transition-all backdrop-blur-md shrink-0 shadow-lg"
          title={autoPlay ? "Pause Carousel" : "Play Carousel"}
          aria-label={autoPlay ? "Pause Carousel" : "Play Carousel"}
        >
          {autoPlay ? (
            <span className="text-[9px] font-mono font-bold tracking-tighter">❚❚</span>
          ) : (
            <span className="text-[9px] font-mono font-bold ml-0.5">▶</span>
          )}
        </button>

        {/* Progress Bars */}
        <div className="flex flex-1 gap-2">
          {lifestyleSlides.map((s, i) => (
            <button
              key={s.model + s.edition + i}
              type="button"
              aria-label={`Go to slide ${i + 1} - ${s.model}`}
              onClick={() => goTo(i)}
              className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/30 transition-all hover:bg-white/50"
            >
              {i === active && (
                <span
                  key={tick}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    backgroundColor: accentColor[s.accent] || "#fff",
                    animation: autoPlay ? `marq-progress-fill ${DURATION}ms linear forwards` : "none",
                    width: autoPlay ? undefined : "100%",
                  }}
                />
              )}
              {i < active && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: accentColor[s.accent] || "#fff" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
