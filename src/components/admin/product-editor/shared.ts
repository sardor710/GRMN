import type { CMSProduct, ProductImage, ProductOption, ProductVariant } from "@/lib/cms/types";
import { buttonClass } from "@/components/admin/ui/Button";
import { controlRadius } from "@/components/admin/ui/shape";

/** Draft returned by POST /api/admin/import/garmin (CMSProduct-shaped, not saved). */
export type ProductDraft = Partial<CMSProduct> & Pick<CMSProduct, "name" | "sku" | "price">;

/** The slice of editor form state the preview and variant tools need. */
export interface ProductMediaState {
  images: ProductImage[];
  defaultImageId: string;
  options: ProductOption[];
  variants: ProductVariant[];
}

export const newId = (prefix: string): string =>
  `${prefix}-${
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  }`;

const kztFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatKzt = (value: number | undefined): string =>
  value === undefined || Number.isNaN(value) ? "—" : `${kztFormatter.format(Math.round(value))} ₸`;

export const formatUsd = (value: number | undefined): string =>
  value === undefined || Number.isNaN(value) ? "—" : usdFormatter.format(value);

/** Images to show for a variant (its own picks, else product gallery with the default first). */
export function galleryFor(
  images: ProductImage[],
  defaultImageId: string,
  variant?: ProductVariant,
): ProductImage[] {
  if (variant && variant.imageIds.length) {
    const byId = new Map(images.map((i) => [i.id, i]));
    const own = variant.imageIds.map((id) => byId.get(id)).filter((i): i is ProductImage => Boolean(i));
    if (own.length) return own;
  }
  const def = images.find((i) => i.id === defaultImageId);
  return def ? [def, ...images.filter((i) => i.id !== defaultImageId)] : images;
}

// Class constants for editor sub-components (images, options, variants, import). Buttons come from the
// shared admin primitive, so the shape switch in src/components/admin/ui/shape.ts reaches them too.
export const labelClass = "block text-[12px] font-bold text-black";
export const inputClass = `h-10 w-full border border-[#d9d9d9] bg-white px-3 text-[13px] text-black placeholder:text-[#8c8c8c] hover:border-[#737373] focus:border-black focus:outline-none ${controlRadius}`;
export const smallInputClass = `h-8 w-full border border-[#d9d9d9] bg-white px-2 text-[12px] text-black hover:border-[#737373] focus:border-black focus:outline-none ${controlRadius}`;
export const primaryButtonClass = buttonClass({ variant: "primary", size: "sm" });
export const secondaryButtonClass = buttonClass({ variant: "outline", size: "sm" });
export const linkButtonClass = buttonClass({ variant: "link", size: "sm", className: "h-auto px-0 text-[12px] font-bold" });
