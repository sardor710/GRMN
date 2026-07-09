import Image from "next/image";
import { categoryTiles } from "@/lib/content";
import { SectionHeading } from "@/components/SectionHeading";

export function CategoryGrid() {
  return (
    <section className="bg-white py-8">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="py-6">
          <SectionHeading>Shop by Category</SectionHeading>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categoryTiles.map((tile) => (
            <a
              key={tile.title}
              href={tile.href}
              className="group relative aspect-[16/10] overflow-hidden"
            >
              <Image
                src={tile.image}
                alt={tile.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h3 className="g-heading text-[24px] leading-none text-white">{tile.title}</h3>
                <span className="g-btn g-btn--solid mt-3">SHOP</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
