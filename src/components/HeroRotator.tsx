"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { heroSlides } from "@/lib/content";
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "@/components/icons";

const DURATION = 5000;

export function HeroRotator() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((next: number) => {
    setIndex((next + heroSlides.length) % heroSlides.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % heroSlides.length);
    }, DURATION);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused]);

  return (
    <section className="relative h-[460px] w-full overflow-hidden bg-black sm:h-[440px] lg:h-[540px]">
      {/* Slides */}
      {heroSlides.map((slide, i) => (
        <div
          key={slide.title}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === index ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={i !== index}
        >
          <Image
            src={slide.image}
            alt={slide.alt}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover object-center"
          />
          {/* Text overlay */}
          <div className="relative z-10 flex h-full items-center">
            <div className="max-w-[440px] px-6 sm:px-10 lg:pl-[72px] lg:pr-6">
              <h1 className="g-heading text-[30px] text-white sm:text-[34px] lg:text-[40px]">
                {slide.title}
              </h1>
              <p className="mt-2 text-[16px] leading-snug text-white lg:text-[18px]">
                {slide.subtitle}
              </p>
              <a
                href={slide.href}
                className="g-btn g-btn--outline-light mt-5"
              >
                {slide.cta}
              </a>
            </div>
          </div>
        </div>
      ))}

      {/* Prev / Next arrows */}
      <button
        aria-label="Previous slide"
        onClick={() => go(index - 1)}
        className="absolute left-2 top-1/2 z-20 -translate-y-1/2 p-2 text-white/90 transition-colors hover:text-white"
      >
        <ChevronLeftIcon className="h-8 w-8 lg:h-10 lg:w-10" />
      </button>
      <button
        aria-label="Next slide"
        onClick={() => go(index + 1)}
        className="absolute right-2 top-1/2 z-20 -translate-y-1/2 p-2 text-white/90 transition-colors hover:text-white"
      >
        <ChevronRightIcon className="h-8 w-8 lg:h-10 lg:w-10" />
      </button>

      {/* Pause / progress */}
      <button
        aria-label={paused ? "Play" : "Pause"}
        onClick={() => setPaused((p) => !p)}
        className="absolute right-5 top-4 z-20 grid h-9 w-9 place-items-center text-white"
      >
        <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
          {!paused && (
            <circle
              key={index}
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeDasharray="100"
              strokeDashoffset="100"
              pathLength={100}
              style={{ animation: `g-progress-ring ${DURATION}ms linear forwards` }}
            />
          )}
        </svg>
        {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
      </button>
    </section>
  );
}
