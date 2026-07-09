import { ProductCard } from "@/components/ProductCard";
import { getProduct } from "@/lib/products";
import { SectionHeading } from "@/components/SectionHeading";

export function RelatedProducts({ ids }: { ids: string[] }) {
  const items = ids.map(getProduct).filter((p) => p !== undefined);
  if (items.length === 0) return null;

  return (
    <section className="bg-neutral-50 py-14">
      <div className="mx-auto max-w-[1280px] px-4">
        <SectionHeading>You May Also Like</SectionHeading>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p!.id} product={p!} />
          ))}
        </div>
      </div>
    </section>
  );
}
