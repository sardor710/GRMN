"use client";

import { useRef } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { productCards } from "@/lib/marq";

const accentVar: Record<string, string> = {
  red: "var(--marq-red)",
  green: "var(--marq-green)",
  gold: "var(--marq-gold)",
};

/** Section 13 — final product carousel over the starry collection background. */
export function MarqProductCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    track.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  };

  return (
    <section
      id="collection"
      className="relative w-full bg-black bg-cover bg-center py-20"
      style={{ backgroundImage: "url(/marq/images/marq-spec-bg.jpg)" }}
    >
      <div className="mx-auto mb-4 flex max-w-[560px] justify-center px-6">
        <Image
          src="/marq/images/product-name.png"
          alt="MARQ Collection — The Second Generation"
          width={1148}
          height={600}
          className="h-auto w-[420px] max-w-full"
        />
      </div>

      <div className="relative mx-auto max-w-[1320px] px-10">
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 p-2 text-white/50 transition-colors hover:text-white"
        >
          <ChevronLeftIcon className="h-8 w-8" />
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 p-2 text-white/50 transition-colors hover:text-white"
        >
          <ChevronRightIcon className="h-8 w-8" />
        </button>

        <div ref={track} className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth">
          {productCards.map((card, i) => (
            <div key={card.model + i} className="group w-[210px] shrink-0 text-center">
              <div className="relative">
                {card.isNew && (
                  <span className="absolute left-2 top-0 border border-white/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-white">
                    New
                  </span>
                )}
                <Image
                  src={card.image}
                  alt={`MARQ ${card.model} — ${card.edition}`}
                  width={420}
                  height={520}
                  className="mx-auto h-auto w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <p className="mt-2 text-[11px] font-light uppercase tracking-[0.12em] text-white/55">
                {card.edition}
              </p>
              <h3 className="mt-1 inline-block pb-2 font-heading text-[19px] font-normal uppercase leading-none text-white">
                {card.model}
              </h3>
              <span
                className="mx-auto block h-[3px] w-full max-w-[130px]"
                style={{ backgroundColor: accentVar[card.accent] }}
              />
              <a
                href={card.href}
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-white transition-colors hover:text-white/70"
              >
                Learn More
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
