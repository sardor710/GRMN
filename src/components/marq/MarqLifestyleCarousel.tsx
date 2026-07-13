"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { lifestyleSlides, accentColor } from "@/lib/marq";

const DURATION = 6000; // ms per slide

/**
 * Section 5 — auto-advancing lifestyle carousel. Each slide: a full-bleed
 * lifestyle video with a transparent watch render + label overlaid on the left.
 */
export function MarqLifestyleCarousel() {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = lifestyleSlides.length;

  const goTo = useCallback(
    (next: number) => {
      setActive((next + count) % count);
      setTick((t) => t + 1);
    },
    [count]
  );

  useEffect(() => {
    timer.current = setTimeout(() => goTo(active + 1), DURATION);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, tick, goTo]);

  const slide = lifestyleSlides[active];

  return (
    <section className="relative h-[893px] w-full overflow-hidden bg-black">
      {/* lifestyle video per slide (crossfade) */}
      {lifestyleSlides.map((s, i) => (
        <video
          key={s.video}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
          src={s.video}
          poster={s.poster}
          autoPlay={i === active}
          muted
          loop
          playsInline
          preload="none"
        />
      ))}

      {/* left darkening gradient for legibility */}
      <div className="absolute inset-0 z-[2] bg-gradient-to-r from-black/90 via-black/30 to-transparent" />

      {/* watch render */}
      <div className="absolute bottom-0 left-[6%] top-0 z-[4] flex w-[38%] max-w-[440px] items-center">
        <Image
          key={slide.watch}
          src={slide.watch}
          alt={`MARQ ${slide.model}`}
          width={600}
          height={820}
          className="h-auto max-h-[70%] w-full object-contain drop-shadow-2xl"
        />
      </div>

      {/* label + CTA */}
      <div className="absolute left-[6%] top-[16%] z-[5] max-w-[360px]">
        <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.2em] text-white/80">
          <span className="text-white/40">|</span> {slide.edition} <span className="text-white/40">|</span>
        </p>
        <p className="font-heading text-[68px] font-normal uppercase leading-none text-white">MARQ</p>
        <p className="mt-1 text-[18px] font-medium uppercase tracking-[0.3em] text-white">
          {slide.model}
        </p>
        <span
          className="my-4 block h-px w-full max-w-[220px]"
          style={{ backgroundColor: accentColor[slide.accent] }}
        />
        <a
          href={slide.href}
          className="inline-flex items-center gap-1 text-[15px] font-medium text-white transition-colors hover:text-white/70"
        >
          Learn More
          <ChevronRightIcon className="h-4 w-4" />
        </a>
      </div>

      {/* arrows */}
      <button
        type="button"
        aria-label="Previous"
        onClick={() => goTo(active - 1)}
        className="absolute left-3 top-1/2 z-[6] -translate-y-1/2 p-2 text-white/70 transition-colors hover:text-white"
      >
        <ChevronLeftIcon className="h-8 w-8" />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={() => goTo(active + 1)}
        className="absolute right-3 top-1/2 z-[6] -translate-y-1/2 p-2 text-white/70 transition-colors hover:text-white"
      >
        <ChevronRightIcon className="h-8 w-8" />
      </button>

      {/* progress bar */}
      <div className="absolute bottom-8 left-1/2 z-[6] flex w-[46%] max-w-[560px] -translate-x-1/2 gap-2">
        {lifestyleSlides.map((s, i) => (
          <button
            key={s.model + i}
            type="button"
            aria-label={`Go to ${s.model}`}
            onClick={() => goTo(i)}
            className="relative h-[3px] flex-1 overflow-hidden bg-white/25"
          >
            {i === active && (
              <span
                key={tick}
                className="absolute inset-y-0 left-0"
                style={{
                  backgroundColor: "#fff",
                  animation: `marq-progress-fill ${DURATION}ms linear forwards`,
                }}
              />
            )}
            {i < active && <span className="absolute inset-0 bg-white" />}
          </button>
        ))}
      </div>
    </section>
  );
}
