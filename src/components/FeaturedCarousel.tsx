"use client";

import { useRef } from "react";
import Image from "next/image";
import { featuredCards } from "@/lib/content";
import { StarburstBadge } from "@/components/StarburstBadge";
import { ChevronRightIcon } from "@/components/icons";

export function FeaturedCarousel() {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollNext = () => {
    scroller.current?.scrollBy({ left: 320, behavior: "smooth" });
  };

  return (
    <section className="bg-white">
      {/* FEATURED bar */}
      <div className="relative bg-black">
        <div className="flex h-12 items-center justify-center">
          <span className="g-heading text-[13px] tracking-[0.12em] text-white">FEATURED</span>
        </div>
        <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-black" />
      </div>

      {/* Cards */}
      <div className="relative mx-auto max-w-[1440px] px-4 py-10">
        <div
          ref={scroller}
          className="no-scrollbar flex snap-x gap-5 overflow-x-auto scroll-smooth pt-6"
        >
          {featuredCards.map((card) => (
            <a
              key={card.title}
              href={card.href}
              className="group relative flex w-[300px] shrink-0 snap-start flex-col border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-lg"
            >
              <StarburstBadge
                label={card.badge ?? ""}
                className="absolute -left-3 -top-3 h-16 w-16"
              />
              <div className="relative mx-auto aspect-square w-full max-w-[240px]">
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  sizes="240px"
                  className="object-contain"
                />
              </div>
              <h3 className="g-heading mt-4 text-center text-[19px] leading-tight text-black">
                {card.title}
              </h3>
              <p className="mt-2 text-center text-[14px] leading-snug text-[#5b5b5b]">
                {card.description}
              </p>
              {card.fineprint && (
                <p className="mt-auto pt-3 text-center text-[10px] text-neutral-400">
                  {card.fineprint}
                </p>
              )}
            </a>
          ))}
        </div>

        {/* Advance arrow */}
        <button
          aria-label="Next"
          onClick={scrollNext}
          className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-neutral-200 bg-white shadow-md transition-colors hover:bg-neutral-50 md:grid"
        >
          <ChevronRightIcon className="h-6 w-6 text-black" />
        </button>
      </div>
    </section>
  );
}
