import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/types";
import { GarminBadge } from "@/components/GarminBadge";
import { Price } from "@/components/ui/price";
import { toMinor } from "@/lib/money";
import { useAppLocale } from "@/i18n/useAppLocale";

/**
 * garmin.com PLP card (ProductCard.spec.md): no border, `0 2px 3px 1px #E5E5E5` shadow, full-width 300px image
 * (200px wide below 768), text padding 0 16 24, no hover lift (text colour only). Colour swatches are left out:
 * our catalogue has no per-card variant colours, and Garmin shows only real ones.
 */
export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("ProductCard");
  const badgeText = useTranslations("ProductBadge");
  const locale = useAppLocale();
  return (
    <Link
      href={`/p/${product.id}`}
      data-product-card
      className="relative block h-full text-left text-garmin-card-text shadow-garmin-card transition-colors duration-200 hover:text-garmin-black-hover"
    >
      <figure className="m-0 flex h-full flex-col items-center">
        {product.badge && product.badge !== "NONE" && (
          <GarminBadge badge={product.badge} variant="ribbon" labels={{ new: badgeText("new"), sale: badgeText("sale") }} />
        )}

        <div className="relative h-[207px] w-[200px] shrink-0 md:h-[300px] md:w-full">
          {product.image && <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 200px, 360px"
            className="object-contain mix-blend-multiply"
          />}
        </div>

        <figcaption className="flex w-full flex-1 flex-col px-4 pb-6">
          <h3 className="g-heading my-4 text-[20px] leading-[25px] tracking-[0.8px] md:text-[24px] md:leading-[30px]">{product.name}</h3>
          <p className="mb-4 text-[14px] leading-[21px] md:text-[16px] md:leading-[24px]">{product.description}</p>
          <div className="mt-auto flex items-end">
            {/* Task 5a.2: tenge in the page locale (Price.spec.md card rule: strike, then the bold sale price), never a USD label. */}
            {toMinor({ major: product.price }) !== null ? (
              <Price
                size="card"
                locale={locale}
                amount={{ major: product.price }}
                compareAt={product.compareAt !== undefined ? { major: product.compareAt } : null}
                unconverted={product.currency === "USD"}
                suffix={product.priceSuffix ? (product.priceSuffix === "and up" ? t("andUp") : product.priceSuffix) : undefined}
              />
            ) : (
              <p className="text-[16px] font-bold leading-[24px]">{product.priceLabel ?? product.price}</p>
            )}
          </div>
        </figcaption>
      </figure>
    </Link>
  );
}
