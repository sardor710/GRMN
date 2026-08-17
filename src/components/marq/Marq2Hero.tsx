"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Section 1 — Hero Key Visual with Cinematic Intro Animation:
 * 1. Clouds continuously drift from right to left across the sky.
 * 2. On initial page load:
 *    - Title and watches start completely hidden.
 *    - Title rises up from behind the mountain peaks.
 *    - Watches lineup fades into view in the center foreground.
 */
export function Marq2Hero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger entrance animation slightly after mount
    const timer = setTimeout(() => {
      setMounted(true);
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  return (
    <section
      id="introduction"
      className="relative h-[860px] w-full overflow-hidden bg-black bg-cover bg-center select-none"
      style={{ backgroundImage: "url(/marq/images/kv-bg.jpg)" }}
    >
      {/* 1. SEAMLESS LOOPING CLOUDS (Moving Left) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[550px] overflow-hidden opacity-85 mix-blend-screen">
        <div className="flex w-[200%] h-full animate-[cloudDrift_75s_linear_infinite]">
          <div
            className="w-1/2 h-full bg-cover bg-bottom shrink-0"
            style={{ backgroundImage: "url(/marq/images/cloud.jpg)" }}
          />
          <div
            className="w-1/2 h-full bg-cover bg-bottom shrink-0"
            style={{ backgroundImage: "url(/marq/images/cloud.jpg)" }}
          />
        </div>
      </div>

      {/* 2. TITLE SLOGAN — Emerges from BEHIND the mountain peaks (z-[4]) */}
      <div
        className={`absolute inset-x-0 top-[6%] z-[4] flex justify-center px-4 transition-all duration-[1600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mounted
            ? "translate-y-0 opacity-100"
            : "translate-y-[160px] opacity-0"
        }`}
        style={{ transitionDelay: mounted ? "350ms" : "0ms" }}
      >
        <Image
          src="/marq/images/product-name.png"
          alt="MARQ Collection — The Second Generation"
          width={1148}
          height={600}
          priority
          className="h-auto w-[520px] max-w-[85%] drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)]"
        />
      </div>

      {/* 3. MOUNTAIN SILHOUETTES LAYER (z-[8] - In front of Title, behind Watches) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-[26%] z-[8] h-[900px] bg-cover bg-center"
        style={{ backgroundImage: "url(/marq/images/kv-mountain.png)" }}
      />

      {/* 4. WATCHES LINEUP — Fades into view in foreground (z-[12]) */}
      <div
        className={`absolute bottom-4 left-1/2 z-[12] w-[62%] max-w-[1180px] -translate-x-1/2 transition-all duration-[1500ms] ease-out ${
          mounted
            ? "opacity-100 scale-100"
            : "opacity-0 scale-[0.94]"
        }`}
        style={{ transitionDelay: mounted ? "900ms" : "0ms" }}
      >
        <Image
          src="/marq/images/marq-collection.png"
          alt="MARQ Collection watch lineup"
          width={1600}
          height={542}
          priority
          className="h-auto w-full drop-shadow-[0_30px_45px_rgba(0,0,0,0.95)]"
        />
      </div>

      {/* 5. BOTTOM GRADIENT FADE TO BLACK */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-[220px] bg-gradient-to-b from-transparent via-black/60 to-black" />

      {/* Inline Keyframe for Cloud Drift */}
      <style jsx>{`
        @keyframes cloudDrift {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}
