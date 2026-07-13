"use client";

import { useReveal } from "@/hooks/useReveal";

/** Section 11 — "Create your signature look" bands showcase. */
export function MarqBands() {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <section className="w-full bg-black">
      {/* bands imagery with overlaid strap labels */}
      <div
        className="relative aspect-[1920/1080] w-full bg-cover bg-center"
        style={{ backgroundImage: "url(/marq/images/marq-bands-bg.jpg)" }}
      >
        <span className="absolute left-[22%] top-[62%] text-[13px] font-light text-white md:text-[15px]">
          Jacquard-weave nylon
        </span>
        <span className="absolute left-1/2 top-[32%] -translate-x-1/2 text-[13px] font-light text-white md:text-[15px]">
          Leather/FKM rubber hybrid strap
        </span>
        <span className="absolute right-[26%] top-[42%] text-[13px] font-light text-white md:text-[15px]">
          Titanium bracelet
        </span>
      </div>

      {/* heading + copy */}
      <div
        ref={ref}
        className={`marq-reveal ${visible ? "is-visible" : ""} mx-auto max-w-[1000px] px-6 pb-24 pt-12 text-center`}
      >
        <h2 className="marq-display text-[38px] leading-tight text-white/85 md:text-[54px]">
          Create Your Signature Look
        </h2>
        <p className="mx-auto mt-6 max-w-[900px] text-[14px] font-light leading-[1.8] text-white/90 md:text-[15px]">
          Personalize your MARQ modern tool watch to fit your style and ambition with premium
          accessory straps and bracelets. Each is made from the highest-quality materials for
          durability and comfort, including Italian vacchetta and leathers, brushed titanium,
          jacquard-weave nylon and performance silicone rubber. And each offers QuickFit connections,
          so you can change your look in seconds, with no tools required. Finally, you have a
          timepiece as individual as you are — and just as uncompromising.
        </p>
      </div>
    </section>
  );
}
