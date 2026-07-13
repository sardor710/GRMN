"use client";

import Image from "next/image";
import { useReveal } from "@/hooks/useReveal";

/** Section 12 — Our Legacy. Thin-bordered box: copy left, product-box photo right. */
export function MarqLegacy() {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <section id="legacy" className="w-full bg-black px-6 py-24">
      <div
        ref={ref}
        className={`marq-reveal ${visible ? "is-visible" : ""} mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-8 border border-white/40 p-8 md:grid-cols-2 md:gap-12 md:p-12`}
      >
        <div>
          <h2 className="marq-display text-[40px] leading-none md:text-[52px]">Our Legacy</h2>
          <span className="mt-4 block h-px w-[64px] bg-white/50" />
          <p className="mt-6 max-w-[440px] text-[15px] font-light leading-[1.75] text-white/90">
            The MARQ Collection is designed for those who aspire to the lifestyles we have redefined
            over decades of innovation. For them, we present these magnificent modern tool watches —
            our tribute to their rightful rewards.
          </p>
          <a
            href="#"
            className="mt-8 inline-flex bg-white px-8 py-3 text-[13px] font-medium uppercase tracking-[0.06em] text-black transition-colors hover:bg-white/80"
          >
            Learn More
          </a>
        </div>
        <div>
          <Image
            src="/marq/images/legacy.jpg"
            alt="MARQ premium watch and Garmin presentation box"
            width={1000}
            height={720}
            className="h-auto w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
