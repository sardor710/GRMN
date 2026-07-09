import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types";

const swatchColors = ["#111", "#c9c4bd", "#e8792b", "#c9d94b", "#6b7280", "#b8a6d9"];

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/p/${product.id}`}
      className="group relative flex flex-col border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-lg"
    >
      {product.badge && (
        <span
          className={`absolute left-0 top-4 z-10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-white ${
            product.badge === "NEW" ? "bg-[#00a0df]" : "bg-[#5bc2e7]"
          }`}
          style={{ clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)" }}
        >
          {product.badge}
        </span>
      )}

      <div className="relative mx-auto aspect-square w-full max-w-[260px]">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 340px"
          className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      {/* Color swatches */}
      <div className="mt-3 flex gap-1.5">
        {swatchColors.slice(0, 3 + (product.id.charCodeAt(0) % 4)).map((c, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-full border border-neutral-300"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <h3 className="g-heading mt-3 text-[22px] leading-tight text-black">{product.name}</h3>
      <p className="mt-2 text-[14px] leading-snug text-[#5b5b5b]">{product.description}</p>
      <p className="mt-3 text-[15px] text-black">
        <span className="font-medium">
          ${product.price.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD
        </span>
        {product.priceSuffix && (
          <span className="text-[#5b5b5b]"> {product.priceSuffix}</span>
        )}
      </p>
    </Link>
  );
}
