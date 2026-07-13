"use client";

import { useReveal } from "@/hooks/useReveal";
import { ChevronRightIcon } from "@/components/icons";

/**
 * Section 4 — Damascus Steel Edition product hero. The watch on its glowing
 * plinth is baked into damascus-bg.jpg; spark PNGs overlay; text flanks it.
 */
export function MarqDamascusHero() {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <section
      className="relative flex h-[893px] w-full items-center overflow-hidden bg-black bg-cover bg-center"
      style={{ backgroundImage: "url(/marq/images/damascus-bg.jpg)" }}
    >
      {/* spark overlays */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-cover bg-center opacity-80 mix-blend-screen"
        style={{ backgroundImage: "url(/marq/images/damascus-bg-spark.png)" }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-cover bg-center opacity-70 mix-blend-screen"
        style={{ backgroundImage: "url(/marq/images/damascus-bg-spark-2.png)" }}
      />

      <div
        ref={ref}
        className={`marq-reveal ${visible ? "is-visible" : ""} relative z-[5] mx-auto flex w-full max-w-[1300px] items-center justify-between gap-6 px-6`}
      >
        {/* left label */}
        <div className="text-center md:text-left">
          <h3 className="marq-display text-[26px] leading-tight md:text-[34px]">
            Damascus Steel Edition
          </h3>
          <p className="mt-3 text-[15px] font-medium uppercase tracking-[0.3em] text-white/90">
            <span className="text-white/50">|</span>&nbsp;New&nbsp;<span className="text-white/50">|</span>
          </p>
        </div>

        {/* right model + CTA */}
        <div className="text-center md:text-right">
          <p className="font-heading text-[56px] font-normal uppercase leading-none text-white md:text-[64px]">
            MARQ
          </p>
          <p className="mt-2 text-[15px] font-medium uppercase tracking-[0.35em] text-white/90">
            Adventurer
          </p>
          <span className="mt-4 block h-px w-full bg-white/40" />
          <a
            href="#"
            className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-white transition-colors hover:text-white/70"
          >
            Learn More
            <ChevronRightIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
