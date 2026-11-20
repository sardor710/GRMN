import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/types";
import { GarminBadge } from "@/components/GarminBadge";
import { Price } from "@/components/ui/price";
import { toMinor } from "@/lib/money";
import { useAppLocale } from "@/i18n/useAppLocale";

const swatchColors = ["#111", "#c9c4bd", "#e8792b", "#c9d94b", "#6b7280", "#b8a6d9"];

export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("ProductCard");
  const locale = useAppLocale();
  return (
    <Link
      href={`/p/${product.id}`}
      className="group relative flex flex-col border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-lg"
    >
      {product.badge && product.badge !== "NONE" && (
        <GarminBadge badge={product.badge} variant="ribbon" />
      )}

      <div className="relative mx-auto aspect-square w-full max-w-[260px]">
        {product.image&&<Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 340px"
          className="object-contain"
        />}
      </div>

      {/* Color swatches */}
      <div className="mt-3 flex gap-1.5">
        {product.currency!=="KZT"&&swatchColors.slice(0, 3 + (product.id.charCodeAt(0) % 4)).map((c, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-full border border-neutral-300"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <h3 className="g-heading mt-3 text-[22px] leading-tight text-black">{product.name}</h3>
      <p className="mt-2 text-[14px] leading-snug text-[#5b5b5b]">{product.description}</p>
      {/* Task 5a.2: tenge in the page locale (Price.spec.md card rule), never the old USD label. */}
      {toMinor({ major: product.price }) !== null ? (
        <Price
          size="card"
          className="mt-3 text-black"
          locale={locale}
          amount={{ major: product.price }}
          suffix={product.priceSuffix ? (product.priceSuffix === "and up" ? t("andUp") : product.priceSuffix) : undefined}
        />
      ) : (
        <p className="mt-3 text-[16px] font-bold leading-[24px] text-black">{product.priceLabel ?? product.price}</p>
      )}
    </Link>
  );
}
