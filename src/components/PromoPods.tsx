import Image from "next/image";
import { promoPods, halfPods } from "@/lib/content";

export function PromoPods() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* Row 1 — three equal cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {promoPods.map((pod) => (
            <div
              key={pod.title}
              className="flex flex-col border border-neutral-200 bg-white"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden">
                <Image
                  src={pod.image}
                  alt={pod.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 380px"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="g-heading text-[22px] leading-tight text-black">{pod.title}</h3>
                <div className="mt-auto flex justify-end pt-6">
                  <a href={pod.href} className="g-btn g-btn--outline-dark">
                    {pod.cta}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Row 2 — two half-width overlay pods */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {halfPods.map((pod) => (
            <div key={pod.title} className="relative aspect-[2/1] overflow-hidden">
              <Image
                src={pod.image}
                alt={pod.title}
                fill
                sizes="(max-width: 768px) 100vw, 588px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
              <div className="absolute inset-0 flex flex-col justify-end p-6">
                <h3 className="g-heading max-w-[70%] text-[26px] leading-tight text-white">
                  {pod.title}
                </h3>
                <div className="mt-4">
                  <a href={pod.href} className="g-btn g-btn--solid">
                    {pod.cta}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
