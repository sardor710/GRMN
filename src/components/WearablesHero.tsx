import Image from "next/image";
import { watchFamilies } from "@/lib/products";

export function WearablesHero() {
  return (
    <section className="relative w-full overflow-hidden">
      <Image
        src="/images/wearables-banner-bg.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="relative mx-auto max-w-[1280px] px-4 py-12">
        <h1 className="g-heading text-center text-[30px] text-black lg:text-[36px]">
          Most Popular Smartwatches
        </h1>
        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {watchFamilies.map((fam) => (
            <a key={fam.name} href="#" className="group flex flex-col items-center text-center">
              <div className="relative h-[200px] w-full">
                <Image
                  src={fam.image}
                  alt={fam.name}
                  fill
                  sizes="220px"
                  className="object-contain transition-transform duration-300 group-hover:-translate-y-1"
                />
              </div>
              <h3 className="g-heading mt-3 text-[22px] text-black">{fam.name}</h3>
              <p className="mt-1 max-w-[180px] text-[14px] text-neutral-700">{fam.tagline}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
