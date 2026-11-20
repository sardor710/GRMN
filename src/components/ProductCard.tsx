import Image from "next/image";
import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/types";
import { GarminBadge } from "@/components/GarminBadge";
import { Price } from "@/components/ui/price";
import { toMinor } from "@/lib/money";
import { useAppLocale } from "@/i18n/useAppLocale";
import { CARD_COLOR_MAX } from "@/lib/catalog/card-colors";

/** Catalogue compare mode (task C-c): the card's "Add to comparison" control. */
export interface ProductCardCompare {
  /** The product (in any size) is in the comparison. */
  selected: boolean;
  /** Five products are chosen already and this one is not among them. */
  blocked: boolean;
  onToggle: () => void;
  /** Id of the visible note that explains `blocked`. */
  describedBy?: string;
}

/**
 * garmin.com `g-color-swatches` (ProductCard.spec.md): 16px top margin, a row of 16x16 round dots 8px apart, each
 * with an inner shadow over the swatch photo. Only real colours reach here (src/lib/catalog/card-colors.ts), at most
 * nine, no "+N". The dots are decoration for sighted shoppers (a title on hover); the colour names are read once.
 */
function ColorDots({ colors, label }: { colors: NonNullable<Product["colors"]>; label: string }) {
  return (
    <div data-card-colors className="mt-4 flex items-center">
      <span className="sr-only">{label}</span>
      {colors.slice(0, CARD_COLOR_MAX).map((color) => (
        <span
          key={color.label}
          title={color.label}
          aria-hidden="true"
          data-card-color={color.label}
          className="relative mr-2 block size-4 shrink-0 rounded-full after:absolute after:inset-0 after:rounded-full after:shadow-garmin-swatch after:content-['']"
        >
          {color.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- 16px swatch photo (garmin.com or /uploads), like VariantPicker
            <img src={color.image} alt="" width={16} height={16} loading="lazy" className="block size-4 rounded-full object-cover" />
          ) : (
            <svg viewBox="0 0 16 16" className="block size-4">
              <circle cx="8" cy="8" r="8" fill={color.hex} />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}

/** The ✓ of the selected state (the g-checkbox check path). */
function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-8 fill-current">
      <path d="M6.2 12.6 1.6 8l1.4-1.4 3.2 3.2 6.8-6.8L14.4 4.4z" />
    </svg>
  );
}

/**
 * garmin.com PLP card (ProductCard.spec.md): no border, `0 2px 3px 1px #E5E5E5` shadow, full-width 300px image
 * (200px wide below 768), text padding 0 16 24, no hover lift (text colour only). Colour dots (task C-d) sit between
 * the image and the name only when the product's data has real swatches; otherwise the name keeps its 16px top margin.
 *
 * With `compare` (catalogue compare mode, Compare.spec.md): the card turns #F2F2F2 with a 16px action row on top
 * holding the 56px black "+" control; a chosen card is white with a 2px black outline and shows ✓ "Added". The
 * control is a sibling of the product link, never inside it, so it cannot navigate.
 */
export function ProductCard({ product, compare }: { product: Product; compare?: ProductCardCompare }) {
  const t = useTranslations("ProductCard");
  const badgeText = useTranslations("ProductBadge");
  const tc = useTranslations("CompareBar");
  const locale = useAppLocale();
  const body = (
    <figure className="m-0 flex h-full flex-1 flex-col items-center">
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
        {product.colors && product.colors.length > 1 && (
          <ColorDots colors={product.colors} label={t("colors", { list: product.colors.slice(0, CARD_COLOR_MAX).map((c) => c.label).join(", ") })} />
        )}
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
  );

  if (!compare) {
    return (
      <Link
        href={`/p/${product.id}`}
        data-product-card
        className="relative block h-full text-left text-garmin-card-text shadow-garmin-card transition-colors duration-200 hover:text-garmin-black-hover"
      >
        {body}
      </Link>
    );
  }

  const { selected, blocked, onToggle, describedBy } = compare;
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    // Belt and braces: the control is not inside the link, and nothing above it may treat the click as navigation.
    event.preventDefault();
    event.stopPropagation();
    if (!blocked) onToggle();
  };
  return (
    <div
      data-product-card
      data-compare-selected={selected ? "" : undefined}
      className={`relative flex h-full flex-col text-left text-garmin-card-text shadow-garmin-card ${selected ? "bg-white outline-2 outline-black" : "bg-muted"}`}
    >
      <div className="flex items-center justify-end p-4">
        <button
          type="button"
          aria-pressed={selected}
          aria-disabled={blocked || undefined}
          aria-describedby={blocked ? describedBy : undefined}
          onClick={toggle}
          className="group flex items-center gap-3 text-[14px] font-bold leading-[21px] text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ring aria-disabled:cursor-not-allowed"
        >
          <span>{selected ? tc("added") : tc("add")}</span>
          <span className="sr-only">, {product.name}</span>
          <span
            aria-hidden="true"
            className={`grid size-14 shrink-0 place-items-center text-[40px] leading-[56px] transition-colors duration-200 ${
              selected ? "text-black" : blocked ? "bg-garmin-disabled text-black" : "bg-black text-white group-hover:bg-garmin-black-hover"
            }`}
          >
            {selected ? <CheckMark /> : "+"}
          </span>
        </button>
      </div>
      <Link href={`/p/${product.id}`} className="relative flex flex-1 flex-col transition-colors duration-200 hover:text-garmin-black-hover">
        {body}
      </Link>
    </div>
  );
}
