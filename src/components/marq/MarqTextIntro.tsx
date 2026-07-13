"use client";

import { useReveal } from "@/hooks/useReveal";

/** Section 2 — "The quest for excellence" dark stone intro. */
export function MarqTextIntro() {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <section
      className="relative flex h-[893px] w-full items-center justify-center bg-cover bg-center px-6"
      style={{ backgroundImage: "url(/marq/images/stone-bg.jpg)", backgroundColor: "#0a0a0a" }}
    >
      <div
        ref={ref}
        className={`marq-reveal ${visible ? "is-visible" : ""} mx-auto max-w-[1000px] text-center`}
      >
        <h2 className="marq-display text-[42px] leading-[1.2] text-white/85 md:text-[58px]">
          The Quest for Excellence Has Broken New Ground
        </h2>
        <p className="mx-auto mt-8 max-w-[820px] text-[18px] font-light leading-[1.8] text-white md:text-[24px]">
          Seven luxury modern tool watches designed as an expression of your ambition and passions
          in life. Inspired by more than 30 years of relentless innovation and refined for a second
          generation, this collection is where luxury and performance collide.
        </p>
      </div>
    </section>
  );
}
