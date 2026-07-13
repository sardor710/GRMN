"use client";

import Image from "next/image";
import { useReveal } from "@/hooks/useReveal";
import { materialPanels } from "@/lib/marq";
import type { MarqMaterialPanel } from "@/types/marq";

function Panel({ panel }: { panel: MarqMaterialPanel }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const watchLeft = panel.imageSide === "left";
  return (
    <div
      className="relative flex h-[893px] w-full items-center bg-black bg-cover bg-center"
      style={{ backgroundImage: `url(${panel.background})` }}
    >
      <div
        ref={ref}
        className={`marq-reveal ${visible ? "is-visible" : ""} mx-auto grid w-full max-w-[1300px] grid-cols-1 items-center gap-6 px-6 md:grid-cols-2`}
      >
        <div className={watchLeft ? "order-1" : "order-1 md:order-2"}>
          <Image
            src={panel.watch}
            alt={panel.title}
            width={900}
            height={720}
            className="mx-auto h-auto w-full max-w-[560px] object-contain"
          />
        </div>
        <div
          className={`${watchLeft ? "order-2 md:text-left" : "order-2 md:order-1 md:text-left"} text-center`}
        >
          <h3 className="marq-display text-[30px] leading-tight md:text-[40px]">{panel.title}</h3>
          <span className="mx-auto mt-4 block h-px w-[64px] bg-white/50 md:mx-0" />
          <p className="mx-auto mt-5 max-w-[420px] text-[15px] font-light leading-[1.75] text-white/90 md:mx-0">
            {panel.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Section 9 — three stacked material feature panels. */
export function MarqMaterials() {
  return (
    <section className="w-full bg-black">
      {materialPanels.map((p) => (
        <Panel key={p.title} panel={p} />
      ))}
    </section>
  );
}
